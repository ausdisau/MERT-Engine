import { planNextActivity, type PlannedActivity } from './autonomy';
import type { PersonEntity, PersistentWorldState, WorldEvent } from './worldModel';

export interface DailyScheduleEntry { atHour:number; goal:string; destinationId?:string; }
export interface PersonSchedule { personId:string; entries:DailyScheduleEntry[]; }
export const defaultSchedules:PersonSchedule[]=[{personId:'maya',entries:[{atHour:8,goal:'move through the community',destinationId:'transit'},{atHour:10,goal:'communicate directly',destinationId:'community-hub'},{atHour:14,goal:'participate in decisions',destinationId:'clinical-centre'},{atHour:17,goal:'move through the community',destinationId:'community-hub'}]}];
export interface DailyLifeTick { activity?:PlannedActivity; events:WorldEvent[]; }
export function simulatedHour(state:PersistentWorldState){return(8+Math.floor(state.simulationSeconds/3600))%24;}
export function scheduledGoal(state:PersistentWorldState,schedule:PersonSchedule){const hour=simulatedHour(state);return[...schedule.entries].reverse().find(entry=>entry.atHour<=hour)??schedule.entries[0];}
export function runDailyLifeTick(state:PersistentWorldState,schedule:PersonSchedule):DailyLifeTick{
  const person=state.entities.find((entity):entity is PersonEntity=>entity.kind==='person'&&entity.id===schedule.personId);if(!person)return{events:[]};
  const scheduled=scheduledGoal(state,schedule);if(!scheduled)return{events:[]};
  const planningState:PersistentWorldState={...state,entities:state.entities.map(entity=>entity.id===person.id&&entity.kind==='person'?{...entity,goals:[scheduled.goal,...person.goals.filter(goal=>goal!==scheduled.goal)]}:entity)};
  const activity=planNextActivity(planningState,person.id);if(!activity)return{events:[]};
  return{activity,events:[{id:`${state.simulationSeconds}-daily-${person.id}`,at:state.simulationSeconds,type:'daily-life.activity.planned',entityId:person.id,detail:`hour=${simulatedHour(state)}; goal=${scheduled.goal}; activity=${activity.kind}; target=${activity.targetId??scheduled.destinationId??'none'}`}]};
}
