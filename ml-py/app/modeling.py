"""Model/checkpoint helpers shared by training, evaluation and inference."""
import torch
import torch.nn as nn
from torchvision.models import efficientnet_b0

def create_model(num_classes: int) -> nn.Module:
    model = efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model

def unpack_checkpoint(checkpoint):
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"], checkpoint
    if isinstance(checkpoint, dict):
        return checkpoint, {"legacy_state_dict": True}
    raise RuntimeError("Unsupported model checkpoint format")
