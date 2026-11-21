
from datetime import datetime, timezone, timedelta

from skyfield.api import EarthSatellite, load


def calculate_orbital_trajectory(
    satellite_data,
    duration_minutes=90,
    step_seconds=60
):
    """
    Calculate a future geographic trajectory using SGP4.

    Returns sampled latitude, longitude and altitude
    at synchronized future timestamps.
    """

    if duration_minutes < 1 or duration_minutes > 360:
        raise ValueError("Duration must be between 1 and 360 minutes")

    if step_seconds < 10 or step_seconds > 600:
        raise ValueError("Step must be between 10 and 600 seconds")

    ts = load.timescale()

    satellite = EarthSatellite.from_omm(
        ts,
        satellite_data
    )

    start_time = datetime.now(timezone.utc)

    total_seconds = duration_minutes * 60

    points = []

    for offset in range(0, total_seconds + 1, step_seconds):

        future_time = start_time + timedelta(
            seconds=offset
        )

        skyfield_time = ts.from_datetime(future_time)

        geocentric = satellite.at(skyfield_time)

        subpoint = geocentric.subpoint()

        points.append({
            "timestamp": future_time.isoformat(),
            "latitude": round(
                subpoint.latitude.degrees, 6
            ),
            "longitude": round(
                subpoint.longitude.degrees, 6
            ),
            "altitude_km": round(
                subpoint.elevation.km, 3
            )
        })

    return {
        "name": satellite_data.get(
            "OBJECT_NAME", "Unknown"
        ),
        "norad_id": satellite_data.get(
            "NORAD_CAT_ID"
        ),
        "duration_minutes": duration_minutes,
        "step_seconds": step_seconds,
        "total_points": len(points),
        "generated_at": start_time.isoformat(),
        "trajectory": points
    }
