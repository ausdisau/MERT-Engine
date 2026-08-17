import { initialOpenWorldState } from '../src/world/worldModel';
import { evaluateAffordance } from '../src/world/affordanceGraph';
import { planNextActivity } from '../src/world/autonomy';
import { proposeDynamics } from '../src/world/vnnDynamics';

describe('open world autonomy', () => {
  test('AAC loss changes observability without changing authority', () => {
    const state = structuredClone(initialOpenWorldState);
    const maya = state.entities.find((entity) => entity.id === 'maya') as any;
    maya.communication.access = 'unavailable';
    const activity = planNextActivity(state, 'maya')!;
    const proposal = proposeDynamics(state, activity);

    expect(maya.authority).toBe('self');
    expect(proposal.signals.some((signal) => signal.node === 'communication' && signal.metric === 'observability')).toBe(true);
    expect(proposal.invariantChecks).toContain('communication access does not infer incapacity');
  });

  test('failed lift is represented as an environmental barrier', () => {
    const state = structuredClone(initialOpenWorldState);
    const maya = state.entities.find((entity) => entity.id === 'maya') as any;
    const lift = state.entities.find((entity) => entity.id === 'station-lift') as any;
    lift.operational = false;

    const result = evaluateAffordance(maya, lift, 'use');
    expect(result.available).toBe(false);
    expect(result.reason).toBe('environmental infrastructure unavailable');
    expect(maya.mobility.independent).toBe(true);
  });

  test('planner preserves the goal by searching for alternatives', () => {
    const state = structuredClone(initialOpenWorldState);
    const activity = planNextActivity(state, 'maya');
    expect(activity).toBeDefined();
    expect(['travel', 'seek-alternative', 'rest']).toContain(activity!.kind);
    expect(activity!.goal).toBe('move through the community');
  });
});
