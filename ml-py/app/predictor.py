"""
Production inference: fish/non-fish gating, calibrated species classification and
explicit open-set rejection.

Three outcomes are possible and they are kept distinct:

    not_fish    the image does not contain a fish at all
    unknown     it is a fish, but not one this model can name confidently
    identified  a confident species call

Supports both the current checkpoint format (with an embedded `idx_to_class`) and
legacy raw state_dicts, which are trusted against classes.json.
"""
from __future__ import annotations

import io
import json
import logging
import math
import os
from pathlib import Path

import torch
from PIL import Image, ImageFilter, ImageOps, ImageStat

from app.device import resolve_device
from app.fish_gate import get_fish_gate
from app.modeling import create_model, unpack_checkpoint
from app.preprocessing import inference_transform

logger = logging.getLogger("fish_predictor")

# Class labels in the shipped dataset that are import artefacts, not species.
# They must never be returned as an identification.
def _is_placeholder_label(label: str) -> bool:
    name = label.replace("_", " ").strip()
    if " " not in name:
        return True
    return any(character.isdigit() for character in label)


def _blur_score(image: Image.Image) -> float:
    """Variance of the Laplacian. Low values mean the image is out of focus."""
    grayscale = image.convert("L")
    if max(grayscale.size) > 512:
        grayscale.thumbnail((512, 512))
    edges = grayscale.filter(
        ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128)
    )
    return ImageStat.Stat(edges).var[0]


