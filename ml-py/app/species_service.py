"""
Species data service using GBIF and WoRMS authoritative APIs.
Fetches real taxonomic and biological information for identified fish species.
Implements caching with TTL to avoid redundant API calls.
"""
import asyncio
import html
import logging
import re
from collections import Counter
import time
from typing import Optional
import httpx

logger = logging.getLogger("species_service")

# Cache: scientific_name -> (timestamp, data)
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 86400  # 24 hours

GBIF_MATCH = "https://api.gbif.org/v1/species/match"
GBIF_SPECIES = "https://api.gbif.org/v1/species/{}"
GBIF_VERNACULAR = "https://api.gbif.org/v1/species/{}/vernacularNames"
GBIF_DESCRIPTIONS = "https://api.gbif.org/v1/species/{}/descriptions"
GBIF_DISTRIBUTIONS = "https://api.gbif.org/v1/species/{}/distributions"
GBIF_IUCN = "https://api.gbif.org/v1/species/{}/iucnRedListCategory"
WORMS_MATCH = "https://www.marinespecies.org/rest/AphiaRecordsByMatchNames"
WORMS_VERNACULAR = "https://www.marinespecies.org/rest/AphiaVernacularsByAphiaID/{}"
WORMS_DISTRIBUTIONS = "https://www.marinespecies.org/rest/AphiaDistributionsByAphiaID/{}"
WORMS_ATTRIBUTES = "https://www.marinespecies.org/rest/AphiaAttributesByAphiaID/{}"

REQUEST_TIMEOUT = 8.0


def _cached(name: str) -> Optional[dict]:
    entry = _cache.get(name)
    if entry and (time.time() - entry[0]) < CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _store(name: str, data: dict):
    _cache[name] = (time.time(), data)


def _normalize_name(raw: str) -> str:
    """Convert class label like 'Amphiprion_Ocellaris' to 'Amphiprion ocellaris'."""
    parts = raw.replace("_", " ").strip().split()
    if len(parts) >= 2:
        # Genus capitalized, species lowercase
        return parts[0].capitalize() + " " + " ".join(p.lower() for p in parts[1:])
    return raw.replace("_", " ").strip()


