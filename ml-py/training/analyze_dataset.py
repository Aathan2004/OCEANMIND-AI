"""Write dataset_report.json with image health, exact duplicates, dimensions and split leakage checks."""
import hashlib, json, os
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image, UnidentifiedImageError

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}; SPLITS = ("train", "validation", "test")
def digest(path):
    h = hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()
def analyze_dataset():
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent))); data, models = Path(os.getenv("DATASET_DIR", str(base / "dataset"))), Path(os.getenv("MODELS_DIR", str(base / "models")))
    if not data.exists(): raise SystemExit(f"Dataset directory does not exist: {data}")
    split_mode = all((data / s).exists() for s in SPLITS); roots = [data / s for s in SPLITS] if split_mode else [data]
    counts, corrupt, dimensions, hashes, locations = Counter(), [], Counter(), defaultdict(list), defaultdict(set)
    for root in roots:
        split = root.name if split_mode else "raw"
        for folder in root.iterdir():
            if not folder.is_dir() or folder.name.startswith("."): continue
            for image_path in folder.iterdir():
                if not image_path.is_file() or image_path.suffix.lower() not in EXTENSIONS: continue
                try:
                    with Image.open(image_path) as image: image.verify()
                    with Image.open(image_path) as image: dimensions[f"{image.width}x{image.height}"] += 1
                except (UnidentifiedImageError, OSError): corrupt.append(str(image_path)); continue
                counts[folder.name] += 1; h = digest(image_path); hashes[h].append(str(image_path)); locations[h].add(split)
    duplicates = {h: p for h, p in hashes.items() if len(p) > 1}; leakage = {h: p for h, p in hashes.items() if len(locations[h]) > 1}
    values = list(counts.values())
    # Generic check for a class large enough to dominate training, replacing a
    # hardcoded "Flower Horn" lookup that only made sense for an older dataset.
    dominant = max(counts, key=counts.get) if counts else None
    report = {"total_species": len(counts), "total_valid_images": sum(values), "images_per_species": counts, "min_images_per_class": min(values) if values else 0, "max_images_per_class": max(values) if values else 0, "average_images_per_class": sum(values) / len(values) if values else 0, "classes_with_fewer_than_5_images": [name for name, n in counts.items() if n < 5], "corrupted_images": corrupt, "exact_duplicate_groups": duplicates, "cross_split_leakage": leakage, "image_dimensions": dimensions, "class_imbalance_ratio": max(values) / min(values) if values and min(values) else None, "largest_class": dominant, "largest_class_images": counts.get(dominant, 0) if dominant else 0, "largest_class_share": (counts.get(dominant, 0) / sum(values)) if values else 0, "split_mode": split_mode}
    models.mkdir(parents=True, exist_ok=True); (models / "dataset_report.json").write_text(json.dumps(report, indent=2)); print(json.dumps(report, indent=2))
if __name__ == "__main__": analyze_dataset()
