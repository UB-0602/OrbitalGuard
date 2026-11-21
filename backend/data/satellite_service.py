
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

import requests


# =========================================================
# CONFIGURATION
# =========================================================

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"

DATA_DIR = Path(__file__).resolve().parent
CACHE_DIR = DATA_DIR / "cache"

# Keep cached data for 3 hours to reduce repeated requests.
CACHE_HOURS = 3

REQUEST_TIMEOUT = 30

REQUEST_HEADERS = {
    "User-Agent": "OrbitGuard/3.2 satellite monitoring research"
}

ALLOWED_GROUPS = {
    "stations",
    "active",
    "cosmos-2251-debris",
    "iridium-33-debris",
    "fengyun-1c-debris",
}


# =========================================================
# INDIAN SATELLITE MISSION CATALOGUE
# =========================================================
# This is a curated metadata catalogue.
# It does not prove current operational status.
# NORAD IDs are matched separately against orbital records.

INDIAN_SATELLITES = [

    # ---------------- NAVIGATION / NAVIC ----------------

    {
        "name": "IRNSS-1A",
        "norad_id": 39199,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and messaging",
        "country": "India",
    },
    {
        "name": "IRNSS-1B",
        "norad_id": 39635,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Positioning, navigation and timing",
        "country": "India",
    },
    {
        "name": "IRNSS-1C",
        "norad_id": 40269,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and messaging",
        "country": "India",
    },
    {
        "name": "IRNSS-1D",
        "norad_id": 40547,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation",
        "country": "India",
    },
    {
        "name": "IRNSS-1E",
        "norad_id": 41241,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and messaging",
        "country": "India",
    },
    {
        "name": "IRNSS-1F",
        "norad_id": 41384,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and messaging",
        "country": "India",
    },
    {
        "name": "IRNSS-1G",
        "norad_id": 41469,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and messaging",
        "country": "India",
    },
    {
        "name": "IRNSS-1I",
        "norad_id": 43286,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Indian Regional Navigation Satellite System",
        "role": "Navigation and ranging",
        "country": "India",
    },
    {
        "name": "NVS-01",
        "norad_id": 56759,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Second-generation NavIC satellite",
        "role": "Navigation",
        "country": "India",
    },
    {
        "name": "NVS-02",
        "norad_id": 62850,
        "category": "navigation",
        "constellation": "NavIC",
        "mission": "Second-generation NavIC satellite",
        "role": "Navigation",
        "country": "India",
    },

    # ---------------- COMMUNICATION ----------------

    {
        "name": "GSAT-8",
        "norad_id": 37605,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication and GAGAN augmentation",
        "country": "India",
    },
    {
        "name": "GSAT-10",
        "norad_id": 38779,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication and navigation augmentation",
        "country": "India",
    },
    {
        "name": "GSAT-7",
        "norad_id": 39234,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-14",
        "norad_id": 39498,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-16",
        "norad_id": 40332,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-6",
        "norad_id": 40880,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Mobile communication",
        "country": "India",
    },
    {
        "name": "GSAT-15",
        "norad_id": 41028,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication and navigation augmentation",
        "country": "India",
    },
    {
        "name": "GSAT-18",
        "norad_id": 41793,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-19",
        "norad_id": 42747,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "High-throughput communication",
        "country": "India",
    },
    {
        "name": "GSAT-17",
        "norad_id": 42815,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-29",
        "norad_id": 43698,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "High-throughput communication",
        "country": "India",
    },
    {
        "name": "GSAT-7A",
        "norad_id": 43864,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Defence communication",
        "country": "India",
    },
    {
        "name": "GSAT-31",
        "norad_id": 44035,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-30",
        "norad_id": 45026,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "GSAT-24",
        "norad_id": 52903,
        "category": "communication",
        "constellation": "INSAT/GSAT",
        "mission": "Indian communication satellite",
        "role": "Communication",
        "country": "India",
    },
    {
        "name": "INSAT-3DS",
        "norad_id": 58990,
        "category": "communication",
        "constellation": "INSAT",
        "mission": "Indian meteorological satellite",
        "role": "Meteorological data and satellite services",
        "country": "India",
    },
]


# =========================================================
# CACHE HELPERS
# =========================================================

def _read_cache(cache_file):

    if not cache_file.exists():
        return None

    try:
        with open(cache_file, "r", encoding="utf-8") as file:
            return json.load(file)

    except (json.JSONDecodeError, OSError):
        return None


def _cache_is_fresh(cached):

    if not cached:
        return False

    try:
        fetched_at = datetime.fromisoformat(
            cached["fetched_at"]
        )

        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(
                tzinfo=timezone.utc
            )

        age = datetime.now(timezone.utc) - fetched_at

        return age < timedelta(hours=CACHE_HOURS)

    except (KeyError, ValueError, TypeError):
        return False


def _save_cache(cache_file, result):

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    with open(cache_file, "w", encoding="utf-8") as file:
        json.dump(result, file, indent=4)


