import type { PersistentWorldState } from './worldModel';

export interface DailyScheduleEntry {
  id: string;
  personId: string;
  startMinute: number;
  endMinute: number;
  activity: 'home' | 'travel' | 'community' | 'work' | 'study' | 'appointment' | 'social' | 'rest' | 'charge';
  targetId?: string;
  priority: number;
  flexible: boolean;
}

export const defaultDailySchedules: DailyScheduleEntry[] = [
  { id: 'maya-community', personId: 'maya', startMinute: 9 * 60, endMinute: 11 * 60, activity: 'community', targetId: 'community-hub', priority: 0.8, flexible: true },
  { id: 'maya-charge', personId: 'maya', startMinute: 11 * 60, endMinute: 11 * 60 + 30, activity: 'charge', targetId: 'aac-charge', priority: 0.9, flexible: true },
  { id: 'maya-clinical', personId: 'maya', startMinute: 14 * 60, endMinute: 15 * 60, activity: 'appointment', targetId: 'clinical-centre', priority: 0.7, flexible: false },
];

export function worldMinute(state: PersistentWorldState, dayStartMinute = 8 * 60) {
  return (dayStartMinute + Math.floor(state.simulationSeconds / 60)) % (24 * 60);
}

export function currentSchedule(state: PersistentWorldState, personId: string, entries = defaultDailySchedules) {
  const minute = worldMinute(state);
  return entries
    .filter((entry) => entry.personId === personId && minute >= entry.startMinute && minute < entry.endMinute)
    .sort((a, b) => b.priority - a.priority)[0];
}

export function scheduleSummary(state: PersistentWorldState, personId: string, entries = defaultDailySchedules) {
  const active = currentSchedule(state, personId, entries);
  if (!active) return 'No fixed activity: personal goals and accessible opportunities remain available.';
  return `${active.activity.toUpperCase()} · ${active.targetId ?? 'self-directed'} · ${active.flexible ? 'flexible timing' : 'time-specific'}`;
}
