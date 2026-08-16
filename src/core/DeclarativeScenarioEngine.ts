import type { ConditionExpression, DeclarativeScenario, JsonValue, ScenarioEffect, ScenarioRule, SimulationEvent, WorldState } from './types';
import { SimulationKernel } from './SimulationKernel';

interface ScheduledRule {
  rule: ScenarioRule;
  dueAt: number;
  sourceEvent: SimulationEvent;
}

export class DeclarativeScenarioEngine {
  private currentNodeId: string;
  private readonly completedRules = new Set<string>();
  private readonly scheduled: ScheduledRule[] = [];
  private readonly ruleIndex = new Map<string, ScenarioRule[]>();

  constructor(private readonly scenario: DeclarativeScenario, private readonly kernel: SimulationKernel) {
    this.currentNodeId = scenario.initialNodeId;
    for (const rule of scenario.rules) {
      const bucket = this.ruleIndex.get(rule.trigger.eventType) ?? [];
      bucket.push(rule);
      this.ruleIndex.set(rule.trigger.eventType, bucket);
    }
  }

  getCurrentNodeId(): string {
    return this.currentNodeId;
  }

  handle(event: SimulationEvent): void {
    for (const rule of this.ruleIndex.get(event.type) ?? []) {
      if (rule.repeat !== 'always' && this.completedRules.has(rule.id)) continue;
      if (!this.matchesPayload(rule, event)) continue;
      if (rule.conditions && !this.evaluate(rule.conditions, this.kernel.snapshot())) continue;

      if ((rule.delaySeconds ?? 0) > 0) {
        this.scheduled.push({ rule, dueAt: this.kernel.snapshot().simulationSeconds + (rule.delaySeconds ?? 0), sourceEvent: event });
      } else {
        this.execute(rule, event);
      }
    }
  }

  tick(seconds: number): void {
    this.kernel.advance(seconds);
    const now = this.kernel.snapshot().simulationSeconds;
    const due = this.scheduled.filter((item) => item.dueAt <= now);
    for (const item of due) {
      if (!item.rule.conditions || this.evaluate(item.rule.conditions, this.kernel.snapshot())) {
        this.execute(item.rule, item.sourceEvent);
      }
      const index = this.scheduled.indexOf(item);
      if (index >= 0) this.scheduled.splice(index, 1);
    }
  }

  private execute(rule: ScenarioRule, sourceEvent: SimulationEvent): void {
    for (const effect of rule.effects) this.applyEffect(effect, sourceEvent, rule.id);
    if (rule.transitionTo) this.currentNodeId = rule.transitionTo;
    if (rule.repeat !== 'always') this.completedRules.add(rule.id);
  }

  private applyEffect(effect: ScenarioEffect, sourceEvent: SimulationEvent, ruleId: string): void {
    if (effect.type === 'set' || effect.type === 'increment') {
      const snapshot = this.kernel.snapshot();
      const next = structuredClone(snapshot) as unknown as Record<string, unknown>;
      const current = this.readPath(snapshot, effect.path);
      const value = effect.type === 'set'
        ? effect.value
        : Math.min(effect.max ?? Number.POSITIVE_INFINITY, Math.max(effect.min ?? Number.NEGATIVE_INFINITY, Number(current ?? 0) + effect.amount));
      this.writePath(next, effect.path, value);
      this.kernel.emit(this.event('world.patch', { ...next, revision: snapshot.revision } as unknown as JsonValue, ruleId));
      return;
    }

    if (effect.type === 'emit') {
      this.kernel.emit(this.event(effect.eventType, effect.payload, ruleId));
      return;
    }

    if (effect.type === 'model-request') {
      this.kernel.emit(this.event('dynamics.requested', {
        module: effect.module,
        action: effect.action,
        parameters: effect.parameters ?? {},
        sourceRuleId: ruleId,
      }, ruleId));
      return;
    }

    if (effect.type === 'marker') {
      this.kernel.emit(this.event('debrief.marker.recorded', { marker: effect.marker, sourceRuleId: ruleId }, ruleId));
    }
  }

  private matchesPayload(rule: ScenarioRule, event: SimulationEvent): boolean {
    const match = rule.trigger.match;
    if (!match) return true;
    const payload = event.payload as Record<string, unknown>;
    return Object.entries(match).every(([key, value]) => payload[key] === value);
  }

  private evaluate(expression: ConditionExpression, state: WorldState): boolean {
    if (expression.op === 'all') return expression.conditions.every((condition) => this.evaluate(condition, state));
    if (expression.op === 'any') return expression.conditions.some((condition) => this.evaluate(condition, state));
    if (expression.op === 'not') return !this.evaluate(expression.condition, state);

    const actual = this.readPath(state, expression.path);
    if (expression.op === 'exists') return actual !== undefined && actual !== null;
    if (expression.op === 'eq') return actual === expression.value;
    if (expression.op === 'neq') return actual !== expression.value;
    if (expression.op === 'gt') return Number(actual) > Number(expression.value);
    if (expression.op === 'gte') return Number(actual) >= Number(expression.value);
    if (expression.op === 'lt') return Number(actual) < Number(expression.value);
    return Number(actual) <= Number(expression.value);
  }

  private readPath(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, root);
  }

  private writePath(root: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cursor: Record<string, unknown> = root;
    for (const part of parts.slice(0, -1)) {
      const next = cursor[part];
      if (!next || typeof next !== 'object') cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }

  private event(type: string, payload: JsonValue, source: string): SimulationEvent {
    return {
      id: `${source}-${type}-${this.kernel.auditLog().length + 1}`,
      type,
      source,
      atSimulationSeconds: this.kernel.snapshot().simulationSeconds,
      payload,
    };
  }
}
