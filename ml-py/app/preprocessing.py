"""Shared, deterministic image preprocessing for training evaluation and API inference."""
from torchvision import transforms

IMAGE_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

def training_transform():
    return transforms.Compose([
        transforms.RandomResizedCrop(IMAGE_SIZE, scale=(0.70, 1.0), ratio=(0.75, 1.33)),
        transforms.RandomHorizontalFlip(p=0.5), transforms.RandomRotation(12),
        transforms.RandomAffine(degrees=0, translate=(0.04, 0.04), scale=(0.92, 1.08)),
        transforms.ColorJitter(brightness=0.18, contrast=0.18, saturation=0.12, hue=0.03),
        transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

def inference_transform():
    return transforms.Compose([transforms.Resize(256), transforms.CenterCrop(IMAGE_SIZE), transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)])

PREPROCESSING_DESCRIPTION = "Resize(256) -> CenterCrop(224) -> ToTensor -> Normalize(ImageNet)"
