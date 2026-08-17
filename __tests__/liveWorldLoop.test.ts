import { defaultSchedules, runDailyLifeTick } from '../src/world/dailyLife';
import { LiveWorldLoop } from '../src/world/liveWorldLoop';
import { addInfrastructure, exportWorldDraft, validateWorldDraft } from '../src/world/scenarioStudio';
import { initialOpenWorldState, PersistentWorldStore, type PersonEntity } from '../src/world/worldModel';

describe('live disability world integration', () => {
  it('plans daily life without replacing person authority', () => {
    const schedule = defaultSchedules[0];
    expect(schedule).toBeDefined();
    if (!schedule) return;
    const tick = runDailyLifeTick(initialOpenWorldState, schedule);
    expect(tick.activity?.personId).toBe('maya');
    const maya = initialOpenWorldState.entities.find((entity): entity is PersonEntity => entity.id === 'maya' && entity.kind === 'person');
    expect(maya?.authority).toBe('self');
  });

  it('runs the bounded world loop and records dynamics events', () => {
    const store = new PersistentWorldStore(initialOpenWorldState);
    const loop = new LiveWorldLoop(store);
    loop.step(6);
    expect(store.snapshot().events.some((event) => event.type.startsWith('vnn.'))).toBe(true);
  });

  it('scenario studio validates duplicate IDs and authority invariants', () => {
    const draft = { title: 'Test', description: '', seed: initialOpenWorldState };
    const withDuplicate = addInfrastructure(draft, { id: 'station-lift', label: 'Duplicate lift', position: [0,0,0], feature: 'lift', accessibility: ['powered-wheelchair'] });
    expect(validateWorldDraft(withDuplicate).some((issue) => issue.severity === 'error')).toBe(true);
    expect(() => exportWorldDraft(withDuplicate)).toThrow();
  });
});
