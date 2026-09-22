"""
Genuine held-out test evaluation. Refuses to score classes without test samples.

Reports top-1/3/5 accuracy, macro and weighted F1, the confusion matrix, the
most-confused species pairs, and — because the API rejects low-confidence
predictions — what the configured thresholds actually do to this split.

Run:
    cd ml-py && python training/evaluate.py
Writes models/evaluation_report.json.
"""
import sys
from pathlib import Path

# Running `python training/evaluate.py` puts training/ on sys.path, not ml-py/, so
# `import app...` fails. Add the project root explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.tls  # noqa: F401  (configures the CA bundle before weight downloads)

import json
import math
import os
from collections import Counter
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from torchvision import datasets

from app.device import resolve_device
from app.modeling import create_model, unpack_checkpoint
from app.preprocessing import inference_transform


def evaluate_model() -> None:
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
    data_dir = Path(os.getenv("DATASET_DIR", str(base / "dataset")))
    models_dir = Path(os.getenv("MODELS_DIR", str(base / "models")))

    classes = json.loads((models_dir / "classes.json").read_text(encoding="utf-8"))
    num_classes = len(classes)
    test_set = datasets.ImageFolder(str(data_dir / "test"), inference_transform())

    if test_set.class_to_idx != {name: int(index) for index, name in classes.items()}:
        raise SystemExit("Test class order differs from classes.json; do not evaluate this split.")

    counts = Counter(test_set.targets)
    missing = [classes[str(i)] for i in range(num_classes) if not counts[i]]
    if missing:
        raise SystemExit(
            f"No held-out test samples for {len(missing)} classes; evaluation is not "
            f"meaningful: {missing[:10]}"
        )

    device = resolve_device()
    checkpoint = torch.load(models_dir / "fish_model.pth", map_location=device, weights_only=False)
    state, metadata = unpack_checkpoint(checkpoint)
    if metadata.get("idx_to_class") != classes:
        raise SystemExit("Checkpoint/class mapping mismatch; refusing unsafe evaluation.")

    temperature = float(metadata.get("temperature", 1.0) or 1.0)

    model = create_model(num_classes)
    model.load_state_dict(state)
    model.to(device).eval()

    loader = DataLoader(
        test_set, batch_size=int(os.getenv("EVAL_BATCH_SIZE", "32")), shuffle=False
    )

    targets: list[int] = []
    predictions: list[int] = []
    topk_indices: list[list[int]] = []
    top_probabilities: list[float] = []
    margins: list[float] = []
    entropies: list[float] = []

    with torch.inference_mode():
        for images, labels in loader:
            logits = model(images.to(device)) / temperature
            probabilities = torch.softmax(logits, dim=1).cpu()
            top = probabilities.topk(min(5, num_classes), dim=1)

            targets += labels.tolist()
            predictions += top.indices[:, 0].tolist()
            topk_indices += top.indices.tolist()
            top_probabilities += top.values[:, 0].tolist()
            if num_classes > 1:
                margins += (top.values[:, 0] - top.values[:, 1]).tolist()
            entropies += (
                -(probabilities.clamp_min(1e-12) * probabilities.clamp_min(1e-12).log()).sum(1)
                / math.log(num_classes)
            ).tolist()

    total = len(targets)
    top_accuracy = {
        f"top_{k}_accuracy": sum(t in row[:k] for t, row in zip(targets, topk_indices)) / total
        for k in (1, 3, 5)
    }

    matrix = [[0] * num_classes for _ in range(num_classes)]
    for truth, predicted in zip(targets, predictions):
        matrix[truth][predicted] += 1

    per_class: dict[str, dict] = {}
    f1_scores: list[float] = []
    weighted_f1 = 0.0
    for index in range(num_classes):
        name = classes[str(index)]
        true_positive = matrix[index][index]
        false_positive = sum(matrix[row][index] for row in range(num_classes)) - true_positive
        false_negative = sum(matrix[index]) - true_positive
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        support = sum(matrix[index])
        per_class[name] = {"support": support, "precision": precision, "recall": recall, "f1": f1}
        f1_scores.append(f1)
        weighted_f1 += f1 * support / total

    most_confused = sorted(
        (
            (matrix[i][j], classes[str(i)], classes[str(j)])
            for i in range(num_classes)
            for j in range(num_classes)
            if i != j and matrix[i][j]
        ),
        reverse=True,
    )[:20]

    # Generic collapse check: if the model funnels many images into one class
    # regardless of the truth, that class dominates the prediction counts. This
    # replaces the old hardcoded "Flower Horn" special case — the symptom was
    # never specific to that species.
    prediction_counts = Counter(predictions)
    most_predicted_index, most_predicted_count = prediction_counts.most_common(1)[0]
    collapse_share = most_predicted_count / total

    # What the live API's rejection rules do to this split.
    confidence_threshold = float(os.getenv("FISH_CONFIDENCE_THRESHOLD", "0.45"))
    margin_threshold = float(os.getenv("FISH_MARGIN_THRESHOLD", "0.10"))
    entropy_threshold = float(os.getenv("FISH_ENTROPY_THRESHOLD", "0.55"))

    accepted = [
        index
        for index in range(total)
        if top_probabilities[index] >= confidence_threshold
        and (not margins or margins[index] >= margin_threshold)
        and entropies[index] <= entropy_threshold
    ]
    accepted_correct = sum(1 for i in accepted if predictions[i] == targets[i])

    open_set = {
        "confidence_threshold": confidence_threshold,
        "margin_threshold": margin_threshold,
        "entropy_threshold": entropy_threshold,
        "accepted_fraction": len(accepted) / total,
        "rejected_fraction": 1 - len(accepted) / total,
        # The number users actually experience: when the app does name a species,
        # how often is it right?
        "accuracy_on_accepted": accepted_correct / len(accepted) if accepted else None,
        "mean_top1_confidence": sum(top_probabilities) / total,
        "mean_normalized_entropy": sum(entropies) / total,
    }

    result = {
        "test_images": total,
        "num_classes": num_classes,
        "temperature": temperature,
        **top_accuracy,
        "macro_precision": sum(x["precision"] for x in per_class.values()) / num_classes,
        "macro_recall": sum(x["recall"] for x in per_class.values()) / num_classes,
        "macro_f1": sum(f1_scores) / len(f1_scores),
        "weighted_f1": weighted_f1,
        "prediction_collapse": {
            "most_predicted_class": classes[str(most_predicted_index)],
            "share_of_all_predictions": collapse_share,
            "distinct_classes_predicted": len(prediction_counts),
        },
        "open_set_behaviour": open_set,
        "most_confused_pairs": most_confused,
        "per_class": per_class,
        "confusion_matrix": matrix,
    }

    (models_dir / "evaluation_report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    summary = {
        key: result[key]
        for key in [*top_accuracy, "macro_f1", "weighted_f1", "test_images", "num_classes", "temperature"]
    }
    summary["prediction_collapse"] = result["prediction_collapse"]
    summary["open_set_behaviour"] = open_set
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    evaluate_model()
