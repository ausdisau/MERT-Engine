import { defaultNavigationNetwork, findAccessibleRoutes, navigationProfile } from '../src/world/accessibleNavigation';
import { chargerPercent, ObjectInteractionEngine, smoothstep } from '../src/world/objectInteractions';
import { encounterScore, SocialEncounterEngine } from '../src/world/socialEncounters';
import { ContinuityEngine } from '../src/world/continuity';
import { initialOpenWorldState, PersistentWorldStore, type InfrastructureEntity, type PersonEntity } from '../src/world/worldModel';

describe('Steps 21-24 Wolfram-grounded world algorithms', () => {
  test('accessible routes are ordered by cost and failed infrastructure is environmental', () => {
    const store = new PersistentWorldStore(initialOpenWorldState);
    const maya = store.entity('maya') as PersonEntity;
    expect(navigationProfile(maya).mobility).toBe('powered-wheelchair');
    const routes = findAccessibleRoutes(defaultNavigationNetwork, store.snapshot(), maya, 'plaza', 'transit', 3);
    expect(routes.length).toBeGreaterThan(0);
    for (let i = 1; i < routes.length; i++) expect(routes[i]!.cost).toBeGreaterThanOrEqual(routes[i-1]!.cost);
    const lift = store.entity('station-lift') as InfrastructureEntity;
    store.setInfrastructure(lift.id, false);
    const blocked = findAccessibleRoutes(defaultNavigationNetwork, store.snapshot(), maya, 'plaza', 'transit', 3);
    expect(blocked.every(route => !route.nodeIds.includes('station-lift'))).toBe(true);
    expect((store.entity('maya') as PersonEntity).authority).toBe('self');
  });

  test('smoothstep lift model has stationary endpoints', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    const engine = new ObjectInteractionEngine();
    expect(engine.requestLift(1, 'maya')).toBe(true);
    engine.step(4);
    expect(engine.snapshot().lift.positionMetres).toBeCloseTo(2.1, 5);
    engine.step(4);
    expect(engine.snapshot().lift.positionMetres).toBeCloseTo(4.2, 5);
  });

  test('Wolfram-derived charger curve reaches approximately 80 percent at computed time', () => {
    expect(chargerPercent(30, 100, .0015, 835.1753123302453)).toBeCloseTo(80, 5);
  });

  test('relationship and proximity affect encounters while support remains explicit', () => {
    expect(encounterScore(1.5, 1, 1, .2)).toBeGreaterThan(encounterScore(1.5, 0, 0, .2));
    const store = new PersistentWorldStore(initialOpenWorldState);
    const engine = new SocialEncounterEngine();
    const before = engine.detect(store.snapshot()).encounters;
    expect(before.every(encounter => encounter.supportRequested === false)).toBe(true);
    engine.requestSupport('maya', 'liam');
  });

  test('continuity preserves authority and rejects non-adjacent jumps', () => {
    const store = new PersistentWorldStore(initialOpenWorldState);
    const maya = store.entity('maya') as PersonEntity;
    const engine = new ContinuityEngine(store);
    engine.start(maya, 'educational test');
    expect(engine.episode('maya')?.preserved.authority).toBe('self');
    expect(engine.advance('maya', 'icu')).toBe(false);
    expect(engine.advance('maya', 'ed')).toBe(true);
    expect(engine.advance('maya', 'icu')).toBe(true);
    expect(engine.advance('maya', 'mert-scenario')).toBe(true);
    expect(engine.advance('maya', 'discharge')).toBe(true);
    expect(engine.advance('maya', 'community-return')).toBe(true);
    expect(engine.advance('maya', 'community-with-consequences')).toBe(true);
    expect((store.entity('maya') as PersonEntity).authority).toBe('self');
  });
});
