
import numpy as np

from datetime import datetime, timezone, timedelta
from math import ceil
from skyfield.api import EarthSatellite, load


ts = load.timescale()


def _calculate_state(satellite, elapsed_seconds, start_time):
    """
    Calculate satellite position and velocity at a given time.

    Position: km
    Velocity: km/s
    """

    current_datetime = start_time + timedelta(
        seconds=float(elapsed_seconds)
    )

    skyfield_time = ts.from_datetime(current_datetime)

    satellite_state = satellite.at(skyfield_time)

    position = satellite_state.position.km
    velocity = satellite_state.velocity.km_per_s

    return position, velocity


def _distance_at_time(
    target,
    debris,
    elapsed_seconds,
    start_time
):
    """
    Calculate separation distance between target
    and debris at a specific time.
    """

    target_position, _ = _calculate_state(
        target, elapsed_seconds, start_time
    )

    debris_position, _ = _calculate_state(
        debris, elapsed_seconds, start_time
    )

    relative_position = debris_position - target_position

    return float(np.linalg.norm(relative_position))


def _refine_tca(
    target,
    debris,
    left,
    right,
    start_time,
    iterations=50
):
    """
    Refine the Time of Closest Approach using
    golden-section search.
    """

    golden_ratio = (np.sqrt(5) - 1) / 2

    x1 = right - golden_ratio * (right - left)
    x2 = left + golden_ratio * (right - left)

    f1 = _distance_at_time(
        target, debris, x1, start_time
    )

    f2 = _distance_at_time(
        target, debris, x2, start_time
    )

    for _ in range(iterations):

        if f1 < f2:
            right = x2
            x2 = x1
            f2 = f1

            x1 = right - golden_ratio * (right - left)

            f1 = _distance_at_time(
                target, debris, x1, start_time
            )

        else:
            left = x1
            x1 = x2
            f1 = f2

            x2 = left + golden_ratio * (right - left)

            f2 = _distance_at_time(
                target, debris, x2, start_time
            )

    return (left + right) / 2


def _get_geographic_position(satellite, skyfield_time):
    """
    Calculate Earth-fixed geographic subpoint.

    Returns latitude, longitude and altitude.
    """

    subpoint = satellite.at(skyfield_time).subpoint()

    return {
        "latitude": round(
            float(subpoint.latitude.degrees), 6
        ),

        "longitude": round(
            float(subpoint.longitude.degrees), 6
        ),

        "altitude_km": round(
            float(subpoint.elevation.km), 3
        )
    }


