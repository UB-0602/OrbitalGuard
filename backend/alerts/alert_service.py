
from datetime import datetime, timezone


# Prototype screening thresholds only.
# These are NOT validated collision-risk thresholds.

SCREENING_THRESHOLDS = {
    "high": 10.0,
    "medium": 50.0,
    "low": 100.0
}


def classify_encounter(distance_km):
    """
    Classify an encounter using prototype distance bands.
    """

    if distance_km < SCREENING_THRESHOLDS["high"]:
        return "HIGH_PRIORITY"

    elif distance_km < SCREENING_THRESHOLDS["medium"]:
        return "MEDIUM_PRIORITY"

    elif distance_km < SCREENING_THRESHOLDS["low"]:
        return "LOW_PRIORITY"

    return "NO_SCREENING_ALERT"


def generate_explanation(priority, boundary_warning):
    """
    Generate an explanation for the encounter classification.
    """

    if priority == "HIGH_PRIORITY":
        explanation = (
            "Very close predicted approach based on the current "
            "screening model. Requires detailed conjunction assessment."
        )

    elif priority == "MEDIUM_PRIORITY":
        explanation = (
            "Close predicted approach detected. Further orbital "
            "assessment is recommended."
        )

    elif priority == "LOW_PRIORITY":
        explanation = (
            "Object separation is within the prototype monitoring "
            "band. Continue monitoring."
        )

    else:
        explanation = (
            "No approach within the configured prototype "
            "screening bands was detected."
        )

    if boundary_warning:
        explanation += (
            " WARNING: The closest sampled approach occurred at "
            "the screening-window boundary. Extend the analysis "
            "window to check whether the actual closest approach "
            "occurs outside the current window."
        )

    return explanation


def generate_alert(encounter):
    """
    Generate a detailed alert for one satellite-debris encounter.

    Includes:
    - Minimum separation distance
    - Time of Closest Approach (TCA)
    - Relative velocity
    - Relative position vector
    - Relative velocity vector
    - Screening-window boundary warning
    """

    distance = float(
        encounter["minimum_separation_km"]
    )

    priority = classify_encounter(distance)

    boundary_warning = bool(
        encounter.get("tca_at_window_boundary", False)
    )

    explanation = generate_explanation(
        priority,
        boundary_warning
    )

    return {

        # Object identification
        "target_satellite": encounter["target_name"],

        "target_norad_id": encounter["target_norad_id"],

        "debris_object": encounter["debris_name"],

        "debris_norad_id": encounter["debris_norad_id"],

        # Closest approach information
        "minimum_separation_km": distance,

        "closest_approach_time": encounter.get(
            "closest_approach_time"
        ),

        "tca_offset_seconds": encounter.get(
            "tca_offset_seconds"
        ),

        # Relative motion information
        "relative_speed_km_s": encounter.get(
            "relative_speed_km_s"
        ),

        "relative_position_vector_km": encounter.get(
            "relative_position_vector_km"
        ),

        "relative_velocity_vector_km_s": encounter.get(
            "relative_velocity_vector_km_s"
        ),

        # Boundary status
        "tca_at_window_boundary": boundary_warning,

        # Classification
        "priority": priority,

        "explanation": explanation,

        # Alert generation timestamp
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat()
    }


def generate_alert_report(encounters):
    """
    Generate a complete alert report for all encounters
    supplied by the collision screening service.
    """

    alerts = [
        generate_alert(encounter)
        for encounter in encounters
    ]

    return {

        "total_encounters": len(alerts),

        "high_priority": sum(
            alert["priority"] == "HIGH_PRIORITY"
            for alert in alerts
        ),

        "medium_priority": sum(
            alert["priority"] == "MEDIUM_PRIORITY"
            for alert in alerts
        ),

        "low_priority": sum(
            alert["priority"] == "LOW_PRIORITY"
            for alert in alerts
        ),

        "no_screening_alert": sum(
            alert["priority"] == "NO_SCREENING_ALERT"
            for alert in alerts
        ),

        "boundary_encounters": sum(
            alert["tca_at_window_boundary"]
            for alert in alerts
        ),

        "alerts": alerts
    }
