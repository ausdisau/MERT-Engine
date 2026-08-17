import type { PersonEntity, PersistentWorldState, WorldEvent } from './worldModel';
import type { PlannedActivity } from './autonomy';

export type DynamicsNode = 'mobility' | 'communication' | 'fatigue' | 'environment' | 'social' | 'health' | 'institutional';

export interface DynamicsSignal {
  node: DynamicsNode;
  personId: string;
  metric: string;
  delta: number;
  confidence: number;
  cause: string;
  provenance: 'deterministic-vnn';
}

export interface DynamicsProposal {
  personId: string;
  activity: PlannedActivity;
  signals: DynamicsSignal[];
  invariantChecks: string[];
}

export function proposeDynamics(state: PersistentWorldState, activity: PlannedActivity): DynamicsProposal {
  const person = state.entities.find((entity): entity is PersonEntity => entity.id === activity.personId && entity.kind === 'person');
  if (!person) return { personId: activity.personId, activity, signals: [], invariantChecks: ['person exists: FAIL'] };

  const signals: DynamicsSignal[] = [];
  if (activity.kind === 'travel') {
    signals.push({ node: 'mobility', personId: person.id, metric: 'participation', delta: 1, confidence: 0.9, cause: 'goal-aligned accessible travel', provenance: 'deterministic-vnn' });
    signals.push({ node: 'fatigue', personId: person.id, metric: 'energy-demand', delta: 0.1, confidence: 0.65, cause: 'travel activity', provenance: 'deterministic-vnn' });
  }
  if (activity.kind === 'seek-alternative') {
    signals.push({ node: 'environment', personId: person.id, metric: 'access-barrier', delta: 1, confidence: 0.95, cause: 'preferred route unavailable', provenance: 'deterministic-vnn' });
    signals.push({ node: 'fatigue', personId: person.id, metric: 'energy-demand', delta: 0.2, confidence: 0.7, cause: 'rerouting burden', provenance: 'deterministic-vnn' });
  }
  if (person.communication.access === 'degraded') {
    signals.push({ node: 'communication', personId: person.id, metric: 'observability', delta: -0.35, confidence: 1, cause: 'AAC access degraded', provenance: 'deterministic-vnn' });
  }
  if (person.communication.access === 'unavailable') {
    signals.push({ node: 'communication', personId: person.id, metric: 'observability', delta: -1, confidence: 1, cause: 'communication access unavailable', provenance: 'deterministic-vnn' });
  }

  return {
    personId: person.id,
    activity,
    signals,
    invariantChecks: [
      'person authority remains self',
      'communication access does not infer incapacity',
      'environmental barrier is not attributed to impairment',
      'VNN signals are proposals, not clinical facts',
    ],
  };
}

export function dynamicsEvents(state: PersistentWorldState, proposal: DynamicsProposal): WorldEvent[] {
  return proposal.signals.map((signal, index) => ({
    id: `${state.simulationSeconds}-vnn-${proposal.personId}-${index}`,
    at: state.simulationSeconds,
    type: `vnn.${signal.node}.${signal.metric}`,
    entityId: proposal.personId,
    detail: `${signal.cause}; delta=${signal.delta}; confidence=${signal.confidence}`,
  }));
}
