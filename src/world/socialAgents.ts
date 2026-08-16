import type { PersonEntity, PersistentWorldState, WorldEvent } from './worldModel';

export type SocialRole = 'peer' | 'support-worker' | 'clinician' | 'transport-staff' | 'educator' | 'employer' | 'bystander';
export type KnowledgeStatus = 'known' | 'unknown' | 'uncertain';

export interface SocialAgent {
  id: string;
  label: string;
  role: SocialRole;
  knowledge: Record<string, KnowledgeStatus>;
  communicationPractice: 'direct-first' | 'proxy-first' | 'mixed';
  respectsAuthority: boolean;
  escalationThreshold: number;
}

export interface SocialInteraction {
  agentId: string;
  personId: string;
  intent: 'greet' | 'ask' | 'assist' | 'handover' | 'escalate';
  outcome: 'supported' | 'barrier' | 'unknown';
  effects: Array<{
    domain: 'communication' | 'trust' | 'access' | 'institutional';
    delta: number;
    cause: string;
  }>;
  invariantChecks: string[];
}

export const defaultSocialAgents: SocialAgent[] = [
  {
    id: 'community-peer-1',
    label: 'Community peer',
    role: 'peer',
    knowledge: { aac: 'uncertain', baseline: 'unknown' },
    communicationPractice: 'direct-first',
    respectsAuthority: true,
    escalationThreshold: 0.9,
  },
  {
    id: 'support-worker-1',
    label: 'Communication support worker',
    role: 'support-worker',
    knowledge: { aac: 'known', baseline: 'known' },
    communicationPractice: 'direct-first',
    respectsAuthority: true,
    escalationThreshold: 0.65,
  },
  {
    id: 'clinician-1',
    label: 'Clinician',
    role: 'clinician',
    knowledge: { aac: 'uncertain', baseline: 'uncertain' },
    communicationPractice: 'mixed',
    respectsAuthority: true,
    escalationThreshold: 0.55,
  },
  {
    id: 'transit-staff-1',
    label: 'Transit staff member',
    role: 'transport-staff',
    knowledge: { access: 'known', aac: 'uncertain' },
    communicationPractice: 'direct-first',
    respectsAuthority: true,
    escalationThreshold: 0.8,
  },
];

export function interact(
  state: PersistentWorldState,
  agent: SocialAgent,
  personId: string,
  intent: SocialInteraction['intent'],
): SocialInteraction | undefined {
  const person = state.entities.find((entity): entity is PersonEntity => entity.id === personId && entity.kind === 'person');
  if (!person) return undefined;

  const effects: SocialInteraction['effects'] = [];
  let outcome: SocialInteraction['outcome'] = 'supported';

  if (!agent.respectsAuthority || agent.communicationPractice === 'proxy-first') {
    outcome = 'barrier';
    effects.push({ domain: 'trust', delta: -0.4, cause: 'person was not treated as the primary decision-maker' });
    effects.push({ domain: 'communication', delta: -0.3, cause: 'communication was redirected away from the person' });
  } else if (person.communication.access === 'unavailable' && intent === 'ask') {
    outcome = 'unknown';
    effects.push({ domain: 'communication', delta: -0.2, cause: 'communication access unavailable; answer remains unknown rather than inferred' });
  } else {
    effects.push({ domain: 'trust', delta: 0.2, cause: 'direct, authority-preserving interaction' });
  }

  return {
    agentId: agent.id,
    personId,
    intent,
    outcome,
    effects,
    invariantChecks: [
      'support worker does not automatically become substitute decision-maker',
      'no response remains unknown',
      'communication difference does not imply cognitive impairment',
      'social agent knowledge is bounded and explicit',
    ],
  };
}

export function socialEvents(state: PersistentWorldState, interaction: SocialInteraction): WorldEvent[] {
  return interaction.effects.map((effect, index) => ({
    id: `${state.simulationSeconds}-social-${interaction.agentId}-${index}`,
    at: state.simulationSeconds,
    type: `social.${effect.domain}`,
    entityId: interaction.personId,
    detail: `${effect.cause}; delta=${effect.delta}; outcome=${interaction.outcome}`,
  }));
}
