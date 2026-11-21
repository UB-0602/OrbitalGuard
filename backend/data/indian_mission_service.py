import requests
from datetime import datetime, timezone
from functools import lru_cache

from skyfield.api import EarthSatellite, load

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"

ts = load.timescale()

# Initial catalogue. Names are lookup terms, not hard-coded NORAD IDs.
# Add more missions after verifying their current CelesTrak records.
INDIAN_MISSIONS = [
    {
        "name": "GSAT-30",
        "category": "communication",
        "mission": "Communication satellite",
        "role": "Telecommunications and broadcasting",
        "search_name": "GSAT-30",
    },
    {
        "name": "CMS-01",
        "category": "communication",
        "mission": "Communication satellite",
        "role": "Extended C-band communication services",
        "search_name": "CMS-01",
    },
    {
        "name": "GSAT-24",
        "category": "communication",
        "mission": "Communication satellite",
        "role": "Direct-to-home broadcasting services",
        "search_name": "GSAT-24",
    },
    {
        "name": "IRNSS-1B",
        "category": "navigation",
        "mission": "NavIC navigation satellite",
        "role": "Positioning, navigation and timing",
        "search_name": "IRNSS-1B",
    },
    {
        "name": "IRNSS-1G",
        "category": "navigation",
        "mission": "NavIC navigation satellite",
        "role": "Regional navigation services",
        "search_name": "IRNSS-1G",
    },
]


def _fetch_gp_record(search_name: str):
    """Fetch current OMM data from CelesTrak for a satellite name."""
    response = requests.get(
        CELESTRAK_URL,
        params={"NAME": search_name, "FORMAT": "JSON"},
        timeout=20,
    )
    response.raise_for_status()

    data = response.json()

    if isinstance(data, dict):
        data = [data]

    if not isinstance(data, list):
        return None

    # Prefer an exact object-name match to avoid selecting a similarly
    # named satellite returned by a partial-name search.
    wanted = search_name.strip().upper()

    for item in data:
        object_name = str(item.get("OBJECT_NAME", "")).strip().upper()
        if object_name == wanted:
            return item

    return None


@lru_cache(maxsize=64)
def _cached_gp_record(search_name: str):
    # Cache successful records in memory for this running process.
    return _fetch_gp_record(search_name)


def get_indian_mission_catalogue():
    """Return mission metadata together with available live NORAD IDs."""
    satellites = []
    errors = []

    for mission in INDIAN_MISSIONS:
        try:
            record = _cached_gp_record(mission["search_name"])

            if not record:
                errors.append(
                    f"No current CelesTrak orbital record found for "
                    f"{mission['name']}"
                )
                continue

            satellites.append({
                "name": mission["name"],
                "norad_id": int(record["NORAD_CAT_ID"]),
                "category": mission["category"],
                "mission": mission["mission"],
                "role": mission["role"],
                "object_name": record.get("OBJECT_NAME"),
                "epoch": record.get("EPOCH"),
                "data_source": "CelesTrak GP / OMM",
            })

        except (requests.RequestException, ValueError, KeyError) as exc:
            errors.append(f"{mission['name']}: {str(exc)}")

    return {
        "country": "India",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_satellites": len(satellites),
        "satellites": satellites,
        "errors": errors,
    }


def get_indian_satellite_position(norad_id: int):
    """Calculate the current geographic position of a catalogue satellite."""
    catalogue = get_indian_mission_catalogue()

    mission = next(
        (
            item for item in catalogue["satellites"]
            if item["norad_id"] == norad_id
        ),
        None,
    )

    if mission is None:
        raise ValueError(
            f"NORAD ID {norad_id} is not present in the current Indian mission catalogue"
        )

    record = _cached_gp_record(mission["object_name"])

    if not record:
        raise ValueError("Current orbital elements are unavailable")

    satellite = EarthSatellite.from_omm(ts, record)
    now = ts.now()
    geocentric = satellite.at(now)
    subpoint = geocentric.subpoint()

    return {
        "name": mission["name"],
        "norad_id": norad_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "geographic_position": {
            "latitude": round(subpoint.latitude.degrees, 6),
            "longitude": round(subpoint.longitude.degrees, 6),
            "altitude_km": round(subpoint.elevation.km, 3),
        },
        "data_source": "CelesTrak GP / OMM + Skyfield SGP4",
    }
