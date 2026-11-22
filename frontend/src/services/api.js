// Set VITE_API_BASE_URL in Vercel (e.g. https://your-service.onrender.com).
// Falls back to the local backend for development.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

// =====================================
// 1. ISS POSITION
// =====================================

export async function getISSPosition() {
  const response = await fetch(
    `${API_BASE_URL}/api/satellites/iss/position`
  );

  if (!response.ok) {
    throw new Error(
      `Satellite API error: ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// 2. DEBRIS POSITIONS
// =====================================

export async function getDebrisPositions() {
  const response = await fetch(
    `${API_BASE_URL}/api/satellites?group=cosmos-2251-debris`
  );

  if (!response.ok) {
    throw new Error(
      `Debris API error: ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// 3. COLLISION SCREENING
// Supports ISS and Indian satellites
// =====================================

export async function getCollisionReport(
  targetNoradId = 25544,
  targetGroup = 'stations',
  debrisGroup = 'cosmos-2251-debris',
  hours = 3,
  stepSeconds = 60
) {
  const params = new URLSearchParams({
    target_norad_id: String(targetNoradId),
    target_group: targetGroup,
    debris_group: debrisGroup,
    hours: String(hours),
    step_seconds: String(stepSeconds)
  });

  const response = await fetch(
    `${API_BASE_URL}/api/collision/screen?${params.toString()}`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.detail ||
      `Collision API error: ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// 4. SATELLITE ORBITAL TRAJECTORY
// =====================================

export async function getSatelliteTrajectory(
  noradId,
  group
) {
  const response = await fetch(
    `${API_BASE_URL}/api/trajectory/${noradId}?group=${encodeURIComponent(group)}&duration_minutes=90&step_seconds=60`
  );

  if (!response.ok) {
    throw new Error(
      `Trajectory API error: ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// 5. INDIAN MISSION CATALOGUE
// =====================================

export async function getIndianMissionCatalogue() {
  const response = await fetch(
    `${API_BASE_URL}/api/missions/india`
  );

  if (!response.ok) {
    throw new Error(
      `Indian mission API error: ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// 6. INDIAN SATELLITE POSITION
// =====================================

export async function getIndianSatellitePosition(noradId) {
  const response = await fetch(
    `${API_BASE_URL}/api/missions/india/${noradId}/position`
  );

  if (!response.ok) {
    throw new Error(
      `Indian satellite position API error: ${response.status}`
    );
  }

  return response.json();
}

export async function getCommunicationSatellites() {
  const response = await fetch(
    `${API_BASE_URL}/api/satellites/communication`
  );

  if (!response.ok) {
    throw new Error(
      `Communication satellite API error: ${response.status}`
    );
  }

  return response.json();
}

export async function getNavigationSatellites() {
  const response = await fetch(
    `${API_BASE_URL}/api/satellites/navigation`
  );

  if (!response.ok) {
    throw new Error(
      `Navigation satellite API error: ${response.status}`
    );
  }

  return response.json();
}
