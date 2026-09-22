"""Convert a Roboflow YOLO fish dataset into ImageFolder classification crops."""
import os, shutil
from pathlib import Path
from PIL import Image

SOURCE = Path(os.getenv("YOLO_DATASET_DIR", "/Users/aathan/Downloads/archive-2"))
DEST = Path(os.getenv("DATASET_DIR", str(Path(__file__).resolve().parent.parent / "dataset")))
NAMES = ["AngelFish", "BlueTang", "ButterflyFish", "ClownFish", "GoldFish", "Gourami", "MorishIdol", "PlatyFish", "RibbonedSweetlips", "ThreeStripedDamselfish", "YellowCichlid", "YellowTang", "ZebraFish"]
SPLITS = {"train": "train", "valid": "validation", "test": "test"}

def crop(image, box):
    cls, xc, yc, width, height = box; w, h = image.size
    left, top = max(0, int((xc - width / 2) * w)), max(0, int((yc - height / 2) * h))
    right, bottom = min(w, int((xc + width / 2) * w)), min(h, int((yc + height / 2) * h))
    return int(cls), image.crop((left, top, right, bottom))

def main():
    if not (SOURCE / "data.yaml").exists(): raise SystemExit(f"Missing Roboflow data.yaml: {SOURCE}")
    if DEST.exists(): shutil.rmtree(DEST)
    counts = {target: 0 for target in SPLITS.values()}
    for source_split, target_split in SPLITS.items():
        image_dir, label_dir = SOURCE / source_split / "images", SOURCE / source_split / "labels"
        for image_path in image_dir.glob("*.*"):
            label_path = label_dir / f"{image_path.stem}.txt"
            if not label_path.exists(): continue
            with Image.open(image_path) as raw: image = raw.convert("RGB")
            for n, line in enumerate(label_path.read_text().splitlines()):
                fields = [float(value) for value in line.split()]
                if len(fields) != 5: continue
                class_index, fish = crop(image, fields)
                if fish.width < 24 or fish.height < 24: continue
                out = DEST / target_split / NAMES[class_index]; out.mkdir(parents=True, exist_ok=True)
                fish.save(out / f"{image_path.stem}_{n}.jpg", quality=95); counts[target_split] += 1
    print(f"Created classification crops at {DEST}: {counts}")
if __name__ == "__main__": main()
