export type InteractionModality = 'xr-controller' | 'gaze' | 'switch' | 'keyboard' | 'touch' | 'voice' | 'companion';
export type LocomotionMode = 'teleport' | 'smooth' | 'seated-snap-turn' | 'non-spatial';

export interface InteractionProfile {
  modalities: InteractionModality[];
  locomotion: LocomotionMode;
  reducedMotion: boolean;
  dwellMilliseconds: number;
  responseTimeMultiplier: number;
  dominantHand?: 'left' | 'right' | 'none';
}

export interface WorldIntent {
  actorId: string;
  action: 'select' | 'move' | 'communicate' | 'inspect' | 'use' | 'pause';
  targetId?: string;
  modality: InteractionModality;
  payload?: unknown;
}

export const defaultInteractionProfile: InteractionProfile = {
  modalities: ['keyboard', 'touch', 'xr-controller'],
  locomotion: 'teleport',
  reducedMotion: false,
  dwellMilliseconds: 1000,
  responseTimeMultiplier: 1,
};

export function normalizeIntent(intent: WorldIntent): WorldIntent {
  return { ...intent };
}

export function validateInteractionProfile(profile: InteractionProfile): string[] {
  const issues: string[] = [];
  if (profile.modalities.length === 0) issues.push('at least one interaction modality is required');
  if (profile.dwellMilliseconds < 0) issues.push('dwell time cannot be negative');
  if (profile.responseTimeMultiplier < 1) issues.push('response time multiplier must not shorten the user response window');
  if (profile.reducedMotion && profile.locomotion === 'smooth') issues.push('reduced-motion profile should use teleport, seated snap turn, or non-spatial locomotion');
  return issues;
}

export function equivalentAction(a: WorldIntent, b: WorldIntent): boolean {
  return a.actorId === b.actorId && a.action === b.action && a.targetId === b.targetId;
}