def _raise_celestrak_error(error):

    response = getattr(error, "response", None)

    if response is not None:
        raise RuntimeError(
            f"CelesTrak HTTP {response.status_code}: "
            f"{response.text[:500]}"
        ) from error

    raise RuntimeError(
        f"CelesTrak connection failed: {error}"
    ) from error


# =========================================================
# GENERAL CELESTRAK GROUP RETRIEVAL
# =========================================================

def get_satellite_data(group="stations"):

    if group not in ALLOWED_GROUPS:
        raise ValueError(
            f"Unsupported satellite group: {group}"
        )

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    cache_file = CACHE_DIR / f"{group}.json"

    cached = _read_cache(cache_file)

    # Use fresh cached data before contacting CelesTrak.
    if _cache_is_fresh(cached):
        cached["cache_status"] = "Cached data"
        return cached

    try:
        response = requests.get(
            CELESTRAK_URL,
            params={
                "GROUP": group,
                "FORMAT": "JSON",
            },
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )

        response.raise_for_status()

        satellites = response.json()

        if not isinstance(satellites, list) or not satellites:
            raise ValueError(
                f"No satellite records received for group: {group}"
            )

        result = {
            "source": "CelesTrak",
            "group": group,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cache_status": "Fresh data",
            "count": len(satellites),
            "satellites": satellites,
        }

        _save_cache(cache_file, result)

        return result

    except requests.RequestException as error:

        # Use older cached data if CelesTrak blocks or fails.
        if cached and cached.get("satellites"):
            cached["cache_status"] = (
                "Stale cache - CelesTrak unavailable"
            )
            return cached

        _raise_celestrak_error(error)


# =========================================================
# FETCH ONE SATELLITE BY NORAD CATALOG NUMBER
# =========================================================

def get_satellite_by_norad_id(norad_id):

    norad_id = int(norad_id)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    cache_file = CACHE_DIR / f"norad_{norad_id}.json"

    cached = _read_cache(cache_file)

    if _cache_is_fresh(cached):
        cached["cache_status"] = "Cached data"
        return cached

    try:
        response = requests.get(
            CELESTRAK_URL,
            params={
                "CATNR": str(norad_id),
                "FORMAT": "JSON",
            },
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )

        response.raise_for_status()

        satellites = response.json()

        if not isinstance(satellites, list) or not satellites:
            raise ValueError(
                f"No orbital data found for NORAD ID {norad_id}"
            )

        # Ensure the returned record matches the requested ID.
        matching_satellites = []

        for satellite in satellites:
            try:
                returned_id = int(
                    satellite.get("NORAD_CAT_ID", -1)
                )

                if returned_id == norad_id:
                    matching_satellites.append(satellite)

            except (TypeError, ValueError):
                continue

        if not matching_satellites:
            raise ValueError(
                f"CelesTrak returned no matching record for NORAD ID {norad_id}"
            )

        result = {
            "source": "CelesTrak",
            "norad_id": norad_id,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "cache_status": "Fresh data",
            "count": len(matching_satellites),
            "satellites": matching_satellites,
        }

        _save_cache(cache_file, result)

        return result

    except requests.RequestException as error:

        # Use existing cached orbital data if available.
        if cached and cached.get("satellites"):
            cached["cache_status"] = (
                "Stale cache - CelesTrak unavailable"
            )
            return cached

        _raise_celestrak_error(error)


# =========================================================
# ISS SERVICE
# =========================================================

def get_iss_data():

    data = get_satellite_data("stations")

    iss = [
        satellite
        for satellite in data["satellites"]
        if int(satellite.get("NORAD_CAT_ID", -1)) == 25544
    ]

    if not iss:
        raise ValueError("ISS data not found")

    return {
        **data,
        "count": len(iss),
        "satellites": iss,
    }


# =========================================================
# INDIAN SATELLITE CATALOGUE
# =========================================================

def get_indian_satellite_catalogue(category=None):

    if category not in (
        None,
        "communication",
        "navigation",
    ):
        raise ValueError(
            "Category must be communication or navigation"
        )

    catalogue = [
        satellite.copy()
        for satellite in INDIAN_SATELLITES
        if category is None or satellite["category"] == category
    ]

    return {
        "source": "OrbitGuard Indian mission metadata catalogue",
        "category": category or "all",
        "total_catalogue_entries": len(catalogue),
        "satellites": catalogue,
        "note": (
            "Mission metadata is curated. "
            "It does not establish current operational status. "
            "Retrieve orbital data separately by NORAD ID."
        ),
    }


# =========================================================
# GET ONE INDIAN SATELLITE METADATA RECORD
# =========================================================

def get_indian_satellite(norad_id):

    norad_id = int(norad_id)

    for satellite in INDIAN_SATELLITES:

        if satellite["norad_id"] == norad_id:
            return satellite.copy()

    return None
