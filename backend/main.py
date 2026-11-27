
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# =========================================================
# PROJECT SERVICE IMPORTS
# =========================================================

from backend.data.satellite_service import (
    get_iss_data,
    get_satellite_data,
    get_satellite_by_norad_id,
    get_indian_satellite_catalogue,
    get_indian_satellite,
    ALLOWED_GROUPS,
)

from backend.orbital_engine.trajectory_service import (
    calculate_orbital_trajectory,
)

from backend.orbital_engine.position_service import (
    calculate_iss_position,
    calculate_multiple_positions,
)

from backend.collision_detection.conjunction_service import (
    screen_close_approaches,
)

from backend.alerts.alert_service import (
    generate_alert_report,
)


# =========================================================
# APPLICATION INITIALIZATION
# =========================================================

app = FastAPI(
    title="OrbitGuard API",
    description=(
        "Space Situational Awareness, "
        "Indian Mission Monitoring and "
        "Satellite Infrastructure Protection"
    ),
    version="3.2.0",
)


# =========================================================
# CORS CONFIGURATION
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://orbital-guard-nu.vercel.app",
    ],
    # Vercel gives every deployment its own URL
    # (e.g. orbital-guard-abc123-team.vercel.app), so allow those too.
    # Also allow any subdomain pattern Vercel may generate.
    allow_origin_regex=r"https://orbital-guard[a-z0-9-]*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# HOME AND HEALTH
# =========================================================

@app.get("/")
def home():
    return {
        "project": "OrbitGuard 3.2",
        "status": "Operational",
        "domains": [
            "Space Debris Protection",
            "Indian Space Mission Monitoring",
            "Satellite Communication and Navigation Protection",
        ],
        "message": "Space monitoring system is running",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "OrbitGuard Backend",
    }


# =========================================================
# ISS ORBITAL DATA
# =========================================================

@app.get("/api/satellites/iss")
def get_iss():
    try:
        return get_iss_data()

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"ISS satellite data error: {str(error)}",
        )


# =========================================================
# ISS CURRENT POSITION
# =========================================================

@app.get("/api/satellites/iss/position")
def iss_position():
    try:
        orbital_data = get_iss_data()

        position = calculate_iss_position(
            orbital_data
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "data": position,
        }

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"ISS position calculation failed: {str(error)}",
        )


# =========================================================
# MULTI-SATELLITE AND DEBRIS TRACKING
# =========================================================

@app.get("/api/satellites")
def get_all_satellite_positions(
    group: str = Query(
        default="stations",
        description="Supported CelesTrak group name",
    )
):
    try:
        orbital_data = get_satellite_data(group)

        result = calculate_multiple_positions(
            orbital_data["satellites"]
        )

        return {
            "status": "success",
            "source": orbital_data["source"],
            "group": orbital_data["group"],
            "cache_status": orbital_data["cache_status"],
            "fetched_at": orbital_data["fetched_at"],
            **result,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Satellite tracking failed: {str(error)}",
        )


# =========================================================
# DOMAIN 01: INDIAN MISSION CATALOGUE
# =========================================================

@app.get("/api/missions/india")
def get_indian_missions():
    try:
        catalogue = get_indian_satellite_catalogue()

        return {
            "status": "success",
            "domain": "Indian Space Mission Monitoring",
            **catalogue,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Indian mission catalogue error: {str(error)}",
        )


# =========================================================
# AUTOMATIC MULTI-SATELLITE POSITION TRACKING
# =========================================================