class FishPredictor:
    def __init__(self) -> None:
        base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
        self.models_dir = Path(os.getenv("MODELS_DIR", str(base / "models")))
        self.model_path = self.models_dir / "fish_model.pth"
        self.classes_path = self.models_dir / "classes.json"
        self.device = resolve_device()
        self.transform = inference_transform()
        self.model = None
        self.classes_map: dict[str, str] = {}
        self.num_classes = 0
        self.metadata: dict = {}
        # Temperature > 1 softens over-confident logits; calibrated by
        # training/calibrate.py and stored in the checkpoint.
        self.temperature = 1.0
        self.load_model()

    # ── Loading ───────────────────────────────────────────────────────────────

    def load_model(self) -> None:
        if not self.model_path.exists() or not self.classes_path.exists():
            raise FileNotFoundError("fish_model.pth and classes.json are both required")

        self.classes_map = json.loads(self.classes_path.read_text(encoding="utf-8"))
        self.num_classes = len(self.classes_map)

        raw = torch.load(self.model_path, map_location="cpu", weights_only=False)
        state, metadata = unpack_checkpoint(raw)
        checkpoint_classes = metadata.get("idx_to_class")

        if checkpoint_classes is None:
            allow_legacy = os.getenv("ALLOW_LEGACY_UNVERIFIED_CHECKPOINT", "true").lower() == "true"
            if not allow_legacy:
                raise RuntimeError(
                    "Legacy checkpoint has no saved class ordering. "
                    "Retrain with training/train.py or set ALLOW_LEGACY_UNVERIFIED_CHECKPOINT=true."
                )
            logger.warning(
                "Loading legacy checkpoint without embedded class mapping; "
                "trusting classes.json. Retrain to embed the mapping."
            )
        elif checkpoint_classes != self.classes_map:
            raise RuntimeError(
                "Checkpoint class order differs from classes.json. Refusing unsafe predictions."
            )

        self.model = create_model(self.num_classes)
        self.model.load_state_dict(state, strict=True)
        self.model.to(self.device).eval()
        self.metadata = metadata
        self.temperature = float(
            os.getenv("FISH_TEMPERATURE", metadata.get("temperature", 1.0)) or 1.0
        )
        logger.info(
            f"Model loaded: {self.num_classes} classes on {self.device} "
            f"(temperature={self.temperature:.3f})"
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _open_image(self, value) -> Image.Image:
        if isinstance(value, (str, Path)):
            image = Image.open(value)
        elif isinstance(value, bytes):
            image = Image.open(io.BytesIO(value))
        elif isinstance(value, Image.Image):
            image = value
        else:
            raise ValueError("Expected image path, bytes, or PIL.Image")
        # Phone photos carry an EXIF orientation tag rather than storing pixels
        # upright; PIL does not apply it on load. Skipping this means a portrait
        # photo can be fed to the model sideways, which tanks confidence without
        # ever looking like an error. The client may already correct this via
        # canvas re-encoding, but small/unmodified uploads bypass that, so this
        # must not depend on the client.
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")

    def _thresholds(self) -> dict:
        return {
            "confidence": float(os.getenv("FISH_CONFIDENCE_THRESHOLD", "0.45")),
            "margin": float(os.getenv("FISH_MARGIN_THRESHOLD", "0.10")),
            # Normalised entropy in [0, 1]; above this the distribution is too flat
            # to support naming a single species.
            "entropy": float(os.getenv("FISH_ENTROPY_THRESHOLD", "0.55")),
            "blur": float(os.getenv("FISH_BLUR_THRESHOLD", "12.0")),
            "min_edge": int(os.getenv("FISH_MIN_EDGE_PIXELS", "64")),
        }

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict(self, image_input, top_k: int = 5, run_gate: bool = True) -> dict:
        try:
            image = self._open_image(image_input)
        except Exception as error:
            return {"success": False, "error": f"Invalid or unreadable image: {error}"}

        thresholds = self._thresholds()

        if min(image.size) < thresholds["min_edge"]:
            return {
                "success": True,
                "status": "unknown",
                "identified": False,
                "message": "Image is too small to analyse. Upload a photo at least 64 pixels on its shortest side.",
                "top_candidate": None,
                "alternatives": [],
            }

        # Step 1 — is this a fish at all?
        gate_result = None
        if run_gate:
            gate = get_fish_gate()
            if gate is not None:
                gate_result = gate.score(image)
                if not gate_result["is_fish"]:
                    return {
                        "success": True,
                        "status": "not_fish",
                        "identified": False,
                        "message": "This image does not appear to contain a fish.",
                        "gate": gate_result,
                        "top_candidate": None,
                        "alternatives": [],
                    }

        # Step 2 — species classification
        tensor = self.transform(image).unsqueeze(0).to(self.device)
        # no_grad rather than inference_mode: inference-mode tensors forbid the
        # in-place suppression step below, even after .clone().
        with torch.no_grad():
            logits = self.model(tensor)
            if self.temperature and self.temperature != 1.0:
                logits = logits / self.temperature
            probabilities = torch.softmax(logits, dim=1)[0].float().cpu()

        # Placeholder classes can win the argmax but are meaningless as answers,
        # so remove their mass and renormalise rather than ever reporting one.
        suppressed = [
            index
            for index in range(self.num_classes)
            if _is_placeholder_label(self.classes_map[str(index)])
        ]
        if suppressed:
            probabilities[torch.tensor(suppressed)] = 0.0
            total = float(probabilities.sum())
            if total > 0:
                probabilities = probabilities / total

        k = min(top_k, self.num_classes)
        values, indices = torch.topk(probabilities, k=k)
        candidates = [
            {"name": self.classes_map[str(int(index))], "confidence": float(probability)}
            for probability, index in zip(values, indices)
        ]

        top = candidates[0]
        second = candidates[1] if len(candidates) > 1 else {"confidence": 0.0}
        margin = top["confidence"] - second["confidence"]

        # Step 3 — open-set rejection
        nonzero = probabilities[probabilities > 0]
        entropy = float(-(nonzero * nonzero.log()).sum())
        normalised_entropy = entropy / math.log(max(len(nonzero), 2))
        blur = _blur_score(image)

        reasons = []
        if top["confidence"] < thresholds["confidence"]:
            reasons.append("low_confidence")
        if margin < thresholds["margin"]:
            reasons.append("ambiguous_top_candidates")
        if normalised_entropy > thresholds["entropy"]:
            reasons.append("high_entropy")
        if blur < thresholds["blur"]:
            reasons.append("image_too_blurry")

        identified = not reasons

        result = {
            "success": True,
            "status": "identified" if identified else "unknown",
            "identified": identified,
            "top_candidate": top,
            "alternatives": candidates[1:],
            "confidence_margin": round(margin, 4),
            "normalized_entropy": round(normalised_entropy, 4),
            "blur_score": round(blur, 2),
            "gate": gate_result,
        }

        if identified:
            result["prediction"] = top
        else:
            result["prediction"] = None
            result["rejection_reasons"] = reasons
            result["message"] = (
                "This image is too blurry to identify. Try a sharper photo showing the whole fish."
                if "image_too_blurry" in reasons
                else "Unable to confidently identify this fish."
            )

        return result


_predictor_instance: FishPredictor | None = None


def get_predictor() -> FishPredictor:
    global _predictor_instance
    if _predictor_instance is None:
        _predictor_instance = FishPredictor()
    return _predictor_instance
