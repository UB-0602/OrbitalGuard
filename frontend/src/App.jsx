import { useEffect, useRef, useState } from 'react';

import {
  Viewer,
  Ion,
  Cartesian3,
  BoundingSphere,
  Color,
  ArcType,
  PolylineGlowMaterialProperty,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  PropertyBag
} from 'cesium';

import 'cesium/Build/Cesium/Widgets/widgets.css';
import './App.css';

import {
  getISSPosition,
  getDebrisPositions,
  getCollisionReport,
  getSatelliteTrajectory,
  getIndianMissionCatalogue,
  getIndianSatellitePosition
} from './services/api';

function App() {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);

  const [status, setStatus] = useState('Connecting...');
  const [satellite, setSatellite] = useState(null);

  const [debrisCount, setDebrisCount] = useState(0);
  const [debrisStatus, setDebrisStatus] = useState('Loading...');

  const [collisionReport, setCollisionReport] = useState(null);
  const [collisionStatus, setCollisionStatus] = useState('Loading...');
  const [collisionTarget, setCollisionTarget] = useState({
    noradId: 25544,
    group: 'stations'
  });
  const [indianScreeningLoading, setIndianScreeningLoading] = useState(false);



  const [selectedObject, setSelectedObject] = useState(null);

  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [tcaCountdown, setTcaCountdown] = useState('--:--:--');

  const [trajectoryStatus, setTrajectoryStatus] = useState(
    'Select an object to view its trajectory'
  );

  const [showMonitoring, setShowMonitoring] = useState(true);

  const [dashboardVisibility, setDashboardVisibility] = useState({
    indianMissions: true,
    satelliteMonitoring: true,
    collisionScreening: true,
    alertDashboard: true
  });

  function toggleDashboard(dashboard) {
    setDashboardVisibility((previous) => ({
      ...previous,
      [dashboard]: !previous[dashboard]
    }));
  }

  // =====================================
  // INDIAN MISSION MONITORING
  // =====================================

  const [indianCatalogue, setIndianCatalogue] = useState([]);
  const [indianCategory, setIndianCategory] = useState('all');
  const [indianStatus, setIndianStatus] = useState('Loading catalogue...');
  const [trackingIndianId, setTrackingIndianId] = useState(null);

  // =====================================
  // COLLISION SIMULATION
  // =====================================

  const [simulationStatus, setSimulationStatus] = useState('idle');
  const [simulationProgress, setSimulationProgress] = useState(0);

  const simulationRef = useRef({
    timer: null,
    entities: [],
    hiddenOriginals: [],
    startTime: 0,
    pausedAt: 0,
    duration: 8000,
    impactPosition: null,
    fragments: [],
    flash: null
  });

  // =====================================
  // 1. INITIALIZE CESIUM GLOBE
  // =====================================

  useEffect(() => {
    Ion.defaultAccessToken =
      import.meta.env.VITE_CESIUM_ION_TOKEN || '';

    const viewer = new Viewer(cesiumContainer.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false
    });

    viewerRef.current = viewer;

    return () => {
      const sim = simulationRef.current;

      if (sim.timer) {
        clearInterval(sim.timer);
      }

      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // =====================================
  // 2. ISS POSITION TRACKING
  // =====================================

  useEffect(() => {
    let active = true;

    async function updateISS() {
      try {
        const response = await getISSPosition();

        if (!active) return;

        const data = response.data;
        const position = data.geographic_position;

        const viewer = viewerRef.current;

        if (!viewer || viewer.isDestroyed()) return;

        const cartesian = Cartesian3.fromDegrees(
          position.longitude,
          position.latitude,
          position.altitude_km * 1000
        );

        let issEntity = viewer.entities.getById('ISS-25544');

        const issProperties = {
          objectType: 'Operational Satellite',
          noradId: data.norad_id || 25544,
          latitude: position.latitude,
          longitude: position.longitude,
          altitude: position.altitude_km
        };

        if (!issEntity) {
          issEntity = viewer.entities.add({
            id: 'ISS-25544',
            name: 'ISS (ZARYA)',
            position: cartesian,
            properties: new PropertyBag(issProperties),

            point: {
              pixelSize: 13,
              color: Color.LIME,
              outlineColor: Color.WHITE,
              outlineWidth: 2,
              heightReference: HeightReference.NONE
            },

            label: {
              text: 'ISS (ZARYA)',
              font: '14px sans-serif',
              fillColor: Color.WHITE,
              pixelOffset: new Cartesian3(0, -22, 0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
        } else {
          issEntity.position = cartesian;

          Object.entries(issProperties).forEach(([key, value]) => {
            issEntity.properties[key].setValue(value);
          });
        }

        setSatellite({
          name: data.name || data.satellite || 'ISS (ZARYA)',
          norad: data.norad_id || 25544,
          latitude: position.latitude,
          longitude: position.longitude,
          altitude: position.altitude_km
        });

        setStatus('Connected');

      } catch (error) {
        console.error('ISS API error:', error);

        if (active) {
          setStatus('API connection failed');
        }
      }
    }

    updateISS();

    const interval = setInterval(updateISS, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // =====================================
  // 3. COSMOS-2251 DEBRIS TRACKING
  // =====================================

  useEffect(() => {
    let active = true;

    async function updateDebris() {
      try {
        const response = await getDebrisPositions();

        if (!active) return;

        const viewer = viewerRef.current;

        if (!viewer || viewer.isDestroyed()) return;

        const debrisObjects = response.satellites || [];

        let loadedCount = 0;

        debrisObjects.forEach((debris) => {
          const position = debris.geographic_position;

          if (
            !position ||
            !Number.isFinite(position.latitude) ||
            !Number.isFinite(position.longitude) ||
            !Number.isFinite(position.altitude_km)
          ) {
            return;
          }

          const noradId = debris.norad_id;
          const entityId = `DEBRIS-${noradId}`;

          const cartesian = Cartesian3.fromDegrees(
            position.longitude,
            position.latitude,
            position.altitude_km * 1000
          );

          const debrisProperties = {
            objectType: 'Orbital Debris',
            noradId,
            latitude: position.latitude,
            longitude: position.longitude,
            altitude: position.altitude_km
          };

          let debrisEntity = viewer.entities.getById(entityId);

          if (!debrisEntity) {
            debrisEntity = viewer.entities.add({
              id: entityId,
              name: debris.name || 'COSMOS-2251 DEBRIS',
              position: cartesian,
              properties: new PropertyBag(debrisProperties),

              point: {
                pixelSize: 5,
                color: Color.ORANGERED,
                outlineColor: Color.WHITE,
                outlineWidth: 1,
                heightReference: HeightReference.NONE
              }
            });
          } else {
            debrisEntity.position = cartesian;

            Object.entries(debrisProperties).forEach(([key, value]) => {
              debrisEntity.properties[key].setValue(value);
            });
          }

          loadedCount++;
        });

        setDebrisCount(loadedCount);
        setDebrisStatus('Loaded');

      } catch (error) {
        console.error('Debris API error:', error);

        if (active) {
          setDebrisStatus('Loading failed');
        }
      }
    }

    updateDebris();

    const interval = setInterval(updateDebris, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);


useEffect(() => {
  let active = true;

  async function updateCollisionReport() {
    try {
      setCollisionStatus(
        `Screening NORAD ${collisionTarget.noradId}...`
      );

      const response = await getCollisionReport(
        collisionTarget.noradId,
        collisionTarget.group,
        'cosmos-2251-debris',
        3,
        60
      );

      if (!active) return;

      setCollisionReport(response);
      setCollisionStatus('Updated successfully');

    } catch (error) {
      console.error('Collision API error:', error);

      if (active) {
        setCollisionStatus(`Failed: ${error.message}`);
      }

    } finally {
      if (active) {
        setIndianScreeningLoading(false);
      }
    }
  }

  updateCollisionReport();

  const interval = setInterval(
    updateCollisionReport,
    60000
  );

  return () => {
    active = false;
    clearInterval(interval);
  };

}, [collisionTarget]);


  // =====================================
  // 5. INDIAN MISSION CATALOGUE
  // =====================================

  useEffect(() => {
    let active = true;

    async function loadIndianCatalogue() {
      try {
        setIndianStatus('Loading catalogue...');

        const response = await getIndianMissionCatalogue();

        if (!active) return;

        setIndianCatalogue(response.satellites || []);
        setIndianStatus('Catalogue loaded');

      } catch (error) {
        console.error('Indian catalogue error:', error);

        if (active) {
          setIndianStatus('Catalogue loading failed');
        }
      }
    }

    loadIndianCatalogue();

    return () => {
      active = false;
    };
  }, []);

  // =====================================
  // 6. CLICKABLE OBJECT DETECTION
  // =====================================

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer || viewer.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas
    );

    handler.setInputAction((movement) => {
      const pickedObject = viewer.scene.pick(
        movement.position
      );

      if (
        !pickedObject ||
        !pickedObject.id ||
        typeof pickedObject.id === 'string' ||
        !pickedObject.id.properties
      ) {
        setSelectedObject(null);
        return;
      }

      const entity = pickedObject.id;

      const properties = entity.properties.getValue(
        viewer.clock.currentTime
      );

      if (!properties) {
        setSelectedObject(null);
        return;
      }

      const isDebris =
        properties.objectType === 'Orbital Debris';

      const isIndianSatellite =
        properties.objectType === 'Indian Satellite';

      setSelectedObject({
        name: entity.name || 'Unknown Object',
        type: properties.objectType,
        noradId: properties.noradId,
        latitude: properties.latitude,
        longitude: properties.longitude,
        altitude: properties.altitude,
        group: isDebris
          ? 'cosmos-2251-debris'
          : isIndianSatellite
            ? 'active'
            : 'stations'
      });

    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, []);

  // =====================================
  // 7. ORBITAL TRAJECTORY VISUALIZATION
  // =====================================

  useEffect(() => {
    let active = true;

    async function drawTrajectory() {
      const viewer = viewerRef.current;

      if (!viewer || viewer.isDestroyed()) return;

      viewer.entities.removeById('SELECTED-TRAJECTORY');

      if (!selectedObject) {
        setTrajectoryStatus(
          'Select an object to view its trajectory'
        );
        return;
      }

      try {
        setTrajectoryStatus('Calculating trajectory...');

        const response = await getSatelliteTrajectory(
          selectedObject.noradId,
          selectedObject.group
        );

        if (!active) return;

        const trajectory = response.trajectory || [];

        if (trajectory.length < 2) {
          throw new Error('Insufficient trajectory points');
        }

        const positions = trajectory.map((point) =>
          Cartesian3.fromDegrees(
            point.longitude,
            point.latitude,
            point.altitude_km * 1000
          )
        );

        const trajectoryColor =
          selectedObject.type === 'Orbital Debris'
            ? Color.ORANGERED
            : selectedObject.type === 'Indian Satellite'
              ? Color.CYAN
              : Color.LIME;

        viewer.entities.add({
          id: 'SELECTED-TRAJECTORY',
          name: `${selectedObject.name} Predicted Trajectory`,
          polyline: {
            positions,
            width: 3,
            material: trajectoryColor.withAlpha(0.9),
            clampToGround: false
          }
        });

        setTrajectoryStatus(
          `Showing ${trajectory.length} predicted points over ${response.duration_minutes} minutes`
        );

      } catch (error) {
        console.error('Trajectory error:', error);

        if (active) {
          setTrajectoryStatus(
            'Trajectory calculation failed'
          );
        }
      }
    }

    drawTrajectory();

    return () => {
      active = false;

      const viewer = viewerRef.current;

      if (viewer && !viewer.isDestroyed()) {
        viewer.entities.removeById('SELECTED-TRAJECTORY');
      }
    };

  }, [selectedObject]);

  // =====================================
  // 8. TCA ENCOUNTER VISUALIZATION
  // =====================================

  useEffect(() => {
    const viewer = viewerRef.current;

    const entityIds = [
      'TCA-ISS-MARKER',
      'TCA-DEBRIS-MARKER',
      'TCA-CONNECTOR'
    ];

    if (!viewer || viewer.isDestroyed()) return;

    entityIds.forEach((id) => viewer.entities.removeById(id));

    if (!selectedEncounter) {
      setTcaCountdown('--:--:--');
      return;
    }

    const target = selectedEncounter.target_position_at_tca;
    const debris = selectedEncounter.debris_position_at_tca;

    const isValidPosition = (position) =>
      position &&
      Number.isFinite(Number(position.latitude)) &&
      Number.isFinite(Number(position.longitude)) &&
      Number.isFinite(Number(position.altitude_km));

    if (!isValidPosition(target) || !isValidPosition(debris)) {
      console.warn(
        'TCA positions are missing or invalid. Confirm that the backend returns target_position_at_tca and debris_position_at_tca.'
      );

      return () => {
        const currentViewer = viewerRef.current;

        if (currentViewer && !currentViewer.isDestroyed()) {
          entityIds.forEach((id) => currentViewer.entities.removeById(id));
        }
      };
    }
        const issPosition = Cartesian3.fromDegrees(
      Number(target.longitude),
      Number(target.latitude),
      Number(target.altitude_km) * 1000
    );

    const debrisPosition = Cartesian3.fromDegrees(
      Number(debris.longitude),
      Number(debris.latitude),
      Number(debris.altitude_km) * 1000
    );

    viewer.entities.add({
      id: 'TCA-ISS-MARKER',
      name: 'Target position at TCA',
      position: issPosition,
      point: {
        pixelSize: 15,
        color: Color.LIME,
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: 'TARGET - TCA',
        font: '13px sans-serif',
        fillColor: Color.LIME,
        pixelOffset: new Cartesian3(0, -25, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    viewer.entities.add({
      id: 'TCA-DEBRIS-MARKER',
      name: `${selectedEncounter.debris_name || 'Debris'} position at TCA`,
      position: debrisPosition,
      point: {
        pixelSize: 12,
        color: Color.ORANGE,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: 'DEBRIS - TCA',
        font: '12px sans-serif',
        fillColor: Color.ORANGE,
        pixelOffset: new Cartesian3(0, -23, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    // BRIGHT YELLOW TCA CONNECTOR

    viewer.entities.add({
      id: 'TCA-CONNECTOR',
      name: 'TCA Miss Distance Connector',
      polyline: {
        positions: [issPosition, debrisPosition],
        width: 8,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Color.YELLOW
        }),
        depthFailMaterial: Color.YELLOW,
        arcType: ArcType.NONE,
        clampToGround: false
      }
    });

    const midpoint = Cartesian3.midpoint(
      issPosition,
      debrisPosition,
      new Cartesian3()
    );

    const separationMeters = Cartesian3.distance(
      issPosition,
      debrisPosition
    );

    viewer.camera.flyToBoundingSphere(
      new BoundingSphere(
        midpoint,
        Math.max(separationMeters * 2, 100000)
      ),
      { duration: 2 }
    );

    return () => {
      const currentViewer = viewerRef.current;

      if (currentViewer && !currentViewer.isDestroyed()) {
        entityIds.forEach((id) => currentViewer.entities.removeById(id));
      }
    };
  }, [selectedEncounter]);

  // =====================================
  // 9. LIVE TCA COUNTDOWN
  // =====================================

  useEffect(() => {
    const tcaValue = selectedEncounter?.closest_approach_time;

    if (!tcaValue) {
      setTcaCountdown('--:--:--');
      return;
    }

    const updateCountdown = () => {
      const tcaMilliseconds = new Date(tcaValue).getTime();

      if (!Number.isFinite(tcaMilliseconds)) {
        setTcaCountdown('Invalid TCA time');
        return;
      }

      const remainingMilliseconds = tcaMilliseconds - Date.now();

      if (remainingMilliseconds <= 0) {
        setTcaCountdown('TCA passed');
        return;
      }

      const totalSeconds = Math.floor(remainingMilliseconds / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTcaCountdown(
        `T-${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`
      );
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [selectedEncounter]);

  // =====================================
  // 10. VISUAL COLLISION SIMULATION
  // =====================================

  function removeSimulationEntities() {
    const viewer = viewerRef.current;
    const sim = simulationRef.current;

    if (sim.timer) {
      clearInterval(sim.timer);
      sim.timer = null;
    }

    if (viewer && !viewer.isDestroyed()) {
      sim.entities.forEach((entity) => {
        if (entity && entity.id) {
          viewer.entities.removeById(entity.id);
        }
      });
    }

    sim.entities = [];
    sim.fragments = [];
    sim.flash = null;
    sim.impactPosition = null;
  }

  function restoreOriginalEntities() {
    const viewer = viewerRef.current;
    const sim = simulationRef.current;

    if (viewer && !viewer.isDestroyed()) {
      sim.hiddenOriginals.forEach(({ id, previousShow }) => {
        const entity = viewer.entities.getById(id);

        if (entity) {
          entity.show = previousShow;
        }
      });
    }

    sim.hiddenOriginals = [];
  }

  function resetCollisionSimulation() {
    removeSimulationEntities();
    restoreOriginalEntities();

    setSimulationProgress(0);
    setSimulationStatus('idle');
  }

  function updateSimulationFrame() {
    const sim = simulationRef.current;
    const viewer = viewerRef.current;

    if (!viewer || viewer.isDestroyed()) return;

    const elapsed = Date.now() - sim.startTime;
    const rawProgress = Math.min(elapsed / sim.duration, 1);

    const smoothProgress =
      rawProgress * rawProgress * (3 - 2 * rawProgress);

    const issProxy = viewer.entities.getById('SIM-ISS-PROXY');
    const debrisProxy = viewer.entities.getById('SIM-DEBRIS-PROXY');

    if (!issProxy || !debrisProxy) return;

    const currentISS = Cartesian3.lerp(
      sim.issStart,
      sim.impactPosition,
      smoothProgress,
      new Cartesian3()
    );

    const currentDebris = Cartesian3.lerp(
      sim.debrisStart,
      sim.impactPosition,
      smoothProgress,
      new Cartesian3()
    );

    issProxy.position = currentISS;
    debrisProxy.position = currentDebris;

    const hasImpacted = rawProgress >= 0.88;

    sim.fragments.forEach(({ entity, direction, visualSpeed }) => {
      entity.show = hasImpacted;

      if (hasImpacted) {
        const fragmentElapsed = (rawProgress - 0.88) / 0.12;
        const travelDistance = fragmentElapsed * visualSpeed;

        const offset = Cartesian3.multiplyByScalar(
          direction,
          travelDistance,
          new Cartesian3()
        );

        entity.position = Cartesian3.add(
          sim.impactPosition,
          offset,
          new Cartesian3()
        );
      }
    });

    if (sim.flash) {
      sim.flash.show = hasImpacted;

      if (hasImpacted) {
        const pulse = Math.abs(Math.sin(elapsed / 110));
        const radius = 8000 + pulse * 32000;

        sim.flash.ellipsoid.radii = new Cartesian3(
          radius,
          radius,
          radius
        );
      }
    }

    setSimulationProgress(Math.round(rawProgress * 100));

    if (rawProgress >= 1) {
      clearInterval(sim.timer);
      sim.timer = null;
      setSimulationStatus('completed');
    }
  }

  function startCollisionSimulation() {
    const viewer = viewerRef.current;

    if (!viewer || viewer.isDestroyed()) return;

    if (
      !selectedObject ||
      selectedObject.type !== 'Orbital Debris'
    ) {
      setSimulationStatus('Select a debris object first');
      return;
    }

    if (!satellite) {
      setSimulationStatus('Waiting for ISS position data');
      return;
    }

    removeSimulationEntities();
    restoreOriginalEntities();

    const issEntity = viewer.entities.getById('ISS-25544');

    const debrisEntity = viewer.entities.getById(
      `DEBRIS-${selectedObject.noradId}`
    );

    if (!issEntity || !debrisEntity) {
      setSimulationStatus(
        'Could not find both objects on the globe'
      );
      return;
    }

    const impactPosition = Cartesian3.fromDegrees(
      selectedObject.longitude,
      selectedObject.latitude,
      selectedObject.altitude * 1000
    );

    const longitudeRadians =
      selectedObject.longitude * Math.PI / 180;

    const eastDirection = Cartesian3.normalize(
      new Cartesian3(
        -Math.sin(longitudeRadians),
        Math.cos(longitudeRadians),
        0
      ),
      new Cartesian3()
    );

    const approachOffset = Cartesian3.multiplyByScalar(
      eastDirection,
      120000,
      new Cartesian3()
    );

    const issStart = Cartesian3.add(
      impactPosition,
      approachOffset,
      new Cartesian3()
    );

    const debrisStart = Cartesian3.subtract(
      impactPosition,
      approachOffset,
      new Cartesian3()
    );

    const sim = simulationRef.current;

    sim.hiddenOriginals = [
      {
        id: 'ISS-25544',
        previousShow: issEntity.show
      },
      {
        id: `DEBRIS-${selectedObject.noradId}`,
        previousShow: debrisEntity.show
      }
    ];

    issEntity.show = false;
    debrisEntity.show = false;

    const issProxy = viewer.entities.add({
      id: 'SIM-ISS-PROXY',
      name: 'ISS collision simulation object',
      position: issStart,

      point: {
        pixelSize: 17,
        color: Color.LIME,
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },

      label: {
        text: 'ISS (SIMULATION)',
        font: '13px sans-serif',
        fillColor: Color.WHITE,
        pixelOffset: new Cartesian3(0, -25, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    const debrisProxy = viewer.entities.add({
      id: 'SIM-DEBRIS-PROXY',
      name: 'Debris collision simulation object',
      position: debrisStart,

      point: {
        pixelSize: 12,
        color: Color.ORANGERED,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },

      label: {
        text: `DEBRIS ${selectedObject.noradId}`,
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        pixelOffset: new Cartesian3(0, -22, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    sim.entities.push(issProxy, debrisProxy);

    sim.impactPosition = impactPosition;
    sim.issStart = issStart;
    sim.debrisStart = debrisStart;
    sim.fragments = [];

    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const z = -0.8 + (i / 17) * 1.6;
      const planar = Math.sqrt(Math.max(0, 1 - z * z));

      const direction = Cartesian3.normalize(
        new Cartesian3(
          Math.cos(angle) * planar,
          Math.sin(angle) * planar,
          z
        ),
        new Cartesian3()
      );

      const fragment = viewer.entities.add({
        id: `SIM-FRAGMENT-${i}`,
        name: `Simulated fragment ${i + 1}`,
        show: false,
        position: impactPosition,

        point: {
          pixelSize: 5 + (i % 3),
          color: Color.ORANGE,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });

      sim.entities.push(fragment);

      sim.fragments.push({
        entity: fragment,
        direction,
        visualSpeed: 35000 + (i % 5) * 12000
      });
    }

    const flash = viewer.entities.add({
      id: 'SIM-COLLISION-FLASH',
      name: 'Hypothetical collision flash',
      position: impactPosition,
      show: false,

      ellipsoid: {
        radii: new Cartesian3(10000, 10000, 10000),
        material: Color.ORANGERED.withAlpha(0.55),
        outline: true,
        outlineColor: Color.YELLOW
      }
    });

    sim.entities.push(flash);
    sim.flash = flash;

    sim.duration = 8000;
    sim.startTime = Date.now();
    sim.pausedAt = 0;

    setSimulationProgress(0);
    setSimulationStatus('running');

    sim.timer = setInterval(updateSimulationFrame, 30);
  }

  function pauseCollisionSimulation() {
    const sim = simulationRef.current;

    if (sim.timer && sim.pausedAt === 0) {
      clearInterval(sim.timer);

      sim.timer = null;
      sim.pausedAt = Date.now();

      setSimulationStatus('paused');
    }
  }

  function resumeCollisionSimulation() {
    const sim = simulationRef.current;

    if (sim.pausedAt === 0 || !sim.impactPosition) return;

    const pausedDuration = Date.now() - sim.pausedAt;

    sim.startTime += pausedDuration;
    sim.pausedAt = 0;

    setSimulationStatus('running');

    sim.timer = setInterval(updateSimulationFrame, 30);
  }

  // =====================================
  // 11. TRACK INDIAN SATELLITE ON CESIUM
  // =====================================

  async function trackIndianSatellite(mission) {
    const viewer = viewerRef.current;

    if (!viewer || viewer.isDestroyed()) return;

    try {
      setTrackingIndianId(mission.norad_id);
      setIndianStatus(`Retrieving ${mission.name} orbital data...`);

      const response = await getIndianSatellitePosition(
        mission.norad_id
      );

      const result = response.satellites?.[0];
      const position = result?.geographic_position;

      if (
        !position ||
        !Number.isFinite(Number(position.latitude)) ||
        !Number.isFinite(Number(position.longitude)) ||
        !Number.isFinite(Number(position.altitude_km))
      ) {
        throw new Error('Valid satellite position was not returned by the API');
      }

      const latitude = Number(position.latitude);
      const longitude = Number(position.longitude);
      const altitude = Number(position.altitude_km);

      const cartesian = Cartesian3.fromDegrees(
        longitude,
        latitude,
        altitude * 1000
      );

      const entityId = `INDIAN-SAT-${mission.norad_id}`;

      const markerColor = mission.category === 'navigation'
        ? Color.CYAN
        : Color.MAGENTA;

      const properties = new PropertyBag({
        objectType: 'Indian Satellite',
        noradId: mission.norad_id,
        category: mission.category,
        constellation: mission.constellation,
        mission: mission.mission,
        role: mission.role,
        country: mission.country || 'India',
        latitude,
        longitude,
        altitude
      });

      let entity = viewer.entities.getById(entityId);

      if (!entity) {
        entity = viewer.entities.add({
          id: entityId,
          name: mission.name,
          position: cartesian,
          properties,

          point: {
            pixelSize: 13,
            color: markerColor,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },

          label: {
            text: mission.name,
            font: '13px sans-serif',
            fillColor: markerColor,
            pixelOffset: new Cartesian3(0, -25, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
      } else {
        entity.position = cartesian;
        entity.properties = properties;
      }

      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(cartesian, 1500000),
        { duration: 2 }
      );
            setSelectedObject({
        name: mission.name,
        type: 'Indian Satellite',
        noradId: mission.norad_id,
        latitude,
        longitude,
        altitude,
        group: 'active'
      });

      setIndianStatus(`${mission.name} tracked successfully`);

    } catch (error) {
      console.error('Indian satellite tracking error:', error);
      setIndianStatus(`Tracking failed: ${error.message}`);

    } finally {
      setTrackingIndianId(null);
    }
  }
function screenSelectedIndianSatellite() {
  if (!selectedObject || selectedObject.type !== 'Indian Satellite') {
    return;
  }

  setIndianScreeningLoading(true);

  setSelectedEncounter(null);

  setCollisionStatus(
    `Screening ${selectedObject.name} against orbital debris...`
  );

  setCollisionTarget({
    noradId: selectedObject.noradId,
    group: 'active'
  });

  setShowMonitoring(true);
}
  // =====================================
  // 12. RISK CLASSIFICATION
  // =====================================

  function getRiskLevel(distance) {
    if (distance < 10) return 'HIGH';
    if (distance < 50) return 'MEDIUM';
    if (distance < 100) return 'LOW';

    return 'NO ALERT';
  }

  function getPriorityClass(priority) {
    return priority.toLowerCase().replaceAll(' ', '-');
  }

  // =====================================
  // 13. TCA AND RELATIVE VELOCITY FORMATTERS
  // =====================================

  function formatTCA(value) {
    if (!value) return 'N/A';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' UTC';
  }

  function formatTCAOffset(value) {
    const seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds < 0) return 'N/A';

    const wholeSeconds = Math.floor(seconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainingSeconds = wholeSeconds % 60;

    return hours > 0
      ? `${hours}h ${minutes}m ${remainingSeconds}s`
      : `${minutes}m ${remainingSeconds}s`;
  }

  function formatRelativeSpeed(value) {
    const speed = Number(value);

    return Number.isFinite(speed)
      ? `${speed.toFixed(3)} km/s`
      : 'N/A';
  }

  function formatVector(values, unit) {
    if (!Array.isArray(values) || values.length !== 3) {
      return 'N/A';
    }

    const numbers = values.map(Number);

    if (!numbers.every(Number.isFinite)) return 'N/A';

    return `[${numbers.map((value) => value.toFixed(3)).join(', ')}] ${unit}`;
  }

  // =====================================
  // 14. FRONTEND UI
  // =====================================

  const statusTone =
    status === 'Connected'
      ? 'ok'
      : status === 'Connecting...'
        ? 'pending'
        : 'error';

  const visibleMissions = indianCatalogue.filter(
    (mission) =>
      indianCategory === 'all' || mission.category === indianCategory
  );

  return (
    <div className="app">

      <header className="topbar">

        <div className="brand">
          <h1 className="brand-name">OrbitGuard</h1>
          <span className="topbar-subtitle">Space situational awareness</span>
        </div>

        <div className="topbar-actions">

          <span className={`status ${statusTone}`} role="status">
            {status}
          </span>

          <button
            type="button"
            className="btn"
            onClick={() => setShowMonitoring((previous) => !previous)}
            aria-expanded={showMonitoring}
          >
            {showMonitoring ? 'Hide monitoring' : 'Show monitoring'}
          </button>

        </div>

      </header>

      <main className={`globe-container${showMonitoring ? ' has-rail' : ''}`}>

        <div
          ref={cesiumContainer}
          className="cesium-viewer"
        />

        {showMonitoring && (
          <div id="orbitguard-monitoring-panels">

            {/* Indian space mission monitoring */}
            {dashboardVisibility.indianMissions && (
              <section className="indian-mission-panel">

                <PanelHeader
                  title="Indian space missions"
                  subtitle="ISRO mission catalogue"
                  onHide={() => toggleDashboard('indianMissions')}
                />

                <p className="panel-status">{indianStatus}</p>

                <div className="chip-row">
                  <span className="chip">Domain 01 – ISRO missions</span>
                  <span className="chip">Domain 04 – Communication / navigation</span>
                </div>

                <div
                  className="segmented"
                  role="group"
                  aria-label="Filter missions by category"
                >
                  {[
                    { label: 'All', value: 'all' },
                    { label: 'Communication', value: 'communication' },
                    { label: 'Navigation', value: 'navigation' }
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={indianCategory === filter.value ? 'active' : ''}
                      aria-pressed={indianCategory === filter.value}
                      onClick={() => setIndianCategory(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <p className="list-count">
                  Showing {visibleMissions.length} of {indianCatalogue.length} missions
                </p>

                <div className="indian-satellite-list">

                  {visibleMissions.map((mission) => (
                    <div
                      className="indian-satellite-card"
                      key={mission.norad_id}
                    >

                      <div className="indian-satellite-info">
                        <strong>{mission.name}</strong>
                        <span className="mono">NORAD {mission.norad_id}</span>
                        <span>{mission.constellation}</span>
                        <span>{mission.role}</span>
                        <span className="mission-category">{mission.category}</span>
                      </div>

                      <button
                        type="button"
                        className="btn small"
                        onClick={() => trackIndianSatellite(mission)}
                        disabled={trackingIndianId !== null}
                      >
                        {trackingIndianId === mission.norad_id
                          ? 'Tracking…'
                          : 'Track on globe'}
                      </button>

                    </div>
                  ))}

                  {indianCatalogue.length === 0 && (
                    <p className="empty">
                      No Indian mission catalogue entries available.
                    </p>
                  )}

                </div>

                <p className="note">
                  Orbital positions are retrieved individually. Catalogue
                  entries do not establish current operational status.
                </p>

              </section>
            )}

            {/* Satellite monitoring */}
            {dashboardVisibility.satelliteMonitoring && (
              <section className="satellite-panel">

                <PanelHeader
                  title="Satellite monitoring"
                  subtitle="Live satellite and debris telemetry"
                  onHide={() => toggleDashboard('satelliteMonitoring')}
                />

                <ul className="legend">
                  <li><span className="swatch" style={{ background: '#00ff00' }} />ISS</li>
                  <li><span className="swatch" style={{ background: '#ff4500' }} />COSMOS-2251 debris</li>
                  <li><span className="swatch" style={{ background: '#00ffff' }} />Navigation satellites</li>
                  <li><span className="swatch" style={{ background: '#ff00ff' }} />Communication satellites</li>
                </ul>

                <h4 className="subhead">ISS telemetry</h4>

                {satellite ? (
                  <dl className="data-list">
                    <Field label="Name">{satellite.name}</Field>
                    <Field label="NORAD ID">{satellite.norad}</Field>
                    <Field label="Latitude">{satellite.latitude.toFixed(4)}°</Field>
                    <Field label="Longitude">{satellite.longitude.toFixed(4)}°</Field>
                    <Field label="Altitude">{satellite.altitude.toFixed(2)} km</Field>
                  </dl>
                ) : (
                  <p className="empty">Waiting for ISS data…</p>
                )}

                <h4 className="subhead">Debris monitoring</h4>

                <dl className="data-list">
                  <Field label="Objects loaded">{debrisCount}</Field>
                  <Field label="Status">{debrisStatus}</Field>
                </dl>

              </section>
            )}

            {/* Collision screening */}
            {dashboardVisibility.collisionScreening && (
              <section className="collision-panel">

                <PanelHeader
                  title="Collision risk"
                  subtitle="Conjunction screening and TCA estimates"
                  onHide={() => toggleDashboard('collisionScreening')}
                />

                <p className="panel-status">{collisionStatus}</p>

                {collisionReport ? (
                  <>

                    <dl className="data-list">
                      <Field label="Target">{collisionReport.target_satellite}</Field>
                      <Field label="Debris screened">{collisionReport.debris_objects_screened}</Field>
                      <Field label="Analysis window">{collisionReport.analysis_window_hours} hours</Field>
                      <Field label="Sampling interval">{collisionReport.sampling_interval_seconds} seconds</Field>
                    </dl>

                    <h4 className="subhead">Risk classification</h4>

                    <div className="risk-summary">

                      <div className="risk-card high">
                        <strong>{collisionReport.alert_report?.high_priority ?? 0}</strong>
                        <span>High</span>
                      </div>

                      <div className="risk-card medium">
                        <strong>{collisionReport.alert_report?.medium_priority ?? 0}</strong>
                        <span>Medium</span>
                      </div>

                      <div className="risk-card low">
                        <strong>{collisionReport.alert_report?.low_priority ?? 0}</strong>
                        <span>Low</span>
                      </div>

                    </div>

                    <p className="list-count">
                      No screening alerts:{' '}
                      {collisionReport.alert_report?.no_screening_alert ?? 0}
                    </p>

                    <h4 className="subhead">Closest approaches</h4>

                    <p className="list-count">
                      Showing {collisionReport.closest_approaches?.length ?? 0} closest
                      encounters. Select a row to view its TCA positions.
                    </p>

                    <div className="collision-table-wrapper">

                      <table className="collision-table">

                        <thead>
                          <tr>
                            <th>NORAD ID</th>
                            <th>Miss distance</th>
                            <th>TCA (UTC)</th>
                            <th>Relative speed</th>
                            <th>Priority</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(collisionReport.closest_approaches || []).map(
                            (item) => {
                              const distance =
                                Number(item.minimum_separation_km);

                              const priority = getRiskLevel(distance);

                              return (
                                <tr
                                  key={item.debris_norad_id}
                                  onClick={() => setSelectedEncounter(item)}
                                  className={
                                    selectedEncounter?.debris_norad_id === item.debris_norad_id
                                      ? 'selected-encounter'
                                      : ''
                                  }
                                  title="Select this encounter to view its TCA positions"
                                >
                                  <td>{item.debris_norad_id}</td>

                                  <td>
                                    {Number.isFinite(distance)
                                      ? `${distance.toFixed(3)} km`
                                      : 'N/A'}
                                  </td>

                                  <td>
                                    <span title={item.closest_approach_time || ''}>
                                      {formatTCA(item.closest_approach_time)}
                                    </span>

                                    {item.tca_at_window_boundary && (
                                      <small className="tca-boundary-warning">
                                        Window boundary
                                      </small>
                                    )}
                                  </td>

                                  <td>
                                    {formatRelativeSpeed(item.relative_speed_km_s)}
                                  </td>

                                  <td>
                                    <span
                                      className={`priority ${getPriorityClass(priority)}`}
                                    >
                                      {priority}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>

                      </table>

                    </div>

                    <p className="note">
                      TCA and relative speed are estimates from the current
                      orbital screening model. Distance bands are prototype
                      indicators, not collision probabilities or confirmed
                      collision warnings. Boundary encounters may require a
                      longer screening window.
                    </p>

                  </>
                ) : (
                  <p className="empty">Waiting for collision screening data…</p>
                )}

              </section>
            )}

            {/* Alert dashboard */}
            {dashboardVisibility.alertDashboard && (
              <section className="alert-panel">

                <PanelHeader
                  title="Alert dashboard"
                  subtitle="Latest collision alerts"
                  onHide={() => toggleDashboard('alertDashboard')}
                />

                {collisionReport?.alert_report ? (
                  <>

                    <div className="risk-summary">

                      <div className="risk-card high">
                        <strong>{collisionReport.alert_report.high_priority ?? 0}</strong>
                        <span>High</span>
                      </div>

                      <div className="risk-card medium">
                        <strong>{collisionReport.alert_report.medium_priority ?? 0}</strong>
                        <span>Medium</span>
                      </div>

                      <div className="risk-card low">
                        <strong>{collisionReport.alert_report.low_priority ?? 0}</strong>
                        <span>Low</span>
                      </div>

                    </div>

                    <div className="alert-list">

                      {(collisionReport.alert_report.alerts || []).length > 0 ? (
                        collisionReport.alert_report.alerts.map((alert, index) => {

                          const priority = String(
                            alert.priority ||
                            alert.risk_level ||
                            alert.severity ||
                            'NO_SCREENING_ALERT'
                          ).toUpperCase();

                          const priorityClass = priority
                            .toLowerCase()
                            .replaceAll('_', '-');

                          const distance = Number(
                            alert.minimum_separation_km ??
                            alert.closest_approach_distance_km
                          );

                          return (
                            <article
                              className="alert-item"
                              key={`${alert.debris_norad_id ?? alert.norad_id ?? 'debris'}-${index}`}
                            >

                              <div className="alert-item-header">

                                <strong className="mono">
                                  NORAD {
                                    alert.debris_norad_id ??
                                    alert.norad_id ??
                                    'Unknown'
                                  }
                                </strong>

                                <span className={`alert-priority ${priorityClass}`}>
                                  {priority.replaceAll('_', ' ')}
                                </span>

                              </div>

                              <dl className="data-list">

                                <Field label="Minimum separation">
                                  {Number.isFinite(distance)
                                    ? `${distance.toFixed(3)} km`
                                    : 'Not available'}
                                </Field>

                                {(alert.closest_approach_time ||
                                  alert.time_of_closest_approach) && (
                                  <Field label="TCA (UTC)">
                                    {formatTCA(
                                      alert.closest_approach_time ||
                                      alert.time_of_closest_approach
                                    )}
                                  </Field>
                                )}

                                {alert.relative_speed_km_s !== undefined && (
                                  <Field label="Relative velocity">
                                    {formatRelativeSpeed(alert.relative_speed_km_s)}
                                  </Field>
                                )}

                                {alert.tca_offset_seconds !== undefined && (
                                  <Field label="TCA from screening start">
                                    {formatTCAOffset(alert.tca_offset_seconds)}
                                  </Field>
                                )}

                              </dl>

                              {alert.tca_at_window_boundary && (
                                <p className="tca-boundary-warning">
                                  Closest sampled approach is at the
                                  screening-window boundary. Extend the window
                                  to check whether the true closest approach is outside it.
                                </p>
                              )}

                              {Array.isArray(alert.relative_position_vector_km) && (
                                <details className="encounter-vectors">
                                  <summary>Relative state vectors</summary>

                                  <dl className="data-list">
                                    <Field label="Relative position">
                                      {formatVector(
                                        alert.relative_position_vector_km,
                                        'km'
                                      )}
                                    </Field>

                                    <Field label="Relative velocity">
                                      {formatVector(
                                        alert.relative_velocity_vector_km_s,
                                        'km/s'
                                      )}
                                    </Field>
                                  </dl>
                                </details>
                              )}

                              {alert.explanation && (
                                <p className="alert-explanation">{alert.explanation}</p>
                              )}

                            </article>
                          );
                        })
                      ) : (
                        <p className="empty">
                          No individual alert entries were returned by the backend.
                        </p>
                      )}

                    </div>

                    <p className="note">
                      Latest screening report only. Distance bands are prototype
                      indicators, not collision probabilities.
                    </p>

                  </>
                ) : (
                  <p className="empty">Waiting for alert report…</p>
                )}

              </section>
            )}

          </div>
        )}

        {showMonitoring && (
          <div className="dashboard-restore-bar">
            {[
              { key: 'indianMissions', label: 'Indian missions' },
              { key: 'satelliteMonitoring', label: 'Satellite monitoring' },
              { key: 'collisionScreening', label: 'Collision screening' },
              { key: 'alertDashboard', label: 'Alert dashboard' }
            ]
              .filter((dashboard) => !dashboardVisibility[dashboard.key])
              .map((dashboard) => (
                <button
                  key={dashboard.key}
                  type="button"
                  className="btn small floating"
                  onClick={() => toggleDashboard(dashboard.key)}
                >
                  Show {dashboard.label}
                </button>
              ))}
          </div>
        )}

        {selectedEncounter && (
          <section className="tca-panel">

            <div className="float-header">
              <h3>Time of closest approach</h3>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedEncounter(null)}
                aria-label="Close TCA details"
              >
                ×
              </button>
            </div>

            <h3 className="tca-countdown">{tcaCountdown}</h3>

            <dl className="data-list">
              <Field label="Target">
                {selectedEncounter.target_name || collisionReport?.target_satellite || 'ISS'}
              </Field>
              <Field label="Debris">
                {selectedEncounter.debris_name || 'Unknown debris'}
              </Field>
              <Field label="Debris NORAD ID">
                {selectedEncounter.debris_norad_id ?? 'N/A'}
              </Field>
              <Field label="Miss distance">
                {Number.isFinite(Number(selectedEncounter.minimum_separation_km))
                  ? `${Number(selectedEncounter.minimum_separation_km).toFixed(3)} km`
                  : 'N/A'}
              </Field>
              <Field label="Relative velocity">
                {formatRelativeSpeed(selectedEncounter.relative_speed_km_s)}
              </Field>
              <Field label="TCA (UTC)">
                {formatTCA(selectedEncounter.closest_approach_time)}
              </Field>
            </dl>

            {selectedEncounter.tca_at_window_boundary && (
              <p className="tca-warning">
                Closest approach is at the analysis-window boundary. Extend
                the screening window to investigate further.
              </p>
            )}

            {(!selectedEncounter.target_position_at_tca ||
              !selectedEncounter.debris_position_at_tca) && (
              <p className="tca-warning">
                TCA coordinates are unavailable. Check the backend response
                for both geographic position fields.
              </p>
            )}

            <p className="note">
              Green and orange markers show the predicted object positions at
              TCA. The yellow line connects those positions.
            </p>

          </section>
        )}

        {showMonitoring && selectedObject && (
          <section className="object-details-panel">

            <div className="float-header">

              <h3>Selected object</h3>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedObject(null)}
                aria-label="Close object details"
              >
                ×
              </button>

            </div>

            <dl className="data-list">
              <Field label="Name">{selectedObject.name}</Field>
              <Field label="Category">{selectedObject.type}</Field>
              <Field label="NORAD ID">{selectedObject.noradId}</Field>
              <Field label="Latitude">{selectedObject.latitude.toFixed(4)}°</Field>
              <Field label="Longitude">{selectedObject.longitude.toFixed(4)}°</Field>
              <Field label="Altitude">{selectedObject.altitude.toFixed(2)} km</Field>
            </dl>

            <h4 className="subhead">Orbital trajectory</h4>

            <p className="panel-status">{trajectoryStatus}</p>

            {selectedObject.type === 'Indian Satellite' && (
              <>
                <h4 className="subhead">Satellite protection</h4>

                <p className="panel-status">
                  Screen this satellite against the selected orbital debris
                  dataset.
                </p>

                <button
                  type="button"
                  className="btn primary"
                  onClick={screenSelectedIndianSatellite}
                  disabled={indianScreeningLoading}
                >
                  {indianScreeningLoading
                    ? 'Screening…'
                    : 'Screen for collision risk'}
                </button>
              </>
            )}

            {selectedObject.type === 'Orbital Debris' && (
              <>

                <h4 className="subhead">Visual collision simulation</h4>

                <p className="tca-warning simulation-disclaimer">
                  Hypothetical local visual scenario. The ISS marker is
                  repositioned for animation. This is not a real encounter
                  prediction.
                </p>

                <div className="sim-readout">
                  <span className="sim-state">{simulationStatus}</span>
                  <span className="mono">{simulationProgress}%</span>
                </div>

                <div
                  className="simulation-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={simulationProgress}
                >
                  <div
                    className="simulation-progress-fill"
                    style={{
                      width: `${simulationProgress}%`
                    }}
                  />
                </div>

                <div className="simulation-actions">

                  <button
                    type="button"
                    className="btn primary"
                    onClick={startCollisionSimulation}
                    disabled={
                      simulationStatus === 'running' ||
                      simulationStatus === 'paused'
                    }
                  >
                    Simulate collision
                  </button>

                  {simulationStatus === 'running' && (
                    <button
                      type="button"
                      className="btn"
                      onClick={pauseCollisionSimulation}
                    >
                      Pause
                    </button>
                  )}

                  {simulationStatus === 'paused' && (
                    <button
                      type="button"
                      className="btn"
                      onClick={resumeCollisionSimulation}
                    >
                      Resume
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn danger"
                    onClick={resetCollisionSimulation}
                  >
                    Reset
                  </button>

                </div>

              </>
            )}

          </section>
        )}

      </main>
    </div>
  );
}

// =====================================
// PRESENTATIONAL HELPERS (no state, no data access)
// =====================================

function PanelHeader({ title, subtitle, onHide }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <span className="panel-subtitle">{subtitle}</span>
      </div>

      <button
        type="button"
        className="btn ghost small"
        onClick={onHide}
        aria-label={`Hide ${title}`}
      >
        Hide
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default App;
