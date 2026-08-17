import type { PersonEntity, PersistentWorldStore } from './worldModel';
import type { PersonSchedule } from './dailyLife';

export type RelationshipKind = 'friend' | 'peer' | 'family' | 'support' | 'clinician' | 'colleague';
export interface Relationship { from: string; to: string; kind: RelationshipKind; trust: number; }

export const population: PersonEntity[] = [
  { id:'liam', kind:'person', label:'Liam', position:[-8,0,4], persistent:true, tags:['resident','peer'], authority:'self', communication:{primary:'speech',access:'available',responseLatencySeconds:2}, mobility:{mode:'manual-wheelchair',independent:true}, goals:['meet friends','use community services','travel independently'] },
  { id:'rohan', kind:'person', label:'Rohan', position:[18,0,-8], persistent:true, tags:['resident','student'], authority:'self', communication:{primary:'multimodal',access:'available',responseLatencySeconds:5}, mobility:{mode:'walk',independent:true}, goals:['attend rehabilitation','study','meet friends'] },
  { id:'aisha', kind:'person', label:'Aisha', position:[12,0,26], persistent:true, tags:['resident','worker'], authority:'self', communication:{primary:'sign',access:'available',responseLatencySeconds:4}, mobility:{mode:'walk',independent:true}, goals:['work','socialise','travel through community'] }
];

export const relationships: Relationship[] = [
  { from:'maya', to:'liam', kind:'friend', trust:.9 }, { from:'liam', to:'maya', kind:'friend', trust:.9 },
  { from:'maya', to:'aisha', kind:'peer', trust:.75 }, { from:'rohan', to:'liam', kind:'peer', trust:.7 }
];

export const populationSchedules: PersonSchedule[] = [
  { personId:'liam', entries:[{atHour:8,goal:'travel independently',destinationId:'transit'},{atHour:11,goal:'meet friends',destinationId:'community-hub'},{atHour:16,goal:'use community services',destinationId:'community-hub'}] },
  { personId:'rohan', entries:[{atHour:8,goal:'study',destinationId:'community-hub'},{atHour:13,goal:'attend rehabilitation',destinationId:'rehab-lab'},{atHour:17,goal:'meet friends',destinationId:'community-hub'}] },
  { personId:'aisha', entries:[{atHour:8,goal:'work',destinationId:'community-hub'},{atHour:12,goal:'travel through community',destinationId:'transit'},{atHour:17,goal:'socialise',destinationId:'community-hub'}] }
];

export function ensurePopulation(store: PersistentWorldStore) {
  for (const person of population) if (!store.entity(person.id)) store.upsertEntity(person);
  store.recordEvent('population.ready', undefined, `persistent population=${population.length + 1}; relationships=${relationships.length}`);
}
