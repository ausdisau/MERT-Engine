import { initialOpenWorldState } from '../src/world/worldModel';
import { defaultSocialAgents, interact } from '../src/world/socialAgents';
import { assessClinicalTrigger } from '../src/world/clinicalBridge';
import { WorldTimeline } from '../src/world/timeline';
import { equivalentAction, validateInteractionProfile } from '../src/world/vrInteraction';

describe('advanced disability world invariants', () => {
  it('keeps an unavailable AAC answer unknown rather than transferring authority', () => {
    const state = JSON.parse(JSON.stringify(initialOpenWorldState));
    const maya = state.entities.find((entity: any) => entity.id === 'maya');
    maya.communication.access = 'unavailable';
    const agent = defaultSocialAgents[0];
    expect(agent).toBeDefined();
    if (!agent) return;
    const interaction = interact(state, agent, 'maya', 'ask');
    expect(interaction?.outcome).toBe('unknown');
    expect(maya.authority).toBe('self');
  });

  it('does not launch a clinical scenario without an evidence-gated health transition', () => {
    const assessment = assessClinicalTrigger(initialOpenWorldState, 'maya', []);
    expect(assessment.status).toBe('continue-world');
    expect(assessment.preserve.authority).toBe(true);
  });

  it('creates counterfactual branches without mutating the captured original', () => {
    const timeline = new WorldTimeline();
    const original = timeline.capture(initialOpenWorldState, 'original');
    const branch = timeline.branch(original.id, 'lift failure', (state) => {
      const lift = state.entities.find((entity) => entity.id === 'station-lift') as any;
      lift.operational = false;
    }, 'station lift unavailable');
    expect((timeline.get(original.id)?.state.entities.find((entity) => entity.id === 'station-lift') as any).operational).toBe(true);
    expect((branch?.state.entities.find((entity) => entity.id === 'station-lift') as any).operational).toBe(false);
  });

  it('treats VR and switch selection as equivalent semantic actions', () => {
    expect(equivalentAction(
      { actorId: 'maya', action: 'select', targetId: 'community-hub', modality: 'xr-controller' },
      { actorId: 'maya', action: 'select', targetId: 'community-hub', modality: 'switch' },
    )).toBe(true);
  });

  it('rejects reduced-motion smooth locomotion configuration', () => {
    expect(validateInteractionProfile({ modalities: ['gaze'], locomotion: 'smooth', reducedMotion: true, dwellMilliseconds: 1200, responseTimeMultiplier: 2 })).toContain('reduced-motion profile should use teleport, seated snap turn, or non-spatial locomotion');
  });
});
