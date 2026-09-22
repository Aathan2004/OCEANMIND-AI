"""Single place that decides which torch device to use.

Apple Silicon exposes MPS, which the original code ignored and fell back to CPU
for both training and inference.
"""
from __future__ import annotations

import os

import torch


def resolve_device() -> torch.device:
    requested = os.getenv("TORCH_DEVICE", "").strip().lower()
    if requested:
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")
