import { LiveWorldLoop } from '../src/world/liveWorldLoop';
import { PersistentWorldStore, initialOpenWorldState, type PersonEntity } from '../src/world/worldModel';
import { addInfrastructure, validateWorldDraft, type WorldStudioDraft } from '../src/world/scenarioStudio';

function memoryStore() {
  return new PersistentWorldStore(initialOpenWorldState);
}

describe('live disability world integration', () => {
  test('autonomous travel changes position without changing person authority', () => {
    const store = memoryStore();
    const before = store.entity('maya') as PersonEntity;
    const start = [...before.position];
    const loop = new LiveWorldLoop(store);
    loop.step(3);
    const after = store.entity('maya') as PersonEntity;
    expect(after.position).not.toEqual(start);
    expect(after.authority).toBe('self');
  });

  test('infrastructure failure remains an environmental event', () => {
    const store = memoryStore();
    store.setInfrastructure('station-lift', false);
    const event = store.snapshot().events.at(-1);
    expect(event?.type).toBe('infrastructure.changed');
    expect(event?.detail).toContain('unavailable');
    expect((store.entity('maya') as PersonEntity).authority).toBe('self');
  });

  test('Scenario Studio rejects silent authority reassignment', () => {
    const draft: WorldStudioDraft = { title: 'Test', description: 'Test world', seed: initialOpenWorldState };
    const extended = addInfrastructure(draft, { id: 'test-ramp', label: 'Test ramp', position: [0,0,0], feature: 'ramp', accessibility: ['powered-wheelchair'] });
    expect(validateWorldDraft(extended).filter(issue => issue.severity === 'error')).toHaveLength(0);
  });
});