@app.get("/api/missions/india/positions")
def get_all_indian_satellite_positions():
    try:
        # Load Indian satellite catalogue.
        catalogue = get_indian_satellite_catalogue()

        indian_satellites = catalogue.get(
            "satellites", []
        )

        # Collect NORAD IDs.
        indian_norad_ids = {
            int(item["norad_id"])
            for item in indian_satellites
        }

        # Fetch active satellite data once.
        orbital_data = get_satellite_data("active")

        # Match catalogue satellites with orbital data.
        matching_satellites = [
            satellite
            for satellite in orbital_data["satellites"]
            if int(
                satellite.get("NORAD_CAT_ID", -1)
            ) in indian_norad_ids
        ]

        # Calculate all matching positions together.
        result = calculate_multiple_positions(
            matching_satellites
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "group": "active",
            "catalogue_count": len(indian_satellites),
            "matched_count": len(matching_satellites),
            "cache_status": orbital_data["cache_status"],
            **result,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=(
                "Indian satellite position tracking failed: "
                f"{str(error)}"
            ),
        )


# =========================================================
# DOMAIN 04: COMMUNICATION SATELLITES
# =========================================================

@app.get("/api/satellites/communication")
def get_communication_satellites():
    try:
        catalogue = get_indian_satellite_catalogue(
            category="communication"
        )

        return {
            "status": "success",
            "domain": "Satellite Communication Protection",
            **catalogue,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Communication satellite catalogue error: {str(error)}",
        )


# =========================================================
# DOMAIN 04: NAVIGATION / NAVIC SATELLITES
# =========================================================

@app.get("/api/satellites/navigation")
def get_navigation_satellites():
    try:
        catalogue = get_indian_satellite_catalogue(
            category="navigation"
        )

        return {
            "status": "success",
            "domain": "NavIC Navigation Satellite Protection",
            **catalogue,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Navigation satellite catalogue error: {str(error)}",
        )


# =========================================================
# INDIAN SATELLITE POSITION BY NORAD ID
# =========================================================

@app.get("/api/missions/india/{norad_id}/position")
def get_indian_satellite_position(norad_id: int):
    try:
        metadata = get_indian_satellite(norad_id)

        if metadata is None:
            raise HTTPException(
                status_code=404,
                detail="Satellite not found in Indian mission catalogue",
            )

        orbital_data = get_satellite_by_norad_id(
            norad_id
        )

        if not orbital_data.get("satellites"):
            raise HTTPException(
                status_code=404,
                detail="Orbital data not found for this satellite",
            )

        satellite_data = orbital_data["satellites"][0]

        result = calculate_multiple_positions(
            [satellite_data]
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "cache_status": orbital_data["cache_status"],
            "mission": metadata,
            **result,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Indian satellite position failed: {str(error)}",
        )


# =========================================================
# GENERIC SATELLITE POSITION BY NORAD ID
# =========================================================

@app.get("/api/satellites/{norad_id}/position")
def get_satellite_position(
    norad_id: int,
    group: str = Query(default="active"),
):
    try:
        if group not in ALLOWED_GROUPS:
            raise ValueError(
                "Unsupported satellite group"
            )

        # Preserve the existing ISS/stations workflow.
        if group == "stations" and norad_id == 25544:

            orbital_data = get_satellite_data(
                "stations"
            )

            satellite_data = next(
                (
                    satellite
                    for satellite in orbital_data["satellites"]
                    if int(
                        satellite.get("NORAD_CAT_ID", -1)
                    ) == norad_id
                ),
                None,
            )

            if satellite_data is None:
                raise HTTPException(
                    status_code=404,
                    detail="Satellite not found",
                )

            cache_status = orbital_data["cache_status"]

        else:
            orbital_data = get_satellite_by_norad_id(
                norad_id
            )

            if not orbital_data.get("satellites"):
                raise HTTPException(
                    status_code=404,
                    detail="Satellite orbital data not found",
                )

            satellite_data = orbital_data["satellites"][0]
            cache_status = orbital_data["cache_status"]

        result = calculate_multiple_positions(
            [satellite_data]
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "cache_status": cache_status,
            "group": group,
            **result,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Satellite position calculation failed: {str(error)}",
        )


# =========================================================
# GENERALIZED CLOSE-APPROACH SCREENING
# =========================================================

