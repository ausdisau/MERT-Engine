import { evaluateAffordance } from './affordanceGraph';
import { normalizeIntent, type InteractionModality, type WorldIntent } from './vrInteraction';
import type { OpenWorldEntity, PersonEntity, PersistentWorldState, Vec3 } from './worldModel';

export interface NearbyEntity { entity: OpenWorldEntity; distance: number; }
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);

export function nearbyEntities(state: PersistentWorldState, actorId: string, radius=4): NearbyEntity[] {
  const actor=state.entities.find((e):e is PersonEntity=>e.id===actorId&&e.kind==='person');
  if(!actor)return[];
  return state.entities.filter(e=>e.id!==actorId).map(entity=>({entity,distance:distance(actor.position,entity.position)})).filter(x=>x.distance<=radius).sort((a,b)=>a.distance-b.distance);
}

export function createSpatialIntent(actorId:string,targetId:string,action:WorldIntent['action'],modality:InteractionModality):WorldIntent {
  return normalizeIntent({actorId,targetId,action,modality});
}

export function evaluateSpatialIntent(state:PersistentWorldState,intent:WorldIntent){
  const actor=state.entities.find((e):e is PersonEntity=>e.id===intent.actorId&&e.kind==='person');
  const target=state.entities.find(e=>e.id===intent.targetId);
  if(!actor||!target)return{allowed:false,reason:'actor or target not represented'};
  if(intent.action==='communicate'){
    if(target.kind!=='person')return{allowed:false,reason:'communication target is not a person'};
    if(actor.communication.access==='unavailable')return{allowed:false,reason:'communication access unavailable; intent is preserved and may be retried'};
    return{allowed:true,reason:'direct communication available'};
  }
  if(intent.action==='inspect'||intent.action==='select')return{allowed:true,reason:'semantic target available'};
  const affordance=evaluateAffordance(actor,target,intent.action==='use'?'use':'reach');
  return{allowed:affordance.available,reason:affordance.reason,affordance};
}

export function wayfind(state:PersistentWorldState,actorId:string,targetId:string){
  const actor=state.entities.find((e):e is PersonEntity=>e.id===actorId&&e.kind==='person');
  const target=state.entities.find(e=>e.id===targetId);
  if(!actor||!target)return undefined;
  const direct=evaluateAffordance(actor,target,'reach');
  return{actorId,targetId,destination:target.position,distance:distance(actor.position,target.position),accessible:direct.available,reason:direct.reason};
}