def screen_close_approaches(
    target_data,
    debris_data,
    hours=3,
    step_seconds=60
):
    """
    Screens one operational satellite against
    a collection of debris objects.

    Calculates:

    1. Minimum separation distance
    2. Refined Time of Closest Approach (TCA)
    3. Relative velocity
    4. Relative position vector
    5. Relative velocity vector
    6. Target geographic position at TCA
    7. Debris geographic position at TCA

    Position and velocity vectors use the same
    geocentric inertial reference frame.
    """

    if hours <= 0 or step_seconds <= 0:
        raise ValueError(
            "Hours and step must be positive"
        )

    target = EarthSatellite.from_omm(
        ts, target_data
    )

    start_time = datetime.now(timezone.utc)

    duration_seconds = hours * 3600

    # Generate sample offsets including exact end time.
    number_of_steps = ceil(
        duration_seconds / step_seconds
    )

    time_offsets = [
        min(i * step_seconds, duration_seconds)
        for i in range(number_of_steps + 1)
    ]

    timestamps = [
        start_time + timedelta(seconds=offset)
        for offset in time_offsets
    ]

    skyfield_times = ts.from_datetimes(timestamps)

    # Calculate target positions once.
    target_state = target.at(skyfield_times)

    target_positions = target_state.position.km

    encounters = []
    failed_objects = 0

    for debris_data_item in debris_data:

        debris_name = debris_data_item.get(
            "OBJECT_NAME", ""
        )

        # Exclude non-debris objects.
        if "DEB" not in debris_name.upper():
            continue

        try:
            debris = EarthSatellite.from_omm(
                ts, debris_data_item
            )

            debris_state = debris.at(skyfield_times)

            debris_positions = debris_state.position.km

            # Relative position: debris - target.
            differences = (
                debris_positions - target_positions
            )

            # Separation at each sampled timestamp.
            distances = np.linalg.norm(
                differences, axis=0
            )

            # Find closest sampled point.
            minimum_index = int(
                np.argmin(distances)
            )

            sampled_tca = time_offsets[minimum_index]

            # Check whether closest point is at a boundary.
            is_window_boundary = (
                minimum_index == 0
                or minimum_index == len(time_offsets) - 1
            )

            if not is_window_boundary:

                left = time_offsets[minimum_index - 1]
                right = time_offsets[minimum_index + 1]

                refined_tca = _refine_tca(
                    target,
                    debris,
                    left,
                    right,
                    start_time
                )

            else:
                refined_tca = sampled_tca

            # Calculate exact states at refined TCA.
            target_position, target_velocity = (
                _calculate_state(
                    target,
                    refined_tca,
                    start_time
                )
            )

            debris_position, debris_velocity = (
                _calculate_state(
                    debris,
                    refined_tca,
                    start_time
                )
            )

            # Relative position and velocity.
            relative_position = (
                debris_position - target_position
            )

            relative_velocity = (
                debris_velocity - target_velocity
            )

            # Minimum separation in kilometres.
            minimum_separation = float(
                np.linalg.norm(relative_position)
            )

            # Relative speed in km/s.
            relative_speed = float(
                np.linalg.norm(relative_velocity)
            )

            # Calculate TCA timestamp.
            tca_datetime = (
                start_time
                + timedelta(seconds=refined_tca)
            )

            # =====================================
            # GEOGRAPHIC POSITIONS AT TCA
            # =====================================

            tca_skyfield_time = ts.from_datetime(
                tca_datetime
            )

            target_geographic_position = (
                _get_geographic_position(
                    target,
                    tca_skyfield_time
                )
            )

            debris_geographic_position = (
                _get_geographic_position(
                    debris,
                    tca_skyfield_time
                )
            )

            # =====================================
            # STORE ENCOUNTER
            # =====================================

            encounters.append({

                "target_name": target_data["OBJECT_NAME"],

                "target_norad_id": target_data["NORAD_CAT_ID"],

                "debris_name": debris_name,

                "debris_norad_id": debris_data_item["NORAD_CAT_ID"],

                "minimum_separation_km": round(
                    minimum_separation, 6
                ),

                "closest_approach_time": (
                    tca_datetime.isoformat()
                ),

                "tca_offset_seconds": round(
                    refined_tca, 3
                ),

                "relative_speed_km_s": round(
                    relative_speed, 6
                ),

                "relative_position_vector_km": [
                    round(float(value), 6)
                    for value in relative_position
                ],

                "relative_velocity_vector_km_s": [
                    round(float(value), 6)
                    for value in relative_velocity
                ],

                "target_position_at_tca": (
                    target_geographic_position
                ),

                "debris_position_at_tca": (
                    debris_geographic_position
                ),

                "tca_at_window_boundary": (
                    is_window_boundary
                )
            })

        except Exception as error:
            failed_objects += 1

            print(
                f"Error screening {debris_name}: {error}"
            )

    # Sort encounters by minimum separation.
    encounters.sort(
        key=lambda item: item["minimum_separation_km"]
    )

    return {

        "target_satellite": target_data["OBJECT_NAME"],

        "analysis_window_hours": hours,

        "sampling_interval_seconds": step_seconds,

        "debris_objects_screened": len(encounters),

        "debris_objects_failed": failed_objects,

        "closest_approaches": encounters[:10]
    }