async def _gbif_match(client: httpx.AsyncClient, scientific_name: str) -> Optional[dict]:
    try:
        r = await client.get(GBIF_MATCH, params={"name": scientific_name, "strict": "false"}, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            if data.get("matchType") not in ("NONE", None) and data.get("usageKey"):
                return data
    except Exception as e:
        logger.warning(f"GBIF match failed for '{scientific_name}': {e}")
    return None


async def _gbif_species_detail(client: httpx.AsyncClient, usage_key: int) -> dict:
    result = {}
    try:
        r = await client.get(GBIF_SPECIES.format(usage_key), timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["species"] = r.json()
    except Exception as e:
        logger.warning(f"GBIF species detail failed: {e}")

    try:
        # Fetch a large page: the correct common name is chosen by frequency
        # across checklists, and a small limit truncates the list to a handful
        # of obscure synonyms. (With limit=10 this returned "basking shark" for
        # the whale shark.)
        r = await client.get(GBIF_VERNACULAR.format(usage_key), params={"limit": 200}, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["vernacular"] = r.json().get("results", [])
    except Exception:
        pass

    try:
        r = await client.get(GBIF_DESCRIPTIONS.format(usage_key), params={"limit": 5}, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["descriptions"] = r.json().get("results", [])
    except Exception:
        pass

    try:
        r = await client.get(GBIF_DISTRIBUTIONS.format(usage_key), params={"limit": 10}, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["distributions"] = r.json().get("results", [])
    except Exception:
        pass

    try:
        r = await client.get(GBIF_IUCN.format(usage_key), timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["iucn"] = r.json()
    except Exception:
        pass

    return result


async def _worms_lookup(client: httpx.AsyncClient, scientific_name: str) -> Optional[dict]:
    try:
        r = await client.get(
            WORMS_MATCH,
            params={"scientificnames[]": scientific_name, "marine_only": "true"},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json()
            if data and isinstance(data, list) and data[0]:
                records = data[0]
                if isinstance(records, list) and records:
                    return records[0]
    except Exception as e:
        logger.warning(f"WoRMS match failed for '{scientific_name}': {e}")
    return None


async def _worms_detail(client: httpx.AsyncClient, aphia_id: int) -> dict:
    result = {}
    try:
        r = await client.get(WORMS_VERNACULAR.format(aphia_id), timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["vernacular"] = r.json() or []
    except Exception:
        pass
    try:
        r = await client.get(WORMS_DISTRIBUTIONS.format(aphia_id), timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            result["distributions"] = r.json() or []
    except Exception:
        pass
    return result


def _extract_common_name(gbif_vernacular: list, worms_vernacular: list, fallback: str) -> tuple[str, list[str]]:
    """Pick the most widely used English common name.

    Vernacular lists contain genuine but misleading historical synonyms — WoRMS
    lists "basking shark" under Rhincodon typus, which is a different species.
    Taking the first entry therefore produces wrong names. Counting how many
    independent checklists record each name is far more reliable: the name in
    actual use is repeated, the synonyms are not.

    Returns (best_name, all_recorded_english_names).
    """
    counts: Counter[str] = Counter()
    display: dict[str, str] = {}

    def add(raw_name: str | None, weight: int = 1) -> None:
        if not raw_name:
            return
        name = " ".join(str(raw_name).split())
        if not name:
            return
        key = name.lower()
        counts[key] += weight
        display.setdefault(key, name)

    for entry in gbif_vernacular:
        if str(entry.get("language", "")).lower() in ("eng", "en", "english"):
            # A checklist-preferred name is worth more than a passing mention.
            add(entry.get("vernacularName"), 2 if entry.get("preferred") else 1)

    for entry in worms_vernacular:
        if str(entry.get("language_code", "")).lower() in ("eng", "en"):
            add(entry.get("vernacular"))

    if not counts:
        # No English name anywhere — fall back to any recorded name.
        for entry in gbif_vernacular:
            add(entry.get("vernacularName"))
        for entry in worms_vernacular:
            add(entry.get("vernacular"))

    if not counts:
        return fallback, []

    # Most-recorded wins; shorter name breaks ties ("whale shark" over
    # "East Indian basking shark").
    best_key = max(counts, key=lambda key: (counts[key], -len(display[key].split())))
    ranked = [display[key] for key, _ in counts.most_common(8)]
    return display[best_key], ranked


def _extract_distribution(gbif_dists: list, worms_dists: list) -> Optional[str]:
    regions = []
    for d in gbif_dists[:5]:
        loc = d.get("locality") or d.get("country")
        if loc:
            regions.append(loc)
    for d in worms_dists[:5]:
        loc = d.get("locality") or d.get("locationID")
        if loc and loc not in regions:
            regions.append(loc)
    return "; ".join(regions) if regions else None


def _extract_description(descriptions: list) -> Optional[str]:
    """Pick a readable prose description.

    GBIF description blobs are raw HTML and many are just bibliographic
    fragments ("Harborne et al. 2000. s: Aluteres scriptus"), which look like
    corrupted data in the UI. Strip the markup and skip anything that does not
    read as a sentence.
    """
    best: Optional[str] = None

    for entry in descriptions:
        raw = entry.get("description") or ""
        if not raw:
            continue

        text = re.sub(r"<[^>]+>", " ", raw)
        text = html.unescape(text)
        text = re.sub(r"\s+", " ", text).strip()

        if len(text) < 80:
            continue
        # Citation-only fragments: mostly "Author et al. YEAR" with no real prose.
        if re.fullmatch(r"[^.]*\bet al\.[^.]*", text):
            continue
        # Needs at least one sentence of actual description.
        if text.count(" ") < 12:
            continue

        if best is None or len(text) > len(best):
            best = text

        if len(best) > 400:
            break

    if best is None:
        return None
    return best[:800].rstrip() + ("…" if len(best) > 800 else "")


async def fetch_species_data(raw_class_name: str) -> dict:
    """
    Given a model class label (e.g. 'Amphiprion_Ocellaris'), fetch authoritative
    species data from GBIF and WoRMS. Returns a structured dict.
    """
    scientific_name = _normalize_name(raw_class_name)

    cached = _cached(scientific_name)
    if cached is not None:
        logger.info(f"Cache hit for '{scientific_name}'")
        return cached

    logger.info(f"Fetching species data for '{scientific_name}'")

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # Run GBIF and WoRMS lookups concurrently
        gbif_match_result, worms_record = await asyncio.gather(
            _gbif_match(client, scientific_name),
            _worms_lookup(client, scientific_name),
        )

        gbif_detail: dict = {}
        worms_detail: dict = {}

        tasks = []
        if gbif_match_result and gbif_match_result.get("usageKey"):
            tasks.append(_gbif_species_detail(client, gbif_match_result["usageKey"]))
        else:
            tasks.append(asyncio.sleep(0))  # placeholder

        if worms_record and worms_record.get("AphiaID"):
            tasks.append(_worms_detail(client, worms_record["AphiaID"]))
        else:
            tasks.append(asyncio.sleep(0))  # placeholder

        results = await asyncio.gather(*tasks)
        if gbif_match_result:
            gbif_detail = results[0] if isinstance(results[0], dict) else {}
        if worms_record:
            worms_detail = results[1] if isinstance(results[1], dict) else {}

    # Build taxonomy from GBIF match
    gbif_sp = gbif_detail.get("species", {})
    worms_classification = {}
    if worms_record:
        worms_classification = {
            "kingdom": worms_record.get("kingdom"),
            "phylum": worms_record.get("phylum"),
            "class": worms_record.get("class"),
            "order": worms_record.get("order"),
            "family": worms_record.get("family"),
            "genus": worms_record.get("genus"),
        }

    taxonomy = {
        "kingdom": gbif_sp.get("kingdom") or worms_classification.get("kingdom"),
        "phylum": gbif_sp.get("phylum") or worms_classification.get("phylum"),
        "class": gbif_sp.get("class") or worms_classification.get("class"),
        "order": gbif_sp.get("order") or worms_classification.get("order"),
        "family": gbif_sp.get("family") or worms_classification.get("family"),
        "genus": gbif_sp.get("genus") or worms_classification.get("genus"),
    }
    # Remove None values
    taxonomy = {k: v for k, v in taxonomy.items() if v}

    # Accepted scientific name
    accepted_name = (
        worms_record.get("valid_name")
        or gbif_sp.get("canonicalName")
        or gbif_match_result.get("canonicalName") if gbif_match_result else None
        or scientific_name
    )

    # Common name
    gbif_vernacular = gbif_detail.get("vernacular", [])
    worms_vernacular = worms_detail.get("vernacular", [])
    # Build a readable fallback from the class label
    parts = scientific_name.split()
    fallback_common = " ".join(p.capitalize() for p in parts)
    common_name, common_name_alternatives = _extract_common_name(
        gbif_vernacular, worms_vernacular, fallback_common
    )

    # Distribution
    gbif_dists = gbif_detail.get("distributions", [])
    worms_dists = worms_detail.get("distributions", [])
    distribution = _extract_distribution(gbif_dists, worms_dists)

    # Description
    description = _extract_description(gbif_detail.get("descriptions", []))

    # IUCN status. The species/match response rarely carries it, so prefer the
    # dedicated Red List endpoint and fall back to the match payload.
    iucn_payload = gbif_detail.get("iucn") or {}
    iucn_status = iucn_payload.get("category") or (
        gbif_match_result.get("iucnRedListCategory") if gbif_match_result else None
    )
    iucn_code = iucn_payload.get("code")

    # Sources
    sources = []
    if gbif_match_result and gbif_match_result.get("usageKey"):
        sources.append({
            "name": "GBIF",
            "url": f"https://www.gbif.org/species/{gbif_match_result['usageKey']}"
        })
    if worms_record and worms_record.get("AphiaID"):
        sources.append({
            "name": "WoRMS",
            "url": f"https://www.marinespecies.org/aphia.php?p=taxdetails&id={worms_record['AphiaID']}"
        })

    found = bool(gbif_match_result or worms_record)

    result = {
        "found": found,
        "scientific_name": accepted_name,
        "common_name": common_name if found else None,
        "common_name_alternatives": common_name_alternatives if found else [],
        "taxonomy": taxonomy if taxonomy else None,
        "details": {
            k: v for k, v in {
                "description": description,
                "distribution": distribution,
            }.items() if v
        },
        "conservation": (
            {
                k: v
                for k, v in {"iucn_status": iucn_status, "iucn_code": iucn_code}.items()
                if v
            }
            if iucn_status
            else {}
        ),
        "sources": sources,
    }

    _store(scientific_name, result)
    return result
