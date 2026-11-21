
from datetime import datetime, timezone

from skyfield.api import EarthSatellite, load


ts = load.timescale()


def calculate_satellite_position(satellite_data, current_time=None):

    if current_time is None:
        current_time = datetime.now(timezone.utc)

    satellite = EarthSatellite.from_omm(
        ts,
        satellite_data
    )

    t = ts.from_datetime(current_time)

    geocentric = satellite.at(t)

    x, y, z = geocentric.position.km

    subpoint = geocentric.subpoint()

    return {
        "name": satellite_data["OBJECT_NAME"],
        "norad_id": satellite_data["NORAD_CAT_ID"],

        "position_km": {
            "x": round(float(x), 3),
            "y": round(float(y), 3),
            "z": round(float(z), 3)
        },

        "geographic_position": {
            "latitude": round(subpoint.latitude.degrees, 6),
            "longitude": round(subpoint.longitude.degrees, 6),
            "altitude_km": round(subpoint.elevation.km, 3)
        }
    }


def calculate_multiple_positions(satellites):

    current_time = datetime.now(timezone.utc)

    results = []
    errors = []

    for satellite_data in satellites:

        try:
            position = calculate_satellite_position(
                satellite_data,
                current_time
            )

            results.append(position)

        except Exception as error:

            errors.append({
                "name": satellite_data.get(
                    "OBJECT_NAME", "Unknown"
                ),
                "error": str(error)
            })

    return {
        "timestamp": current_time.isoformat(),
        "total_objects": len(satellites),
        "successful": len(results),
        "failed": len(errors),
        "satellites": results,
        "errors": errors
    }

def calculate_iss_position(orbital_data):

    return calculate_satellite_position(
        orbital_data["satellites"][0]
    )
