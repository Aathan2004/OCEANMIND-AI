"""
Grad-CAM for the EfficientNet-B0 species classifier.

This replaces a placeholder overlay that was drawn in the browser from the
confidence number alone — that showed nothing about what the model actually
looked at. Here the heatmap comes from real gradients of the predicted class
with respect to the last convolutional feature map.
"""
from __future__ import annotations

import io
import logging

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from app.preprocessing import IMAGE_SIZE, inference_transform

logger = logging.getLogger("gradcam")


def _colorize(cam: np.ndarray) -> np.ndarray:
    """Map [0,1] activations onto a blue→cyan→yellow→red ramp (RGB uint8)."""
    stops = np.array(
        [
            [0, 0, 140],
            [0, 160, 220],
            [0, 220, 180],
            [240, 220, 60],
            [220, 40, 30],
        ],
        dtype=np.float32,
    )
    positions = np.linspace(0.0, 1.0, len(stops))
    flat = cam.reshape(-1)
    channels = [np.interp(flat, positions, stops[:, i]) for i in range(3)]
    return np.stack(channels, axis=-1).reshape(*cam.shape, 3).astype(np.uint8)


def generate_gradcam(predictor, image_bytes: bytes, alpha: float = 0.6, gamma: float = 2.0) -> bytes:
    """Return a PNG of the original image blended with its Grad-CAM heatmap."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = inference_transform()(image).unsqueeze(0).to(predictor.device)

    model = predictor.model
    # EfficientNet's final conv block; its output is the usual Grad-CAM target.
    target_layer = model.features[-1]

    activations: list[torch.Tensor] = []
    gradients: list[torch.Tensor] = []

    def forward_hook(_module, _inputs, output):
        activations.append(output)

    def backward_hook(_module, _grad_input, grad_output):
        gradients.append(grad_output[0])

    handles = [
        target_layer.register_forward_hook(forward_hook),
        target_layer.register_full_backward_hook(backward_hook),
    ]

    try:
        # Gradients are required here, so no no_grad/inference_mode wrapper.
        model.zero_grad(set_to_none=True)
        logits = model(tensor)
        class_index = int(logits.argmax(dim=1).item())
        logits[0, class_index].backward()

        if not activations or not gradients:
            raise RuntimeError("Grad-CAM hooks captured nothing")

        activation = activations[0].detach()[0]     # (C, H, W)
        gradient = gradients[0].detach()[0]         # (C, H, W)

        # Channel importance = spatially averaged gradient.
        weights = gradient.mean(dim=(1, 2), keepdim=True)
        cam = F.relu((weights * activation).sum(dim=0))

        cam = cam.unsqueeze(0).unsqueeze(0)
        cam = F.interpolate(cam, size=(IMAGE_SIZE, IMAGE_SIZE), mode="bilinear", align_corners=False)
        cam = cam.squeeze().float().cpu().numpy()

        peak = float(cam.max())
        cam = cam / peak if peak > 0 else np.zeros_like(cam)
    finally:
        for handle in handles:
            handle.remove()
        model.zero_grad(set_to_none=True)

    # Blend over the same 224x224 crop the model actually saw, then upscale so
    # the overlay lines up with what is displayed.
    base = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
    base_array = np.asarray(base).astype(np.float32)
    heat = _colorize(cam).astype(np.float32)

    # Gamma concentrates the overlay on the genuinely hot regions so the photo
    # stays readable underneath instead of being washed out end to end.
    focus = np.power(cam, gamma)
    strength = (focus[..., None] * alpha).astype(np.float32)
    blended = base_array * (1 - strength) + heat * strength

    output = Image.fromarray(blended.clip(0, 255).astype(np.uint8))
    output = output.resize(image.size, Image.BICUBIC)

    buffer = io.BytesIO()
    output.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
