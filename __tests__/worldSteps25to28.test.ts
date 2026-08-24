import { initialOpenWorldState, PersistentWorldStore, type PersonEntity } from '../src/world/worldModel';
import { applyProceduralCity, generateProceduralCity } from '../src/world/proceduralCity';
import { buildCityNavMesh, findNavMeshPath } from '../src/world/navmeshGeometry';
import { HomeTransportEngine } from '../src/world/homeTransport';
import { ContinuityEngine } from '../src/world/continuity';
import { EmergencyResponseEngine } from '../src/world/emergencyServices';

describe('Steps 25-28 procedural disability city', () => {
  test('procedural city is deterministic and preserves person authority', () => {
    const first = generateProceduralCity(42);
    const second = generateProceduralCity(42);
    expect(first.buildings.map(item => item.id)).toEqual(second.buildings.map(item => item.id));
    const store = new PersistentWorldStore(initialOpenWorldState);
    applyProceduralCity(store, first);
    const maya = store.entity('maya') as PersonEntity;
    expect(maya.authority).toBe('self');
    expect(store.entity('home-maya')?.kind).toBe('place');
    expect(store.entity('hospital-main')?.kind).toBe('place');
  });

  test('generates a triangulated navmesh and an accessible path', () => {
    const plan = generateProceduralCity(42);
    const store = new PersistentWorldStore(initialOpenWorldState);
    applyProceduralCity(store, plan);
    const mesh = buildCityNavMesh(plan, 10);
    const maya = store.entity('maya') as PersonEntity;
    const path = findNavMeshPath(mesh, store.snapshot(), maya, maya.position, [0,0,90]);
    expect(mesh.triangles.length).toBeGreaterThan(100);
    expect(path?.triangleIds.length).toBeGreaterThan(1);
    expect(path?.cost).toBeGreaterThan(0);
  });

  test('homes and transport allocate accessible capacity without assuming support', () => {
    const plan = generateProceduralCity(42);
    const store = new PersistentWorldStore(initialOpenWorldState);
    applyProceduralCity(store, plan);
    const services = new HomeTransportEngine(store, plan);
    expect(services.homeForPerson('maya')?.id).toBe('home-maya');
    const trip = services.requestTrip('maya', 'community-hub', 'hospital-main');
    expect(trip?.status).toBe('allocated');
    expect(trip?.supportRequested).toBe(false);
    expect(store.entity('maya')?.kind === 'person' && (store.entity('maya') as PersonEntity).authority).toBe('self');
  });

  test('autonomous emergency response starts only from an active ambulance continuity stage', () => {
    const plan = generateProceduralCity(42);
    const store = new PersistentWorldStore(initialOpenWorldState);
    applyProceduralCity(store, plan);
    const continuity = new ContinuityEngine(store);
    const ems = new EmergencyResponseEngine(store, plan, continuity);
    expect(ems.dispatchFromContinuity('maya', 'no episode')).toBe(false);
    const maya = store.entity('maya') as PersonEntity;
    continuity.start(maya, 'educational deterioration');
    expect(ems.dispatchFromContinuity('maya', 'evidence-gated educational deterioration')).toBe(true);
    ems.step(1);
    expect(ems.snapshot().activeResponses[0]?.status).toMatch(/en-route|on-scene/);
    expect((store.entity('maya') as PersonEntity).authority).toBe('self');
  });
});
