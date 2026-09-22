"""Create deterministic, leakage-free train/validation/test splits from dataset/<class>/*.jpg."""
import hashlib, json, os, random, shutil
from collections import defaultdict
from pathlib import Path
from PIL import Image, UnidentifiedImageError

SEED = int(os.getenv("SPLIT_SEED", "42")); SPLITS = ("train", "validation", "test"); EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
def paths():
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
    return Path(os.getenv("DATASET_DIR", str(base / "dataset"))), Path(os.getenv("MODELS_DIR", str(base / "models")))
def valid_image(path):
    try:
        with Image.open(path) as image: image.verify()
        return True
    except (UnidentifiedImageError, OSError): return False
def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()
def allocation(count):
    """Never duplicate an image merely to populate a split."""
    if count < 3: return {"train": count, "validation": 0, "test": 0}
    if count < 5: return {"train": count - 2, "validation": 1, "test": 1}
    val = max(1, round(count * .15)); test = max(1, round(count * .15))
    return {"train": count - val - test, "validation": val, "test": test}
def prepare_dataset():
    dataset_dir, models_dir = paths()
    if not dataset_dir.exists(): raise SystemExit(f"Dataset directory does not exist: {dataset_dir}")
    reserved = set(SPLITS) | {"raw", ".git", "venv"}
    classes = sorted(p for p in dataset_dir.iterdir() if p.is_dir() and p.name not in reserved and not p.name.startswith("."))
    if not classes: raise SystemExit("Expected raw images under dataset/<species>/<image>.jpg; no species folders were found.")
    files_by_class, invalid, hashes = {}, [], defaultdict(list)
    for class_dir in classes:
        valid = []
        for file in sorted(class_dir.iterdir()):
            if not file.is_file() or file.name.startswith("."): continue
            if file.suffix.lower() not in EXTENSIONS or not valid_image(file): invalid.append(str(file)); continue
            valid.append(file); hashes[sha256(file)].append(str(file.relative_to(dataset_dir)))
        files_by_class[class_dir.name] = valid
    # Drop classes with too few usable images. An empty or near-empty folder
    # (an interrupted download, a stray directory) otherwise becomes a class the
    # model can never learn but must still choose between.
    minimum = int(os.getenv("MIN_IMAGES_PER_CLASS", "20"))
    dropped = {name: len(files) for name, files in files_by_class.items() if len(files) < minimum}
    for name in dropped:
        del files_by_class[name]
    if not files_by_class:
        raise SystemExit(f"No class has at least {minimum} valid images.")

    duplicate_hashes = {h: members for h, members in hashes.items() if len(members) > 1}
    seen = set()
    for name, files in files_by_class.items():
        files_by_class[name] = [f for f in files if not (sha256(f) in seen or seen.add(sha256(f)))]
    for split in SPLITS:
        target = dataset_dir / split
        if target.exists(): shutil.rmtree(target)
        target.mkdir(parents=True)
    rng, split_info, insufficient = random.Random(SEED), {}, []
    for name, files in files_by_class.items():
        files = files[:]; rng.shuffle(files); counts = allocation(len(files)); start = 0; split_info[name] = {}
        for split in SPLITS:
            selected = files[start:start + counts[split]]; start += counts[split]
            split_info[name][split] = [str(p.relative_to(dataset_dir)) for p in selected]
            out = dataset_dir / split / name; out.mkdir(parents=True, exist_ok=True)
            for source in selected: shutil.copy2(source, out / source.name)
        if not counts["validation"] or not counts["test"]: insufficient.append(name)
    models_dir.mkdir(parents=True, exist_ok=True)
    (models_dir / "split_manifest.json").write_text(json.dumps({"seed": SEED, "splits": split_info, "insufficient_for_held_out_evaluation": insufficient}, indent=2))
    report = {"classes": len(files_by_class), "dropped_classes_below_minimum": dropped, "raw_images_after_exact_deduplication": sum(map(len, files_by_class.values())), "invalid_or_unsupported": invalid, "duplicate_hashes": duplicate_hashes, "insufficient_for_held_out_evaluation": insufficient}
    (models_dir / "split_report.json").write_text(json.dumps(report, indent=2)); print(json.dumps(report, indent=2)); print("Created leakage-free splits. classes.json is generated from train_dataset.class_to_idx during training.")
if __name__ == "__main__": prepare_dataset()
