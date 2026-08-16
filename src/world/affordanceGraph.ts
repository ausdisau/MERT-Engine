import type { InfrastructureEntity, OpenWorldEntity, PersonEntity, PersistentWorldState } from './worldModel';

export type AffordanceAction =
  | 'reach'
  | 'enter'
  | 'use'
  | 'communicate'
  | 'recharge'
  | 'rest';

export interface AffordanceResult {
  action: AffordanceAction;
  entityId: string;
  available: boolean;
  reason: string;
  requiresSupport: boolean;
  cost: number;
}

const supportsMobility = (person: PersonEntity, infrastructure: InfrastructureEntity) =>
  infrastructure.accessibility.includes(person.mobility.mode);

export function evaluateAffordance(
  person: PersonEntity,
  target: OpenWorldEntity,
  action: AffordanceAction,
): AffordanceResult {
  if (target.kind === 'infrastructure') {
    const infra = target as InfrastructureEntity;
    const modalitySupported = supportsMobility(person, infra);
    if (!infra.operational) {
      return { action, entityId: target.id, available: false, reason: 'environmental infrastructure unavailable', requiresSupport: false, cost: 100 };
    }
    if (!modalitySupported && action !== 'communicate') {
      return { action, entityId: target.id, available: false, reason: 'current mobility modality is not supported by this feature', requiresSupport: !person.mobility.independent, cost: 80 };
    }
    if (action === 'recharge' && infra.feature !== 'charging-point') {
      return { action, entityId: target.id, available: false, reason: 'target does not provide charging', requiresSupport: false, cost: 50 };
    }
    if (action === 'rest' && infra.feature !== 'quiet-space') {
      return { action, entityId: target.id, available: false, reason: 'target is not a designated rest space', requiresSupport: false, cost: 40 };
    }
    return { action, entityId: target.id, available: true, reason: 'accessible', requiresSupport: !person.mobility.independent, cost: 5 };
  }

  if (action === 'communicate') {
    const available = person.communication.access !== 'unavailable';
    return {
      action,
      entityId: target.id,
      available,
      reason: available ? 'communication access available' : 'communication access unavailable',
      requiresSupport: false,
      cost: available ? person.communication.responseLatencySeconds : 100,
    };
  }

  return { action, entityId: target.id, available: true, reason: 'no access barrier represented', requiresSupport: false, cost: 10 };
}

export interface RouteOption {
  targetId: string;
  affordances: AffordanceResult[];
  accessible: boolean;
  totalCost: number;
}

export function routeOptions(state: PersistentWorldState, personId: string): RouteOption[] {
  const person = state.entities.find((entity): entity is PersonEntity => entity.id === personId && entity.kind === 'person');
  if (!person) return [];

  return state.entities
    .filter((entity) => entity.id !== personId)
    .map((target) => {
      const reach = evaluateAffordance(person, target, 'reach');
      const use = evaluateAffordance(person, target, 'use');
      return {
        targetId: target.id,
        affordances: [reach, use],
        accessible: reach.available && use.available,
        totalCost: reach.cost + use.cost,
      };
    })
    .sort((a, b) => a.totalCost - b.totalCost);
}
