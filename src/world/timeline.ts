import type { PersistentWorldState, WorldEvent } from './worldModel';

export interface TimelineSnapshot { id:string; label:string; at:number; state:PersistentWorldState; parentId?:string; branchReason?:string; }
export interface CounterfactualComparison { leftId:string; rightId:string; simulationDeltaSeconds:number; entityChanges:Array<{entityId:string;changedFields:string[]}>; eventTypesOnlyLeft:string[]; eventTypesOnlyRight:string[]; }
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

export class WorldTimeline {
  private snapshots=new Map<string,TimelineSnapshot>();
  capture(state:PersistentWorldState,label:string,parentId?:string,branchReason?:string):TimelineSnapshot{
    const id=`snapshot-${state.simulationSeconds}-${this.snapshots.size+1}`;
    const snapshot:TimelineSnapshot={id,label,at:state.simulationSeconds,state:clone(state),...(parentId?{parentId}:{}),...(branchReason?{branchReason}:{})};
    this.snapshots.set(id,snapshot);return clone(snapshot);
  }
  get(id:string):TimelineSnapshot|undefined{const snapshot=this.snapshots.get(id);return snapshot?clone(snapshot):undefined;}
  branch(snapshotId:string,label:string,mutate:(state:PersistentWorldState)=>void,reason:string):TimelineSnapshot|undefined{const parent=this.snapshots.get(snapshotId);if(!parent)return undefined;const state=clone(parent.state);mutate(state);state.events.push({id:`${state.simulationSeconds}-counterfactual-${state.events.length}`,at:state.simulationSeconds,type:'timeline.counterfactual.branch',detail:reason});return this.capture(state,label,parent.id,reason);}
  replay(snapshotId:string,events:WorldEvent[]):TimelineSnapshot|undefined{const parent=this.snapshots.get(snapshotId);if(!parent)return undefined;const state=clone(parent.state);state.events.push(...clone(events));if(events.length>0)state.simulationSeconds=Math.max(state.simulationSeconds,...events.map(event=>event.at));return this.capture(state,`${parent.label} replay`,parent.id,'deterministic event replay');}
  compare(leftId:string,rightId:string):CounterfactualComparison|undefined{const left=this.snapshots.get(leftId),right=this.snapshots.get(rightId);if(!left||!right)return undefined;const rightById=new Map(right.state.entities.map(entity=>[entity.id,entity]));const entityChanges=left.state.entities.flatMap(leftEntity=>{const rightEntity=rightById.get(leftEntity.id);if(!rightEntity)return[{entityId:leftEntity.id,changedFields:['removed']}];const fields=new Set([...Object.keys(leftEntity),...Object.keys(rightEntity)]),changedFields=[...fields].filter(field=>JSON.stringify((leftEntity as any)[field])!==JSON.stringify((rightEntity as any)[field]));return changedFields.length?[{entityId:leftEntity.id,changedFields}]:[];});const leftTypes=new Set(left.state.events.map(event=>event.type)),rightTypes=new Set(right.state.events.map(event=>event.type));return{leftId,rightId,simulationDeltaSeconds:right.at-left.at,entityChanges,eventTypesOnlyLeft:[...leftTypes].filter(type=>!rightTypes.has(type)),eventTypesOnlyRight:[...rightTypes].filter(type=>!leftTypes.has(type))};}
}
