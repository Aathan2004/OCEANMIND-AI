"""
Fish / non-fish gate.

The species classifier has a softmax over fish classes only, so it will happily
assign a dog photo to whichever fish it resembles most. This gate runs a
general-purpose ImageNet classifier first and rejects images whose content is
clearly something other than a fish.

MobileNetV3-Large is used rather than a second EfficientNet: it is already part
of torchvision, adds ~21 MB, and costs a few milliseconds on CPU.
"""
from __future__ import annotations

import logging
import os
import threading

import torch
from PIL import Image

import app.tls  # noqa: F401  (configures the CA bundle before weight downloads)
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

from app.device import resolve_device

logger = logging.getLogger("fish_gate")

# ImageNet-1k indices whose classes are fish or fish-like aquatic animals.
FISH_CLASS_INDICES = {
    0,    # tench
    1,    # goldfish
    2,    # great white shark
    3,    # tiger shark
    4,    # hammerhead
    5,    # electric ray
    6,    # stingray
    389,  # barracouta
    390,  # eel
    391,  # coho
    392,  # rock beauty
    393,  # anemone fish
    394,  # sturgeon
    395,  # gar
    396,  # lionfish
    397,  # puffer
}

# Not fish, but overwhelmingly common *context* for a fish photograph: a reef
# shot, an aquarium pane, a diver, a boat deck, a fish on ice at a market.
AQUATIC_CONTEXT_INDICES = {
    973,  # coral reef
    109,  # brain coral
    107,  # jellyfish
    108,  # sea anemone
    113,  # snail (reef macro shots)
    115,  # sea slug
    116,  # chiton
    121,  # king crab
    125,  # hermit crab
    147,  # grey whale
    148,  # killer whale
    149,  # dugong
    150,  # sea lion
    801,  # snorkel
    983,  # scuba diver
    913,  # wreck
}


# Scenes and vehicles that ImageNet frequently confuses with sharks: a boat hull
# or a sunlit sea surface scores highly on "great white shark" / "tiger shark"
# because those classes are full of fin-above-water photographs. When one of
# these wins the top-1 slot the picture is a seascape or a boat, not a fish.
SCENE_VETO_INDICES = {
    449,  # boathouse
    460,  # breakwater
    472,  # canoe
    484,  # catamaran
    510,  # container ship
    536,  # dock
    554,  # fireboat
    576,  # gondola
    625,  # lifeboat
    628,  # liner
    693,  # paddle
    694,  # paddlewheel
    724,  # pirate ship
    780,  # schooner
    814,  # speedboat
    871,  # trimaran
    914,  # yawl
    970,  # alp
    972,  # cliff
    975,  # lakeside
    976,  # promontory
    977,  # sandbar
    978,  # seashore
    979,  # valley
    980,  # volcano
}


class FishGate:
    def __init__(self) -> None:
        self.device = resolve_device()
        weights = MobileNet_V3_Large_Weights.DEFAULT
        self.transform = weights.transforms()
        self.model = mobilenet_v3_large(weights=weights)
        self.model.to(self.device).eval()
        self.categories = weights.meta["categories"]
        logger.info(f"Fish gate ready on {self.device}")

    @torch.inference_mode()
    def score(self, image: Image.Image) -> dict:
        tensor = self.transform(image).unsqueeze(0).to(self.device)
        probabilities = torch.softmax(self.model(tensor), dim=1)[0].cpu()

        fish_score = float(sum(probabilities[i] for i in FISH_CLASS_INDICES))
        context_score = float(sum(probabilities[i] for i in AQUATIC_CONTEXT_INDICES))

        top_probability, top_index = torch.max(probabilities, dim=0)
        top_index = int(top_index)

        # Tuned on 120 GBIF fish photos vs a non-fish negative set: these values
        # passed 97.5% of real fish while rejecting every negative. The gate
        # exists to reject cars and dogs, not to second-guess the species model
        # on an unusual fish, so a weak aquatic signal is enough to pass.
        fish_threshold = float(os.getenv("FISH_GATE_THRESHOLD", "0.02"))
        aquatic_threshold = float(os.getenv("FISH_GATE_AQUATIC_THRESHOLD", "0.03"))
        # A confident non-fish ImageNet call (a dog at 0.9) is strong evidence.
        veto_threshold = float(os.getenv("FISH_GATE_VETO", "0.75"))

        is_fish_like = fish_score >= fish_threshold
        has_aquatic_context = (fish_score + context_score) >= aquatic_threshold
        confident_non_fish = (
            top_probability >= veto_threshold
            and top_index not in FISH_CLASS_INDICES
            and top_index not in AQUATIC_CONTEXT_INDICES
        )

        # A seascape or boat wins outright, whatever the shark score says.
        scene_veto = top_index in SCENE_VETO_INDICES

        is_fish = (is_fish_like or has_aquatic_context) and not confident_non_fish and not scene_veto

        return {
            "is_fish": bool(is_fish),
            "fish_score": round(fish_score, 4),
            "aquatic_context_score": round(context_score, 4),
            "top_imagenet_label": self.categories[top_index],
            "top_imagenet_confidence": round(float(top_probability), 4),
            "scene_veto": bool(scene_veto),
        }


_gate: FishGate | None = None
_gate_lock = threading.Lock()


def get_fish_gate() -> FishGate | None:
    """Returns None when the gate is disabled or its weights cannot be loaded."""
    global _gate
    if os.getenv("FISH_GATE_ENABLED", "true").lower() != "true":
        return None
    if _gate is None:
        with _gate_lock:
            if _gate is None:
                try:
                    _gate = FishGate()
                except Exception as error:
                    # A missing weights download must not take the whole API down;
                    # identification still works, it just loses the not_fish check.
                    logger.error(f"Fish gate unavailable, continuing without it: {error}")
                    return None
    return _gate