@app.get("/api/collision/screen")
def collision_screen(
    hours: int = Query(
        default=3,
        ge=1,
        le=24,
    ),

    step_seconds: int = Query(
        default=60,
        ge=1,
        le=3600,
    ),

    target_norad_id: int = Query(
        default=25544,
        ge=1,
    ),

    target_group: str = Query(
        default="stations",
    ),

    debris_group: str = Query(
        default="cosmos-2251-debris",
    ),
):
    try:
        if target_group not in ALLOWED_GROUPS:
            raise ValueError(
                "Unsupported target group"
            )

        if debris_group not in ALLOWED_GROUPS:
            raise ValueError(
                "Unsupported debris group"
            )

        # Preserve the original ISS workflow.
        if (
            target_group == "stations"
            and target_norad_id == 25544
        ):

            target_dataset = get_satellite_data(
                "stations"
            )

            target_data = next(
                (
                    satellite
                    for satellite in target_dataset["satellites"]
                    if int(
                        satellite.get("NORAD_CAT_ID", -1)
                    ) == target_norad_id
                ),
                None,
            )

            if target_data is None:
                raise HTTPException(
                    status_code=404,
                    detail="ISS orbital data not found",
                )

        else:
            # Retrieve only the requested NORAD object.
            # Avoid downloading the complete active group.
            target_dataset = get_satellite_by_norad_id(
                target_norad_id
            )

            if not target_dataset.get("satellites"):
                raise HTTPException(
                    status_code=404,
                    detail="Target satellite orbital data not found",
                )

            target_data = target_dataset["satellites"][0]

        # Retrieve the selected debris dataset.
        debris_dataset = get_satellite_data(
            debris_group
        )

        debris_data = debris_dataset["satellites"]

        # Perform conjunction screening.
        result = screen_close_approaches(
            target_data=target_data,
            debris_data=debris_data,
            hours=hours,
            step_seconds=step_seconds,
        )

        # Generate alert report from returned encounters.
        alert_report = generate_alert_report(
            result["closest_approaches"]
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "target_norad_id": target_norad_id,
            "target_cache_status": target_dataset["cache_status"],
            "target_group": target_group,
            "debris_group": debris_group,
            **result,
            "alert_report": alert_report,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Collision screening failed: {str(error)}",
        )


# =========================================================
# ORBITAL TRAJECTORY
# =========================================================

@app.get("/api/trajectory/{norad_id}")
def get_satellite_trajectory(
    norad_id: int,

    group: str = Query(
        default="stations"
    ),

    duration_minutes: int = Query(
        default=90,
        ge=1,
        le=1440,
    ),

    step_seconds: int = Query(
        default=60,
        ge=1,
        le=3600,
    ),
):
    try:
        if group not in ALLOWED_GROUPS:
            raise ValueError(
                "Unsupported satellite group"
            )

        # Keep the existing ISS/stations retrieval.
        if group == "stations" and norad_id == 25544:

            orbital_data = get_satellite_data(
                "stations"
            )

            satellite_data = next(
                (
                    satellite
                    for satellite in orbital_data["satellites"]
                    if int(
                        satellite.get("NORAD_CAT_ID", -1)
                    ) == norad_id
                ),
                None,
            )

            if satellite_data is None:
                raise HTTPException(
                    status_code=404,
                    detail="Satellite not found",
                )

        else:
            # Retrieve one object by NORAD ID.
            orbital_data = get_satellite_by_norad_id(
                norad_id
            )

            if not orbital_data.get("satellites"):
                raise HTTPException(
                    status_code=404,
                    detail="Satellite orbital data not found",
                )

            satellite_data = orbital_data["satellites"][0]

        result = calculate_orbital_trajectory(
            satellite_data=satellite_data,
            duration_minutes=duration_minutes,
            step_seconds=step_seconds,
        )

        return {
            "status": "success",
            "source": "CelesTrak",
            "group": group,
            "cache_status": orbital_data["cache_status"],
            **result,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Trajectory calculation failed: {str(error)}",
        )
