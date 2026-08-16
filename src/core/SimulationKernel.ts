import type { SimulationEvent, WorldState } from './types';

type EventHandler = (event: SimulationEvent, state: WorldState) => SimulationEvent[] | void;

export class SimulationKernel {
  private state: WorldState;
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly audit: SimulationEvent[] = [];
  private readonly pauseReasons = new Set<string>();

  constructor(initialState: WorldState) {
    this.state = structuredClone(initialState);
  }

  snapshot(): WorldState {
    return structuredClone(this.state);
  }

  auditLog(): SimulationEvent[] {
    return [...this.audit];
  }

  on(eventType: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
    return () => this.handlers.set(eventType, handlers.filter((candidate) => candidate !== handler));
  }

  emit(event: SimulationEvent): void {
    this.enforceProtectedInvariants(event);
    this.applyCoreEvent(event);
    this.audit.push(event);
    for (const handler of this.handlers.get(event.type) ?? []) {
      const followUps = handler(event, this.snapshot()) ?? [];
      for (const followUp of followUps) this.emit(followUp);
    }
  }

  advance(seconds: number): void {
    if (seconds <= 0 || this.pauseReasons.size > 0) return;
    this.state = { ...this.state, simulationSeconds: this.state.simulationSeconds + seconds, revision: this.state.revision + 1 };
  }

  pause(reason: string): void {
    this.pauseReasons.add(reason);
  }

  resume(reason: string): void {
    this.pauseReasons.delete(reason);
  }

  isPaused(): boolean {
    return this.pauseReasons.size > 0;
  }

  private applyCoreEvent(event: SimulationEvent): void {
    if (event.type === 'communication.composition.changed') {
      const active = Boolean((event.payload as { active?: boolean }).active);
      this.state = {
        ...this.state,
        revision: this.state.revision + 1,
        communication: { ...this.state.communication, composing: active },
      };
      if (active) this.pause('communication-composition');
      else this.resume('communication-composition');
    }

    if (event.type === 'world.patch') {
      const patch = event.payload as Partial<WorldState>;
      this.state = this.mergeState(this.state, patch);
    }
  }

  private mergeState(state: WorldState, patch: Partial<WorldState>): WorldState {
    return {
      ...state,
      ...patch,
      revision: state.revision + 1,
      vitals: { ...state.vitals, ...(patch.vitals ?? {}) },
      communication: { ...state.communication, ...(patch.communication ?? {}) },
      authority: { ...state.authority, ...(patch.authority ?? {}) },
      access: { ...state.access, ...(patch.access ?? {}) },
      systems: { ...state.systems, ...(patch.systems ?? {}) },
      uncertainty: { ...state.uncertainty, ...(patch.uncertainty ?? {}) },
      evidence: { ...state.evidence, ...(patch.evidence ?? {}) },
    };
  }

  private enforceProtectedInvariants(event: SimulationEvent): void {
    if (event.type !== 'world.patch') return;
    const patch = event.payload as Partial<WorldState>;

    if (patch.communication?.available === false && patch.authority?.selfAuthority === false) {
      throw new Error('Invariant violation: communication failure must not remove self-authority.');
    }

    if (patch.authority?.proxyActive === true && this.state.authority.selfAuthority) {
      throw new Error('Invariant violation: proxy authority cannot be inferred while self-authority is active.');
    }

    if (patch.systems?.diagnosticOvershadowingRisk !== undefined) {
      const value = patch.systems.diagnosticOvershadowingRisk;
      if (value < 0 || value > 100) throw new Error('Invariant violation: diagnostic overshadowing risk must be 0..100.');
    }
  }
}
