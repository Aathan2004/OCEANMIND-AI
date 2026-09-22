"""
Rebuild the fish image dataset from GBIF occurrence media.

GBIF aggregates licensed occurrence records; the StillImage media attached to them
(mostly iNaturalist research-grade observations) give us real, taxonomically
labelled fish photographs.

Two modes:

    python training/build_dataset_gbif.py --survey
        Query GBIF for the number of image-bearing occurrences per class and write
        models/dataset_survey.json. Downloads nothing. Use this to decide which
        species have enough data to be worth training on.

    python training/build_dataset_gbif.py --download --min-images 60 --max-images 220
        Download images for every class that met the threshold in the survey into
        dataset/<Species_Name>/*.jpg.

Both modes are resumable and safe to re-run.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import io
import json
import os
import random
import sys
import threading
import time
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

GBIF_MATCH = "https://api.gbif.org/v1/species/match"
GBIF_SEARCH = "https://api.gbif.org/v1/occurrence/search"

# GBIF page size cap.
PAGE_LIMIT = 300
# Images are stored re-encoded at this longest edge; training only needs 224px.
STORED_MAX_EDGE = 512
USER_AGENT = "OceanMindAI-dataset-builder/1.0 (academic project)"

# Hosts that have proven fetchable and serve permissively licensed observation media.
ALLOWED_IMAGE_HOSTS = (
    "inaturalist-open-data.s3.amazonaws.com",
    "static.inaturalist.org",
    "observation.org",
    "www.artsobservasjoner.no",
    "arctos.database.museum",
)

LICENSE_DENYLIST = ("cc_by_nc_nd", "ncnd")


def paths() -> tuple[Path, Path]:
    base = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent)))
    return (
        Path(os.getenv("DATASET_DIR", str(base / "dataset"))),
        Path(os.getenv("MODELS_DIR", str(base / "models"))),
    )


def class_labels(models_dir: Path) -> list[str]:
    classes = json.loads((models_dir / "classes.json").read_text(encoding="utf-8"))
    return [classes[k] for k in sorted(classes, key=lambda x: int(x))]


def label_to_scientific(label: str) -> str:
    """'Thalassoma_Lunare' -> 'Thalassoma lunare'."""
    parts = label.replace("_", " ").split()
    if len(parts) < 2:
        return label.replace("_", " ")
    return parts[0].capitalize() + " " + " ".join(p.lower() for p in parts[1:])


def is_placeholder_label(label: str) -> bool:
    """Reject junk class folders like 'A73EGS-P' that are not species names."""
    name = label.replace("_", " ").strip()
    if "_" not in label and " " not in name:
        return True
    if any(ch.isdigit() for ch in label):
        return True
    return False


# ── GBIF taxonomy + occurrence queries ────────────────────────────────────────


def resolve_taxon_key(client: httpx.Client, scientific_name: str) -> int | None:
    try:
        r = client.get(GBIF_MATCH, params={"name": scientific_name, "strict": "false"})
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("matchType") in (None, "NONE"):
            return None
        # speciesKey is the accepted species; usageKey may point at a synonym.
        return data.get("speciesKey") or data.get("usageKey")
    except Exception:
        return None


def count_media_occurrences(client: httpx.Client, taxon_key: int) -> int:
    try:
        r = client.get(
            GBIF_SEARCH,
            params={"taxonKey": taxon_key, "mediaType": "StillImage", "limit": 0},
        )
        if r.status_code == 200:
            return int(r.json().get("count", 0))
    except Exception:
        pass
    return 0


def collect_image_urls(client: httpx.Client, taxon_key: int, want: int) -> list[str]:
    """Page through occurrences and harvest usable StillImage URLs."""
    urls: list[str] = []
    seen: set[str] = set()
    offset = 0
    # Over-fetch: many records carry unusable or duplicate media.
    while len(urls) < int(want * 1.6) and offset < 2400:
        try:
            r = client.get(
                GBIF_SEARCH,
                params={
                    "taxonKey": taxon_key,
                    "mediaType": "StillImage",
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                },
            )
            if r.status_code != 200:
                break
            payload = r.json()
        except Exception:
            break

        results = payload.get("results", [])
        if not results:
            break

        for record in results:
            license_ = str(record.get("license", "")).lower()
            if any(bad in license_ for bad in LICENSE_DENYLIST):
                continue
            for medium in record.get("media", []):
                if medium.get("type") not in (None, "StillImage"):
                    continue
                url = medium.get("identifier")
                if not url or url in seen:
                    continue
                if not any(host in url for host in ALLOWED_IMAGE_HOSTS):
                    continue
                seen.add(url)
                urls.append(url)

        if payload.get("endOfRecords"):
            break
        offset += PAGE_LIMIT

    return urls


# ── Image download ────────────────────────────────────────────────────────────


def prefer_smaller_variant(url: str) -> str:
    """iNaturalist serves multi-megabyte originals; the ~500px 'medium' render is
    plenty for 224px training crops and downloads roughly 20x faster."""
    for size in ("/original.", "/large."):
        if size in url:
            return url.replace(size, "/medium.")
    return url


_download_local = threading.local()


def _download_client() -> httpx.Client:
    client = getattr(_download_local, "client", None)
    if client is None:
        client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=32),
        )
        _download_local.client = client
    return client


def download_one(url: str, destination: Path) -> bool:
    """Fetch, validate and re-encode a single image. Returns True on success."""
    url = prefer_smaller_variant(url)
    if destination.exists():
        return True
    try:
        response = _download_client().get(url)
        if response.status_code != 200:
            return False
        if "image" not in response.headers.get("content-type", ""):
            return False

        image = Image.open(io.BytesIO(response.content))
        image = image.convert("RGB")
        # Tiny images are usually icons or error placeholders, not specimens.
        if min(image.size) < 128:
            return False
        image.thumbnail((STORED_MAX_EDGE, STORED_MAX_EDGE), Image.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "JPEG", quality=88)
        return True
    except (UnidentifiedImageError, OSError, httpx.HTTPError, ValueError):
        return False
    except Exception:
        return False


# ── Commands ──────────────────────────────────────────────────────────────────


def run_survey(args) -> None:
    dataset_dir, models_dir = paths()
    labels = [lab for lab in class_labels(models_dir) if not is_placeholder_label(lab)]
    skipped = [lab for lab in class_labels(models_dir) if is_placeholder_label(lab)]
    print(f"Surveying {len(labels)} species on GBIF ({len(skipped)} junk labels skipped)…")

    survey: dict[str, dict] = {}

    def probe(label: str) -> tuple[str, dict]:
        with httpx.Client(timeout=25.0, headers={"User-Agent": USER_AGENT}) as client:
            sci = label_to_scientific(label)
            key = resolve_taxon_key(client, sci)
            if key is None:
                return label, {"scientific_name": sci, "taxon_key": None, "image_occurrences": 0}
            count = count_media_occurrences(client, key)
            return label, {"scientific_name": sci, "taxon_key": key, "image_occurrences": count}

    with futures.ThreadPoolExecutor(max_workers=8) as pool:
        for done, (label, info) in enumerate(pool.map(probe, labels), 1):
            survey[label] = info
            if done % 25 == 0:
                print(f"  {done}/{len(labels)}…", flush=True)

    models_dir.mkdir(parents=True, exist_ok=True)
    (models_dir / "dataset_survey.json").write_text(
        json.dumps({"skipped_labels": skipped, "species": survey}, indent=2), encoding="utf-8"
    )

    counts = sorted((v["image_occurrences"] for v in survey.values()), reverse=True)
    for threshold in (30, 50, 60, 80, 100, 150, 200):
        n = sum(1 for c in counts if c >= threshold)
        print(f"  species with >= {threshold:4d} image occurrences: {n}")
    print(f"\nWrote {models_dir / 'dataset_survey.json'}")


def run_download(args) -> None:
    dataset_dir, models_dir = paths()
    survey_path = models_dir / "dataset_survey.json"
    if not survey_path.exists():
        raise SystemExit("Run --survey first.")
    survey = json.loads(survey_path.read_text(encoding="utf-8"))["species"]

    eligible = {
        label: info
        for label, info in survey.items()
        if info.get("taxon_key") and info["image_occurrences"] >= args.min_images
    }
    if args.max_classes:
        eligible = dict(
            sorted(eligible.items(), key=lambda kv: -kv[1]["image_occurrences"])[: args.max_classes]
        )

    print(f"Downloading up to {args.max_images} images for each of {len(eligible)} species.")
    dataset_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict] = {}
    manifest_lock = threading.Lock()
    models_dir.mkdir(parents=True, exist_ok=True)
    completed = 0

    def fetch_class(item) -> None:
        """Harvest and download one species. Runs several of these at once so
        that GBIF paging for one class overlaps image downloads for another."""
        nonlocal completed
        label, info = item
        target_dir = dataset_dir / label
        existing = len(list(target_dir.glob("*.jpg"))) if target_dir.exists() else 0

        if existing < args.max_images:
            with httpx.Client(timeout=25.0, headers={"User-Agent": USER_AGENT}) as client:
                urls = collect_image_urls(client, info["taxon_key"], args.max_images)
            random.Random(42).shuffle(urls)

            with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
                jobs = []
                for index, url in enumerate(urls[: args.max_images * 2]):
                    jobs.append(pool.submit(download_one, url, target_dir / f"{label}_{index:04d}.jpg"))
                    if len(jobs) >= args.max_images * 2:
                        break
                for job in futures.as_completed(jobs):
                    job.result()

        saved = len(list(target_dir.glob("*.jpg"))) if target_dir.exists() else 0
        # More images can land than requested because failures are unpredictable;
        # trim deterministically so class sizes stay balanced.
        if saved > args.max_images:
            for extra in sorted(target_dir.glob("*.jpg"))[args.max_images:]:
                extra.unlink()
            saved = args.max_images

        with manifest_lock:
            completed += 1
            manifest[label] = {"downloaded": saved, "scientific_name": info["scientific_name"]}
            print(f"[{completed}/{len(eligible)}] {label}: {saved} images", flush=True)
            (models_dir / "dataset_manifest.json").write_text(
                json.dumps(manifest, indent=2), encoding="utf-8"
            )

    with futures.ThreadPoolExecutor(max_workers=args.class_workers) as pool:
        list(pool.map(fetch_class, sorted(eligible.items())))

    usable = {k: v for k, v in manifest.items() if v["downloaded"] >= args.min_keep}
    print(f"\nDone. {len(usable)}/{len(manifest)} species have >= {args.min_keep} images.")
    print(f"Total images: {sum(v['downloaded'] for v in manifest.values())}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--survey", action="store_true", help="count available images per species")
    parser.add_argument("--download", action="store_true", help="download images")
    parser.add_argument("--min-images", type=int, default=60,
                        help="minimum GBIF image occurrences for a species to be included")
    parser.add_argument("--max-images", type=int, default=220,
                        help="maximum images to store per species")
    parser.add_argument("--min-keep", type=int, default=25,
                        help="minimum successfully downloaded images to consider a class usable")
    parser.add_argument("--max-classes", type=int, default=0, help="cap number of classes (0 = no cap)")
    parser.add_argument("--workers", type=int, default=10,
                        help="concurrent image downloads within one species")
    parser.add_argument("--class-workers", type=int, default=6,
                        help="species processed concurrently")
    args = parser.parse_args()

    if args.survey:
        run_survey(args)
    elif args.download:
        run_download(args)
    else:
        parser.error("pass --survey or --download")


if __name__ == "__main__":
    main()
