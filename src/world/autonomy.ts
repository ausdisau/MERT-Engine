import { routeOptions } from './affordanceGraph';
import type { PersonEntity, PersistentWorldState } from './worldModel';

export type ActivityKind = 'travel' | 'socialise' | 'communicate' | 'recharge' | 'rest' | 'seek-alternative';
export interface PlannedActivity { personId:string; kind:ActivityKind; goal:string; targetId?:string; rationale:string; confidence:number; }

function goalTarget(goal:string){const text=goal.toLowerCase();if(text.includes('community'))return'community-hub';if(text.includes('communicate'))return'community-hub';if(text.includes('decision'))return'clinical-centre';return undefined;}

export function planNextActivity(state:PersistentWorldState,personId:string):PlannedActivity|undefined{
  const person=state.entities.find((entity):entity is PersonEntity=>entity.id===personId&&entity.kind==='person');
  if(!person)return undefined;
  const goal=person.goals[0];if(!goal)return undefined;
  const preferredTarget=goalTarget(goal),routes=routeOptions(state,personId),preferred=preferredTarget?routes.find(route=>route.targetId===preferredTarget):undefined;
  if(preferredTarget&&preferred?.accessible)return{personId,kind:'travel',goal,targetId:preferredTarget,rationale:'goal-aligned accessible route is available',confidence:.95};
  const alternative=routes.find(route=>route.accessible);
  if(alternative)return{personId,kind:'seek-alternative',goal,targetId:alternative.targetId,rationale:preferredTarget?'preferred route is inaccessible; preserve goal by seeking an accessible alternative':'accessible option selected from represented affordances',confidence:.8};
  return{personId,kind:'rest',goal,rationale:'no represented accessible route is currently available; do not attribute the barrier to disability',confidence:.75};
}

export function planPopulation(state:PersistentWorldState){return state.entities.filter((entity):entity is PersonEntity=>entity.kind==='person').map(person=>planNextActivity(state,person.id)).filter((activity):activity is PlannedActivity=>Boolean(activity));}
