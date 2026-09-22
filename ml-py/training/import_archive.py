"""
Import & Organize Dataset from archive.zip
Maps Fish_Data/images/raw_images to species class folders in dataset/
using Fish_Data/final_all_index.txt
"""

import os
import sys
import json
import shutil
import zipfile
from pathlib import Path

# Resolve dynamic paths supporting CLI arguments, environment variables, and defaults
script_dir = Path(__file__).resolve().parent
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(script_dir.parent)))
DATASET_DIR = Path(os.getenv("DATASET_DIR", str(PROJECT_ROOT / "dataset")))

default_archive = os.getenv("ARCHIVE_PATH", str(Path.home() / "Downloads" / "archive.zip"))
if len(sys.argv) > 1:
    ZIP_PATH = Path(sys.argv[1])
else:
    ZIP_PATH = Path(default_archive)

def clean_species_name(name: str) -> str:
    """Format species name into clean Title_Case / formatted string."""
    name = name.strip()
    if '_' in name:
        parts = name.split('_')
        # Capitalize genus (first word) and keep species lowercase or capitalized cleanly
        return "_".join(p.capitalize() for p in parts if p)
    elif '-' in name:
        return name.upper()
    return name.capitalize()

def extract_and_organize():
    print("==================================================")
    print("    IMPORTING FISH DATASET FROM ARCHIVE.ZIP")
    print("==================================================")
    print(f"Zip source: {ZIP_PATH}")
    print(f"Target dataset folder: {DATASET_DIR}")

    if not ZIP_PATH.exists():
        print(f"Error: Archive file not found at {ZIP_PATH}")
        sys.exit(1)

    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        file_list = set(z.namelist())
        
        index_file = 'Fish_Data/final_all_index.txt'
        if index_file not in file_list:
            print(f"Error: {index_file} not found inside archive.zip!")
            sys.exit(1)

        lines = z.read(index_file).decode('utf-8', errors='ignore').splitlines()
        print(f"Parsed {len(lines)} index entries from {index_file}")

        # Map species -> list of archive image file paths
        species_image_map = {}
        found_count = 0
        missing_count = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = line.split('=')
            if len(parts) >= 4:
                sp_raw = parts[1]
                img_base = parts[3]
                species_name = clean_species_name(sp_raw)

                raw_jpg = f"Fish_Data/images/raw_images/{img_base}.jpg"
                raw_png = f"Fish_Data/images/raw_images/{img_base}.png"
                cropped_jpg = f"Fish_Data/images/cropped/{img_base}.jpg"
                cropped_png = f"Fish_Data/images/cropped/{img_base}.png"

                # Include both raw and cropped variants for max feature training
                found_any = False
                if raw_jpg in file_list:
                    species_image_map.setdefault(species_name, []).append((raw_jpg, f"{img_base}_raw"))
                    found_any = True
                elif raw_png in file_list:
                    species_image_map.setdefault(species_name, []).append((raw_png, f"{img_base}_raw"))
                    found_any = True

                if cropped_jpg in file_list:
                    species_image_map.setdefault(species_name, []).append((cropped_jpg, f"{img_base}_crop"))
                    found_any = True
                elif cropped_png in file_list:
                    species_image_map.setdefault(species_name, []).append((cropped_png, f"{img_base}_crop"))
                    found_any = True

                if found_any:
                    found_count += 1
                else:
                    missing_count += 1

        print(f"\nDiscovered {len(species_image_map)} unique species.")
        print(f"Mapped {found_count} images ({missing_count} missing).")

        # Clean contents of dataset directory without removing the junction/folder itself
        if DATASET_DIR.exists():
            print(f"Clearing target dataset directory contents: {DATASET_DIR}")
            for child in DATASET_DIR.iterdir():
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
        else:
            DATASET_DIR.mkdir(parents=True, exist_ok=True)

        # Extract and save images into species folders
        print("\nExtracting images into species folders...")
        extracted_images = 0

        for species_name, images in species_image_map.items():
            species_folder = DATASET_DIR / species_name
            species_folder.mkdir(parents=True, exist_ok=True)

            for archive_path, img_base in images:
                ext = Path(archive_path).suffix
                out_filename = f"{img_base}{ext}"
                out_path = species_folder / out_filename

                with z.open(archive_path) as src, open(out_path, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                extracted_images += 1

        print(f"\n[SUCCESS] Extracted {extracted_images} images into {len(species_image_map)} species folders.")

if __name__ == "__main__":
    extract_and_organize()
