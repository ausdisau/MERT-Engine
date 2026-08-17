import { relationships } from './population';
import type { PersonEntity, PersistentWorldState, WorldEvent } from './worldModel';

export const WOLFRAM_SOCIAL_MODEL = {
  formula: 'sigmoid(2*relationship + sharedGoal - 0.35*distance - 1.5*contextLoad)',
  examples: {
    friendNearby: .8979819308108695,
    strangerNearby: .3047033306524346,
    friendFar: .24973989440488245,
  },
};

export interface SocialEncounter {
  a: string;
  b: string;
  distance: number;
  relationship: number;
  sharedGoal: number;
  contextLoad: number;
  score: number;
  status: 'recognised' | 'conversation-ready' | 'waiting-for-access';
  supportRequested: boolean;
}

const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const distance2D=(a:PersonEntity,b:PersonEntity)=>Math.hypot(a.position[0]-b.position[0],a.position[2]-b.position[2]);

function relationshipStrength(a:string,b:string){return relationships.find(r=>r.from===a&&r.to===b)?.trust ?? relationships.find(r=>r.from===b&&r.to===a)?.trust ?? 0;}
function sharedGoalScore(a:PersonEntity,b:PersonEntity){const A=new Set(a.goals.map(g=>g.toLowerCase()));return b.goals.some(g=>A.has(g.toLowerCase()))?1:0;}

export function encounterScore(distance:number,relationship:number,sharedGoal:number,contextLoad:number){return sigmoid(2*relationship+sharedGoal-.35*distance-1.5*contextLoad);}

export class SocialEncounterEngine {
  private requests=new Set<string>();
  private previous=new Set<string>();

  requestSupport(from:string,to:string){this.requests.add(`${from}->${to}`);}
  clearSupportRequest(from:string,to:string){this.requests.delete(`${from}->${to}`);}

  detect(state:PersistentWorldState,contextLoad=.2):{encounters:SocialEncounter[];events:WorldEvent[]}{
    const people=state.entities.filter((e):e is PersonEntity=>e.kind==='person');const encounters:SocialEncounter[]=[];const events:WorldEvent[]=[];const current=new Set<string>();
    for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
      const a=people[i],b=people[j];if(!a||!b)continue;const distance=distance2D(a,b),relationship=relationshipStrength(a.id,b.id),sharedGoal=sharedGoalScore(a,b),score=encounterScore(distance,relationship,sharedGoal,contextLoad);if(score<.6||distance>6)continue;
      const key=[a.id,b.id].sort().join('|');current.add(key);const accessAvailable=a.communication.access!=='unavailable'&&b.communication.access!=='unavailable';const status:SocialEncounter['status']=accessAvailable?(score>.75?'conversation-ready':'recognised'):'waiting-for-access';const supportRequested=this.requests.has(`${a.id}->${b.id}`)||this.requests.has(`${b.id}->${a.id}`);
      encounters.push({a:a.id,b:b.id,distance,relationship,sharedGoal,contextLoad,score,status,supportRequested});
      if(!this.previous.has(key))events.push({id:`${state.simulationSeconds}-encounter-${key}`,at:state.simulationSeconds,type:'social.encounter.started',entityId:a.id,detail:`with=${b.id}; score=${score.toFixed(3)}; status=${status}; support=${supportRequested?'requested':'not-assumed'}`});
    }
    for(const key of this.previous)if(!current.has(key))events.push({id:`${state.simulationSeconds}-encounter-end-${key}`,at:state.simulationSeconds,type:'social.encounter.ended',detail:key});
    this.previous=current;return {encounters,events};
  }
}
