"""
Two-phase EfficientNet-B0 fine-tuning with reproducibility, imbalance handling,
temperature calibration and best-checkpoint saving.

Phase 1 (warmup)  : backbone frozen, train the classifier head only.
Phase 2 (fine-tune): unfreeze the last blocks and train them at a lower LR.

Run:
    cd ml-py
    python training/prepare_dataset.py      # build train/validation/test splits
    python training/train.py                # train
    python training/evaluate.py             # held-out metrics + confusion matrix
"""
import sys
from pathlib import Path

# Running `python training/train.py` puts training/ on sys.path, not ml-py/, so
# `import app...` fails. Add the project root explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.tls  # noqa: F401  (configures the CA bundle before weight downloads)

import json
import math
import os
import random
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

from app.device import resolve_device
from app.preprocessing import PREPROCESSING_DESCRIPTION, inference_transform, training_transform


def project_paths():
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
    return (
        Path(os.getenv("DATASET_DIR", str(base / "dataset"))),
        Path(os.getenv("MODELS_DIR", str(base / "models"))),
    )


def seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    loss_sum = correct = total = 0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        outputs = model(images)
        loss_sum += criterion(outputs, labels).item() * labels.size(0)
        correct += (outputs.argmax(1) == labels).sum().item()
        total += labels.size(0)
    return loss_sum / max(total, 1), correct / max(total, 1)


@torch.no_grad()
def collect_logits(model, loader, device):
    """Cache validation logits so temperature can be fitted without re-running
    the network on every optimisation step."""
    model.eval()
    all_logits, all_labels = [], []
    for images, labels in loader:
        all_logits.append(model(images.to(device)).detach().cpu())
        all_labels.append(labels)
    return torch.cat(all_logits), torch.cat(all_labels)


def fit_temperature(logits: torch.Tensor, labels: torch.Tensor) -> float:
    """Single-parameter temperature scaling (Guo et al., 2017).

    An uncalibrated network is typically over-confident, which makes a fixed
    confidence threshold behave unpredictably. Dividing logits by a fitted T
    makes the reported confidence mean something.
    """
    log_temperature = torch.zeros(1, requires_grad=True)
    optimizer = optim.LBFGS([log_temperature], lr=0.05, max_iter=120)
    criterion = nn.CrossEntropyLoss()

    def closure():
        optimizer.zero_grad()
        loss = criterion(logits / log_temperature.exp(), labels)
        loss.backward()
        return loss

    optimizer.step(closure)
    temperature = float(log_temperature.exp().item())

    # A tiny or unrepresentative validation split can fit an absurd temperature
    # that flattens every confidence to noise. Keep it in a sane band.
    if not math.isfinite(temperature):
        return 1.0
    return min(max(temperature, 0.5), 5.0)


