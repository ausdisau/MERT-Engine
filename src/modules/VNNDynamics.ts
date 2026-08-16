import type { DynamicsProposal, JsonValue, SimulationEvent, WorldState } from '../core/types';
import { SimulationKernel } from '../core/SimulationKernel';

export interface DynamicsModule {
  id: string;
  supports(action: string): boolean;
  propose(action: string, parameters: Record<string, JsonValue>, state: WorldState): DynamicsProposal;
}

export class RespiratoryDynamicsModule implements DynamicsModule {
  readonly id = 'respiratory-dynamics';

  supports(action: string): boolean {
    return action === 'progress-untreated-hypoxaemia' || action === 'respond-to-position-restoration';
  }

  propose(action: string, parameters: Record<string, JsonValue>, state: WorldState): DynamicsProposal {
    const duration = Number(parameters.durationSeconds ?? 60);
    const intensity = Math.max(1, Math.min(3, Math.round(duration / 60)));

    if (action === 'respond-to-position-restoration') {
      return {
        module: this.id,
        action,
        confidence: 0.72,
        proposedEvents: [this.patchEvent(state, {
          vitals: {
            ...state.vitals,
            spo2: Math.min(100, state.vitals.spo2 + 2),
            respiratoryRate: Math.max(10, state.vitals.respiratoryRate - 2),
          },
          access: { ...state.access, positionQuality: 2 },
        })],
        rationale: ['Position restoration may improve mechanics and communication access in this educational model.'],
        provenance: ['scenario-model:v0.6:respiratory-position-response'],
      };
    }

    return {
      module: this.id,
      action,
      confidence: 0.68,
      proposedEvents: [this.patchEvent(state, {
        vitals: {
          ...state.vitals,
          spo2: Math.max(70, state.vitals.spo2 - (2 * intensity)),
          respiratoryRate: Math.min(40, state.vitals.respiratoryRate + (2 * intensity)),
          heartRate: Math.min(160, state.vitals.heartRate + (4 * intensity)),
        },
      })],
      rationale: ['Deterministic educational deterioration request translated into bounded world-state changes.'],
      provenance: ['scenario-model:v0.6:untreated-hypoxaemia'],
    };
  }

  private patchEvent(state: WorldState, patch: Partial<WorldState>): SimulationEvent {
    return {
      id: `respiratory-dynamics-${state.revision + 1}`,
      type: 'world.patch',
      source: this.id,
      atSimulationSeconds: state.simulationSeconds,
      payload: patch as unknown as JsonValue,
    };
  }
}

export class AccessDynamicsModule implements DynamicsModule {
  readonly id = 'access-dynamics';

  supports(action: string): boolean {
    return action === 'restore-aac-and-position' || action === 'degrade-eye-gaze-access';
  }

  propose(action: string, _parameters: Record<string, JsonValue>, state: WorldState): DynamicsProposal {
    const restoring = action === 'restore-aac-and-position';
    return {
      module: this.id,
      action,
      confidence: 0.95,
      proposedEvents: [{
        id: `access-dynamics-${state.revision + 1}`,
        type: 'world.patch',
        source: this.id,
        atSimulationSeconds: state.simulationSeconds,
        payload: {
          communication: {
            ...state.communication,
            calibrated: restoring,
            reliable: restoring,
          },
          access: {
            ...state.access,
            positionQuality: restoring ? 2 : 0,
            communicationAccess: restoring ? 100 : 20,
          },
        } as unknown as JsonValue,
      }],
      rationale: [restoring
        ? 'Restoring physical alignment improves access without changing decision authority.'
        : 'Environmental access degradation reduces observability without implying incapacity.'],
      provenance: ['dwm-invariant:communication-access-separate-from-authority'],
    };
  }
}

export class VNNDynamicsCoordinator {
  private readonly modules = new Map<string, DynamicsModule>();

  constructor(private readonly kernel: SimulationKernel) {
    this.register(new RespiratoryDynamicsModule());
    this.register(new AccessDynamicsModule());
    this.kernel.on('dynamics.requested', (event, state) => this.handleRequest(event, state));
  }

  register(module: DynamicsModule): void {
    this.modules.set(module.id, module);
  }

  private handleRequest(event: SimulationEvent, state: WorldState): SimulationEvent[] {
    const payload = event.payload as unknown as { module: string; action: string; parameters?: Record<string, JsonValue> };
    const module = this.modules.get(payload.module);
    if (!module || !module.supports(payload.action)) {
      return [{
        id: `${event.id}-unsupported`,
        type: 'dynamics.rejected',
        source: 'vnn-dynamics-coordinator',
        atSimulationSeconds: state.simulationSeconds,
        payload: { module: payload.module, action: payload.action, reason: 'unsupported' },
      }];
    }

    const proposal = module.propose(payload.action, payload.parameters ?? {}, state);
    return [
      {
        id: `${event.id}-proposal`,
        type: 'dynamics.proposal.created',
        source: 'vnn-dynamics-coordinator',
        atSimulationSeconds: state.simulationSeconds,
        payload: {
          module: proposal.module,
          action: proposal.action,
          confidence: proposal.confidence,
          rationale: proposal.rationale,
          provenance: proposal.provenance,
        },
      },
      ...proposal.proposedEvents,
    ];
  }
}
