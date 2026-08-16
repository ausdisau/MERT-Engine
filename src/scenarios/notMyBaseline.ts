import type { DeclarativeScenario, WorldState } from '../core/types';

export const initialWorldState: WorldState = {
  revision: 0,
  simulationSeconds: 0,
  patientId: 'maya-chen-demo',
  vitals: {
    heartRate: 118,
    respiratoryRate: 28,
    spo2: 89,
    systolicBp: 102,
    temperatureC: 38.6,
  },
  communication: {
    primaryMethod: 'eye-gaze AAC',
    available: true,
    calibrated: false,
    reliable: false,
    composing: false,
    responseTimeSeconds: 20,
  },
  authority: {
    decisionMaker: 'Maya Chen',
    selfAuthority: true,
    supportPersonIsCommunicationPartner: true,
    proxyActive: false,
  },
  access: {
    positionQuality: 0,
    motorDemand: 30,
    sensoryLoad: 40,
    communicationAccess: 35,
  },
  systems: {
    seniorEscalation: false,
    diagnosticOvershadowingRisk: 25,
    systemRepair: 70,
  },
  uncertainty: {
    aspiration: 'possible',
    pneumonia: 'possible',
    secretionBurden: 'unknown',
  },
  evidence: {
    baselineKnown: true,
    directHistoryObtained: false,
    currentAirwayPlanReviewed: false,
  },
  tags: ['fictional', 'education-only', 'disability-inclusive'],
};

export const notMyBaselineScenario: DeclarativeScenario = {
  id: 'adl-ed-cp-aac-respiratory-001',
  version: '0.6.0',
  title: 'Not My Baseline',
  initialNodeId: 'ed-arrival',
  rules: [
    {
      id: 'restore-access',
      label: 'Restore positioning and AAC access',
      trigger: { eventType: 'scenario.choice.committed', match: { choiceId: 'restore-access' } },
      effects: [
        { type: 'model-request', module: 'access-dynamics', action: 'restore-aac-and-position' },
        { type: 'set', path: 'evidence.directHistoryObtained', value: true },
        { type: 'marker', marker: 'communication-access-restored' },
      ],
      transitionTo: 'inclusive-assessment',
      provenance: { source: 'lived-experience-review', refs: ['communication-access-is-clinical-infrastructure'] },
    },
    {
      id: 'anchor-on-disability',
      label: 'Delayed deterioration after diagnostic overshadowing',
      trigger: { eventType: 'scenario.choice.committed', match: { choiceId: 'anchor-on-disability' } },
      conditions: { op: 'eq', path: 'systems.seniorEscalation', value: false },
      delaySeconds: 180,
      effects: [
        { type: 'set', path: 'systems.diagnosticOvershadowingRisk', value: 92 },
        { type: 'set', path: 'systems.systemRepair', value: 15 },
        { type: 'model-request', module: 'respiratory-dynamics', action: 'progress-untreated-hypoxaemia', parameters: { durationSeconds: 180 } },
        { type: 'marker', marker: 'diagnostic-overshadowing-consequence' },
      ],
      transitionTo: 'recognisable-deterioration',
      provenance: { source: 'scenario-author', refs: ['not-my-baseline-v1'] },
    },
    {
      id: 'escalation',
      label: 'Escalate to senior support',
      trigger: { eventType: 'scenario.choice.committed', match: { choiceId: 'escalate' } },
      effects: [
        { type: 'set', path: 'systems.seniorEscalation', value: true },
        { type: 'increment', path: 'systems.systemRepair', amount: 15, max: 100 },
        { type: 'marker', marker: 'senior-escalation' },
      ],
      provenance: { source: 'clinical-review' },
    },
  ],
};
