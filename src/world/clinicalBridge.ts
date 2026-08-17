import type { PersonEntity, PersistentWorldState, WorldEvent } from './worldModel';
import type { DynamicsProposal } from './vnnDynamics';

export type ClinicalBridgeStatus = 'continue-world' | 'assessment-suggested' | 'scenario-eligible';

export interface ClinicalTriggerAssessment {
  personId: string;
  status: ClinicalBridgeStatus;
  reasons: string[];
  scenarioId?: string;
  preserve: {
    authority: true;
    baseline: true;
    communicationState: true;
    worldHistory: true;
  };
}

export interface ClinicalRuntimePort {
  emit(type: string, payload: unknown, source?: string): void;
}

export function assessClinicalTrigger(
  state: PersistentWorldState,
  personId: string,
  proposals: DynamicsProposal[] = [],
): ClinicalTriggerAssessment {
  const person = state.entities.find((entity): entity is PersonEntity => entity.id === personId && entity.kind === 'person');
  if (!person) {
    return { personId, status: 'continue-world', reasons: ['person not found'], preserve: { authority: true, baseline: true, communicationState: true, worldHistory: true } };
  }

  const personSignals = proposals.flatMap((proposal) => proposal.personId === personId ? proposal.signals : []);
  const healthSignals = personSignals.filter((signal) => signal.node === 'health');
  const severeAccessCascade = personSignals.filter((signal) => signal.node === 'environment' && signal.metric === 'access-barrier').length >= 2;

  if (healthSignals.some((signal) => Math.abs(signal.delta) >= 1 && signal.confidence >= 0.8)) {
    return {
      personId,
      status: 'scenario-eligible',
      reasons: ['high-confidence health-state change proposed by bounded dynamics; requires scenario evidence gate'],
      scenarioId: 'not-my-baseline',
      preserve: { authority: true, baseline: true, communicationState: true, worldHistory: true },
    };
  }

  if (healthSignals.length > 0 || severeAccessCascade) {
    return {
      personId,
      status: 'assessment-suggested',
      reasons: severeAccessCascade ? ['repeated environmental barriers may increase burden; assess without pathologising disability'] : ['health signal present but threshold for scenario transition not met'],
      preserve: { authority: true, baseline: true, communicationState: true, worldHistory: true },
    };
  }

  return {
    personId,
    status: 'continue-world',
    reasons: ['no evidence-gated clinical transition'],
    preserve: { authority: true, baseline: true, communicationState: true, worldHistory: true },
  };
}

export function bridgeToClinicalRuntime(
  state: PersistentWorldState,
  assessment: ClinicalTriggerAssessment,
  runtime: ClinicalRuntimePort,
): WorldEvent | undefined {
  if (assessment.status !== 'scenario-eligible' || !assessment.scenarioId) return undefined;
  const person = state.entities.find((entity): entity is PersonEntity => entity.id === assessment.personId && entity.kind === 'person');
  if (!person) return undefined;

  runtime.emit('world.clinical-bridge.requested', {
    scenarioId: assessment.scenarioId,
    personId: person.id,
    baselineAuthority: person.authority,
    communication: person.communication,
    worldSimulationSeconds: state.simulationSeconds,
    reasons: assessment.reasons,
  }, 'open-world');

  return {
    id: `${state.simulationSeconds}-clinical-bridge-${person.id}`,
    at: state.simulationSeconds,
    type: 'clinical.bridge.requested',
    entityId: person.id,
    detail: `scenario=${assessment.scenarioId}; world remains authoritative for identity, baseline, communication access and history`,
  };
}