def train_model() -> None:
    dataset_dir, models_dir = project_paths()
    models_dir.mkdir(parents=True, exist_ok=True)
    train_dir, val_dir = dataset_dir / "train", dataset_dir / "validation"
    if not train_dir.exists() or not val_dir.exists():
        raise SystemExit("Missing split folders. Run training/prepare_dataset.py first.")

    seed = int(os.getenv("TRAIN_SEED", "42"))
    seed_everything(seed)

    batch_size = int(os.getenv("BATCH_SIZE", "32"))
    epochs = int(os.getenv("EPOCHS", "30"))
    warmup_epochs = int(os.getenv("WARMUP_EPOCHS", "3"))
    patience = int(os.getenv("EARLY_STOPPING_PATIENCE", "7"))
    num_workers = int(os.getenv("NUM_WORKERS", "4"))
    device = resolve_device()
    print(f"Training on {device}")

    train_set = datasets.ImageFolder(str(train_dir), training_transform())
    val_set = datasets.ImageFolder(str(val_dir), inference_transform())
    if not len(train_set) or not len(val_set):
        raise SystemExit("Training and validation sets must both contain images.")

    class_to_idx = train_set.class_to_idx
    idx_to_class = {str(index): name for name, index in class_to_idx.items()}
    if val_set.class_to_idx != class_to_idx:
        raise SystemExit("Train/validation class ordering differs; recreate splits before training.")

    counts = torch.bincount(torch.tensor(train_set.targets), minlength=len(train_set.classes)).float()
    imbalance_ratio = float(counts.max() / counts.min()) if counts.min() > 0 else float("inf")
    use_sampler = (
        os.getenv("IMBALANCE_STRATEGY", "sampler").lower() == "sampler"
        and imbalance_ratio >= float(os.getenv("IMBALANCE_RATIO", "2.0"))
    )
    sampler = (
        WeightedRandomSampler(
            (1.0 / counts[torch.tensor(train_set.targets)]).double(), len(train_set), replacement=True
        )
        if use_sampler
        else None
    )
    print(
        f"{len(train_set)} train / {len(val_set)} val images across {len(train_set.classes)} classes "
        f"(imbalance {imbalance_ratio:.2f}, sampler={'on' if use_sampler else 'off'})"
    )

    loader_kwargs = {"num_workers": num_workers, "pin_memory": device.type == "cuda"}
    if num_workers > 0:
        loader_kwargs["persistent_workers"] = True
    train_loader = DataLoader(
        train_set, batch_size=batch_size, sampler=sampler, shuffle=sampler is None, **loader_kwargs
    )
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False, **loader_kwargs)

    model = efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT)
    for parameter in model.features.parameters():
        parameter.requires_grad = False
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(train_set.classes))
    model.to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=float(os.getenv("LABEL_SMOOTHING", "0.05")))
    classifier_lr = float(os.getenv("CLASSIFIER_LR", "0.001"))
    backbone_lr = float(os.getenv("BACKBONE_LR", "0.0001"))
    weight_decay = float(os.getenv("WEIGHT_DECAY", "0.0001"))

    # Built once. The previous version rebuilt the optimizer inside the epoch
    # loop, which threw away AdamW's moment estimates on every single epoch.
    optimizer = optim.AdamW(
        [{"params": model.classifier.parameters(), "lr": classifier_lr}],
        weight_decay=weight_decay,
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))

    history, best_loss, stale = [], float("inf"), 0
    best_accuracy = 0.0
    started = time.time()

    for epoch in range(1, epochs + 1):
        fine_tuning = epoch > warmup_epochs

        if epoch == warmup_epochs + 1:
            # Unfreeze the last three blocks and give them their own param group,
            # keeping the head's optimizer state intact.
            for block in list(model.features.children())[-3:]:
                for parameter in block.parameters():
                    parameter.requires_grad = True
            optimizer.add_param_group(
                {
                    "params": [p for p in model.features.parameters() if p.requires_grad],
                    "lr": backbone_lr,
                }
            )
            scheduler = optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(epochs - warmup_epochs, 1)
            )
            print(f"Unfroze backbone tail at epoch {epoch}.")

        model.train()
        loss_sum = correct = total = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            outputs = model(images)
            batch_loss = criterion(outputs, labels)
            batch_loss.backward()
            optimizer.step()
            loss_sum += batch_loss.item() * labels.size(0)
            correct += (outputs.argmax(1) == labels).sum().item()
            total += labels.size(0)
        scheduler.step()

        val_loss, val_accuracy = evaluate(model, val_loader, criterion, device)
        row = {
            "epoch": epoch,
            "phase": "fine_tune" if fine_tuning else "warmup",
            "train_loss": loss_sum / max(total, 1),
            "train_accuracy": correct / max(total, 1),
            "val_loss": val_loss,
            "val_accuracy": val_accuracy,
        }
        history.append(row)
        print(
            f"epoch {epoch}/{epochs} {row['phase']}: "
            f"train_acc={row['train_accuracy']:.3f} val_loss={val_loss:.4f} val_acc={val_accuracy:.3f}",
            flush=True,
        )

        if val_loss < best_loss - 1e-4:
            best_loss, stale = val_loss, 0
            best_accuracy = val_accuracy
            torch.save(
                {
                    "format_version": 2,
                    "architecture": "efficientnet_b0",
                    "model_state_dict": model.state_dict(),
                    "idx_to_class": idx_to_class,
                    "class_to_idx": class_to_idx,
                    "preprocessing": PREPROCESSING_DESCRIPTION,
                    "image_size": 224,
                    "best_validation_loss": val_loss,
                    "best_validation_accuracy": val_accuracy,
                    "epoch": epoch,
                },
                models_dir / "fish_model.pth",
            )
        else:
            stale += 1
            if stale >= patience:
                print(f"Early stopping at epoch {epoch}.")
                break

    # Reload the best weights, then calibrate on the validation set.
    checkpoint = torch.load(models_dir / "fish_model.pth", map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    logits, labels = collect_logits(model, val_loader, device)
    temperature = fit_temperature(logits, labels)
    print(f"Fitted calibration temperature: {temperature:.4f}")

    checkpoint["temperature"] = temperature
    torch.save(checkpoint, models_dir / "fish_model.pth")

    (models_dir / "classes.json").write_text(json.dumps(idx_to_class, indent=2), encoding="utf-8")
    (models_dir / "training_history.json").write_text(
        json.dumps(
            {
                "seed": seed,
                "device": str(device),
                "num_classes": len(train_set.classes),
                "train_images": len(train_set),
                "validation_images": len(val_set),
                "class_counts": counts.tolist(),
                "imbalance_ratio": imbalance_ratio,
                "imbalance_strategy": "weighted_sampler" if use_sampler else "none",
                "best_validation_loss": best_loss,
                "best_validation_accuracy": best_accuracy,
                "temperature": temperature,
                "epochs": history,
                "training_seconds": time.time() - started,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Best validation accuracy: {best_accuracy:.4f}")


if __name__ == "__main__":
    train_model()
