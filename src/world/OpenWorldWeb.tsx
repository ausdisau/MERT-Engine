import React, { useEffect, useRef, useState } from 'react';
import { InfrastructureEntity, PersonEntity, PersistentWorldStore, accessAssessment } from './worldModel';
import { WorldRuntime } from './liveWorldLoop';
import { nearbyEntities, createSpatialIntent, evaluateSpatialIntent } from './spatialInteraction';
import { WOLFRAM_ROUTE_MODEL } from './accessibleNavigation';
import { WOLFRAM_OBJECT_MODELS } from './objectInteractions';
import { WOLFRAM_SOCIAL_MODEL } from './socialEncounters';
import { WOLFRAM_CONTINUITY_MODEL } from './continuity';
import { createCityVisuals, type CityVisualController } from './cityRendering';

export function OpenWorldWeb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storeRef = useRef<PersistentWorldStore | null>(null);
  const runtimeRef = useRef<WorldRuntime | null>(null);
  const cityVisualRef = useRef<CityVisualController | null>(null);
  const tripRef = useRef<string | null>(null);
  if (!storeRef.current) storeRef.current = new PersistentWorldStore();

  const [status, setStatus] = useState('Loading world…');
  const [xr, setXr] = useState('Checking WebXR…');
  const [access, setAccess] = useState('ACCESS NETWORK ONLINE');
  const [life, setLife] = useState('DAILY LIFE ENGINE STARTING');
  const [clinical, setClinical] = useState('CLINICAL BRIDGE · STANDBY');
  const [nearby, setNearby] = useState('NEARBY · scanning');
  const [route, setRoute] = useState('NAVMESH · calculating');
  const [encounters, setEncounters] = useState('SOCIAL ENCOUNTERS · scanning');
  const [continuity, setContinuity] = useState('CONTINUITY · community');
  const [city, setCity] = useState('CITY · generating');
  const [services, setServices] = useState('HOMES + TRANSPORT · starting');
  const [ems, setEms] = useState('EMS · available');
  const [navVisible, setNavVisible] = useState(false);

  useEffect(() => {
    let disposed = false;
    let engine: any;
    let scene: any;
    let routeMesh: any;
    const store = storeRef.current!;
    const runtime = new WorldRuntime(store);
    runtimeRef.current = runtime;

    const boot = async () => {
      const B = await import('@babylonjs/core');
      await import('@babylonjs/loaders');
      if (!canvasRef.current || disposed) return;

      engine = new B.Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
      scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(.72, .86, .96, 1);
      scene.collisionsEnabled = true;

      const camera = new B.UniversalCamera('player', new B.Vector3(0, 1.65, -16), scene);
      camera.attachControl(canvasRef.current, true);
      camera.speed = .55;
      camera.angularSensibility = 3500;
      camera.applyGravity = true;
      camera.checkCollisions = true;
      camera.ellipsoid = new B.Vector3(.5, .9, .5);
      camera.keysUp.push(87); camera.keysDown.push(83); camera.keysLeft.push(65); camera.keysRight.push(68);

      new B.HemisphericLight('sky', new B.Vector3(0, 1, 0), scene).intensity = .85;
      new B.DirectionalLight('sun', new B.Vector3(-.4, -1, .25), scene).intensity = .7;

      const material = (name: string, r: number, g: number, b: number) => {
        const value = new B.StandardMaterial(name, scene);
        value.diffuseColor = new B.Color3(r, g, b);
        return value;
      };

      const ground = B.MeshBuilder.CreateGround('city-ground', { width: 560, height: 560 }, scene);
      ground.checkCollisions = true;
      ground.material = material('ground', .38, .55, .35);
      const centralPath = B.MeshBuilder.CreateGround('central-accessible-path', { width: 12, height: 190 }, scene);
      centralPath.position.y = .015;
      centralPath.material = material('central-path', .62, .61, .57);

      const buildingMat = material('core-building', .72, .76, .78);
      const makeBuilding = (label: string, x: number, z: number, width: number, depth: number, height: number) => {
        const body = B.MeshBuilder.CreateBox(label, { width, depth, height }, scene);
        body.position.set(x, height / 2, z);
        body.material = buildingMat;
        body.checkCollisions = true;
      };
      makeBuilding('Clinical Simulation Centre', -24, 8, 28, 20, 10);
      makeBuilding('Community Hub', 25, 22, 26, 18, 7);
      makeBuilding('Rehabilitation Lab', 24, -28, 24, 18, 8);
      makeBuilding('Accessible Transit Station', -25, -34, 30, 15, 6);

      const cityVisuals = createCityVisuals(B, scene, runtime, material);
      cityVisualRef.current = cityVisuals;

      const personMat = material('people', .22, .32, .55);
      const personMeshes = new Map<string, any>();
      const createPerson = (person: PersonEntity) => {
        if (personMeshes.has(person.id)) return;
        const body = B.MeshBuilder.CreateCapsule(person.id, { height: 1.35, radius: .3 }, scene);
        body.position.set(person.position[0], 1.05, person.position[2]);
        body.material = personMat;
        personMeshes.set(person.id, body);
        if (person.mobility.mode.includes('wheelchair')) {
          const mobility = B.MeshBuilder.CreateBox(`${person.id}-mobility`, { width: .85, height: .55, depth: 1.05 }, scene);
          mobility.position.set(person.position[0], .38, person.position[2]);
          mobility.material = personMat;
          personMeshes.set(`${person.id}-mobility`, mobility);
        }
      };
      for (const entity of store.snapshot().entities) if (entity.kind === 'person') createPerson(entity as PersonEntity);

      let last = performance.now();
      let uiLast = 0;
      let lastRouteKey = '';
      scene.onBeforeRenderObservable.add(() => {
        const now = performance.now();
        const elapsed = Math.max(0, (now - last) / 1000);
        last = now;
        const frame = runtime.step(elapsed);
        const snapshot = store.snapshot();
        cityVisuals.update(frame);

        for (const entity of snapshot.entities) {
          if (entity.kind !== 'person') continue;
          const person = entity as PersonEntity;
          createPerson(person);
          const body = personMeshes.get(person.id);
          const mobility = personMeshes.get(`${person.id}-mobility`);
          if (body) { body.position.x = person.position[0]; body.position.z = person.position[2]; }
          if (mobility) { mobility.position.x = person.position[0]; mobility.position.z = person.position[2]; }
        }

        const mayaRoute = frame.navMeshRoutes.maya;
        const routeKey = mayaRoute?.triangleIds.join('>') ?? '';
        if (routeKey !== lastRouteKey) {
          lastRouteKey = routeKey;
          routeMesh?.dispose?.();
          routeMesh = undefined;
          if (mayaRoute && mayaRoute.points.length > 1) {
            routeMesh = B.MeshBuilder.CreateLines('maya-city-route', { points: mayaRoute.points.map(point => new B.Vector3(point[0], .12, point[2])) }, scene);
          }
        }

        if (now - uiLast <= 1000) return;
        uiLast = now;
        const maya = store.entity('maya') as PersonEntity | undefined;
        const lift = store.entity('station-lift') as InfrastructureEntity | undefined;
        if (maya && lift) {
          const assessment = accessAssessment(maya, lift);
          setAccess(`TRANSIT ACCESS: ${assessment.pass ? 'AVAILABLE' : 'BARRIER'} · ${assessment.cause}`);
          const close = nearbyEntities(snapshot, 'maya', 8);
          setNearby(`NEARBY MAYA · ${close.length ? close.map(item => item.entity.label).join(' · ') : 'none within 8m'}`);
        }
        const activity = frame.activities.find(item => item.personId === 'maya');
        setLife(activity ? `MAYA · ${activity.kind.toUpperCase()} · ${activity.rationale}` : 'MAYA · NO ACTIVE PLAN');
        const bridge = frame.clinical.find(item => item.personId === 'maya');
        setClinical(`CLINICAL BRIDGE · ${(bridge?.status ?? 'continue-world').toUpperCase().replace(/-/g, ' ')}`);
        setRoute(mayaRoute ? `CITY NAVMESH · ${mayaRoute.triangleIds.length} triangles · cost ${mayaRoute.cost.toFixed(1)} · ${mayaRoute.points.length} waypoints` : 'CITY NAVMESH · no viable route represented');
        setEncounters(frame.encounters.length ? `ENCOUNTERS · ${frame.encounters.map(item => `${item.a}↔${item.b} ${item.status} ${item.score.toFixed(2)}${item.supportRequested ? ' support-requested' : ''}`).join(' · ')}` : 'ENCOUNTERS · none above threshold');
        setContinuity(`CONTINUITY · ${frame.continuity.maya ?? 'community'}`);
        setCity(`CITY · seed ${runtime.cityPlan().seed} · ${runtime.cityPlan().districts.length} districts · ${runtime.cityPlan().buildings.length} buildings · navmesh ${runtime.navMesh().triangles.length} triangles`);
        const vehicle = frame.services.vehicles[0];
        const home = frame.services.homes.find(item => item.residentIds.includes('maya'));
        const trip = frame.services.trips.find(item => item.id === tripRef.current);
        setServices(`HOME + TRANSPORT · Maya home power ${home?.mainsPower ? 'ON' : 'OFF'} · shuttle ${vehicle?.status ?? 'unknown'} · trip ${trip?.status ?? 'none'}`);
        const response = frame.emergency.activeResponses.find(item => item.personId === 'maya');
        const unit = response ? frame.emergency.units.find(item => item.id === response.unitId) : undefined;
        setEms(response ? `EMS · ${response.unitId} ${response.status} · position ${unit?.position[0].toFixed(0)},${unit?.position[2].toFixed(0)}` : 'EMS · units available · no active Maya response');
      });

      try {
        const helper = await scene.createDefaultXRExperienceAsync({ floorMeshes: [ground, centralPath], disableTeleportation: false });
        setXr(helper.baseExperience ? 'VR READY · controller, gaze and teleport supported' : 'VR unavailable');
      } catch {
        setXr('WebXR not available on this browser/device');
      }
      setStatus('PROCEDURAL DISABILITY CITY ONLINE');
      engine.runRenderLoop(() => scene.render());
      const resize = () => engine.resize();
      window.addEventListener('resize', resize);
      (scene as any).__cleanup = () => window.removeEventListener('resize', resize);
    };

    void boot();
    return () => {
      disposed = true;
      scene?.__cleanup?.();
      routeMesh?.dispose?.();
      cityVisualRef.current?.dispose();
      cityVisualRef.current = null;
      scene?.dispose?.();
      engine?.dispose?.();
    };
  }, []);

  const runtime = () => runtimeRef.current!;
  const interactNearest = () => {
    const store = storeRef.current!;
    const state = store.snapshot();
    const target = nearbyEntities(state, 'maya', 8)[0];
    if (!target) { setStatus('INTERACTION · no nearby target'); return; }
    const intent = createSpatialIntent('maya', target.entity.id, target.entity.kind === 'person' ? 'communicate' : 'use', 'touch');
    const result = evaluateSpatialIntent(state, intent);
    store.recordEvent('world.intent', 'maya', `${intent.action} ${target.entity.label}: ${result.reason}`);
    setStatus(`INTERACTION · ${target.entity.label} · ${result.allowed ? 'AVAILABLE' : 'BLOCKED'} · ${result.reason}`);
  };
  const requestCityTrip = () => {
    const trip = runtime().requestCityTrip('maya', 'community-hub', 'hospital-main');
    tripRef.current = trip?.id ?? null;
    setStatus(`CITY TRIP · ${trip?.status ?? 'not created'} · ${trip?.reason ?? 'person unavailable'}`);
  };
  const boardCityTrip = () => {
    const id = tripRef.current;
    if (!id) { setStatus('CITY TRIP · request a trip first'); return; }
    setStatus(runtime().boardCityTrip(id) ? 'CITY TRIP · boarded by explicit action' : 'CITY TRIP · boarding unavailable at current stop/location');
  };
  const beginContinuity = () => { runtime().beginContinuity('maya'); setStatus('CONTINUITY + EMS · educational community deterioration episode started'); };
  const advanceContinuity = () => { runtime().advanceContinuity('maya'); setStatus(`CONTINUITY · ${runtime().continuity().summary('maya')}`); };
  const requestSupport = () => { runtime().requestSupport('maya', 'liam'); setStatus('SUPPORT · Maya explicitly requested support from Liam'); };
  const toggleLift = () => { const store = storeRef.current!; const lift = store.entity('station-lift') as InfrastructureEntity; store.setInfrastructure('station-lift', !lift.operational); };
  const toggleAAC = () => { const store = storeRef.current!; const maya = store.entity('maya') as PersonEntity; store.setCommunicationAccess('maya', maya.communication.access === 'available' ? 'degraded' : 'available'); };
  const toggleNavmesh = () => { const visible = cityVisualRef.current?.toggleNavMesh() ?? false; setNavVisible(visible); setStatus(`NAVMESH OVERLAY · ${visible ? 'ON' : 'OFF'}`); };
  const resetWorld = () => { storeRef.current!.reset(); setStatus('WORLD RESET · reload to reseed city and population'); };

  return <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
    <canvas ref={canvasRef} aria-label="Interactive persistent disability-inclusive procedural city. Accessible navmesh routes, homes, transport services, emergency response and world-to-clinical continuity are rendered in Babylon.js and available in WebXR." style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }} />
    <div role="status" aria-live="polite" style={{ position: 'absolute', top: 16, left: 16, maxWidth: 800, maxHeight: '74vh', overflow: 'auto', padding: '12px 14px', borderRadius: 12, background: 'rgba(8,18,28,.93)', color: 'white', fontFamily: 'system-ui' }}>
      <strong>MERT · PROCEDURAL DISABILITY CITY · STEPS 25–28</strong><br />
      <span>{status}</span><br /><span>{xr}</span><br /><span>{city}</span><br /><span>{access}</span><br /><span>{life}</span><br /><span>{route}</span><br /><span>{services}</span><br /><span>{ems}</span><br /><span>{nearby}</span><br /><span>{encounters}</span><br /><span>{clinical}</span><br /><span>{continuity}</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={interactNearest} style={{ padding: 10 }}>Interact with nearest</button>
        <button onClick={requestCityTrip} style={{ padding: 10 }}>Request accessible city trip</button>
        <button onClick={boardCityTrip} style={{ padding: 10 }}>Board allocated city trip</button>
        <button onClick={beginContinuity} style={{ padding: 10 }}>Start continuity + EMS</button>
        <button onClick={advanceContinuity} style={{ padding: 10 }}>Advance care journey</button>
        <button onClick={requestSupport} style={{ padding: 10 }}>Request Liam support</button>
        <button onClick={toggleLift} style={{ padding: 10 }}>Toggle lift availability</button>
        <button onClick={toggleAAC} style={{ padding: 10 }}>Toggle Maya AAC</button>
        <button onClick={toggleNavmesh} style={{ padding: 10 }}>Navmesh overlay: {navVisible ? 'ON' : 'OFF'}</button>
        <button onClick={resetWorld} style={{ padding: 10 }}>Reset world</button>
      </div>
    </div>
    <div style={{ position: 'absolute', right: 16, bottom: 16, maxWidth: 490, padding: 12, borderRadius: 12, background: 'rgba(8,18,28,.88)', color: 'white', fontFamily: 'system-ui', fontSize: 13 }}>
      <strong>Simulation computation layer</strong><br />Route weighting retains {WOLFRAM_ROUTE_MODEL.formula}. Lift: {WOLFRAM_OBJECT_MODELS.liftSmoothstep}. Charger: {WOLFRAM_OBJECT_MODELS.charger}. Social: {WOLFRAM_SOCIAL_MODEL.formula}. Continuity graph remains acyclic with {WOLFRAM_CONTINUITY_MODEL.unexpectedDeadEnds} unexpected dead ends. Procedural-city gradients, speeds and timings are simulation parameters, not statutory accessibility standards or clinical treatment guidance.
    </div>
  </div>;
}
