export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface VitalsState {
  heartRate: number;
  respiratoryRate: number;
  spo2: number;
  systolicBp: number;
  temperatureC: number;
}

export interface CommunicationState {
  primaryMethod: string;
  available: boolean;
  calibrated: boolean;
  reliable: boolean;
  composing: boolean;
  responseTimeSeconds: number;
}

export interface AuthorityState {
  decisionMaker: string;
  selfAuthority: boolean;
  supportPersonIsCommunicationPartner: boolean;
  proxyActive: boolean;
}

export interface AccessState {
  positionQuality: number;
  motorDemand: number;
  sensoryLoad: number;
  communicationAccess: number;
}

export interface SystemState {
  seniorEscalation: boolean;
  diagnosticOvershadowingRisk: number;
  systemRepair: number;
}

export interface WorldState {
  revision: number;
  simulationSeconds: number;
  patientId: string;
  vitals: VitalsState;
  communication: CommunicationState;
  authority: AuthorityState;
  access: AccessState;
  systems: SystemState;
  uncertainty: Record<string, 'unknown' | 'possible' | 'supported' | 'excluded'>;
  evidence: Record<string, boolean>;
  tags: string[];
}

export interface SimulationEvent<T = JsonValue> {
  id: string;
  type: string;
  source: string;
  atSimulationSeconds: number;
  payload: T;
}

export type ConditionExpression =
  | { op: 'all'; conditions: ConditionExpression[] }
  | { op: 'any'; conditions: ConditionExpression[] }
  | { op: 'not'; condition: ConditionExpression }
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists'; path: string; value?: JsonValue };

export type ScenarioEffect =
  | { type: 'set'; path: string; value: JsonValue }
  | { type: 'increment'; path: string; amount: number; min?: number; max?: number }
  | { type: 'emit'; eventType: string; payload: JsonValue }
  | { type: 'model-request'; module: string; action: string; parameters?: Record<string, JsonValue> }
  | { type: 'marker'; marker: string };

export interface ScenarioRule {
  id: string;
  label: string;
  trigger: { eventType: string; match?: Record<string, JsonValue> };
  conditions?: ConditionExpression;
  delaySeconds?: number;
  effects: ScenarioEffect[];
  transitionTo?: string;
  repeat?: 'once' | 'always';
  provenance?: {
    source: 'scenario-author' | 'clinical-review' | 'lived-experience-review' | 'policy' | 'research' | 'model';
    refs?: string[];
  };
}

export interface DeclarativeScenario {
  id: string;
  version: string;
  title: string;
  initialNodeId: string;
  rules: ScenarioRule[];
}

export interface DynamicsProposal {
  module: string;
  action: string;
  confidence: number;
  proposedEvents: SimulationEvent[];
  rationale: string[];
  provenance: string[];
}
