import { planPopulation } from './autonomy';
import { assessClinicalTrigger, bridgeToClinicalRuntime, type ClinicalRuntimePort } from './clinicalBridge';
import { defaultSchedules, runDailyLifeTick } from './dailyLife';
import { ensurePopulation, populationSchedules } from './population';
import { defaultSocialAgents, interact, socialEvents } from './socialAgents';
import { dynamicsEvents, proposeDynamics, type DynamicsProposal } from './vnnDynamics';
import type { PersonEntity, PersistentWorldState, PersistentWorldStore, Vec3 } from './worldModel';

export interface LiveWorldFrame { activities: ReturnType<typeof planPopulation>; proposals: DynamicsProposal[]; clinical: ReturnType<typeof assessClinicalTrigger>[]; }

export class WorldRuntime {
  private accumulator=0; private socialAccumulator=0;
  private lastFrame:LiveWorldFrame={activities:[],proposals:[],clinical:[]};
  constructor(private store:PersistentWorldStore,private clinicalRuntime?:ClinicalRuntimePort){ensurePopulation(store);}
  snapshot(){return this.lastFrame;}
  step(realSeconds:number):LiveWorldFrame{
    this.store.tick(realSeconds);this.accumulator+=realSeconds;this.socialAccumulator+=realSeconds;if(this.accumulator<2)return this.lastFrame;
    const stepSeconds=this.accumulator;this.accumulator=0;let state=this.store.snapshot();const schedules=[...defaultSchedules,...populationSchedules];
    this.store.appendEvents(schedules.flatMap(schedule=>runDailyLifeTick(state,schedule).events));state=this.store.snapshot();
    const activities=planPopulation(state);const proposals=activities.map(activity=>proposeDynamics(state,activity));this.store.appendEvents(proposals.flatMap(p=>dynamicsEvents(state,p)));for(const activity of activities)this.advanceActivity(state,activity,stepSeconds);
    if(this.socialAccumulator>=15){this.socialAccumulator=0;const people=state.entities.filter((e):e is PersonEntity=>e.kind==='person');for(let i=0;i<people.length;i++){const person=people[i],agent=defaultSocialAgents[(i+Math.floor(state.simulationSeconds/15))%defaultSocialAgents.length];if(person&&agent){const interaction=interact(state,agent,person.id,person.communication.access==='available'?'greet':'ask');if(interaction)this.store.appendEvents(socialEvents(state,interaction));}}}
    state=this.store.snapshot();const clinical=state.entities.filter((e):e is PersonEntity=>e.kind==='person').map(p=>assessClinicalTrigger(state,p.id,proposals));if(this.clinicalRuntime)for(const assessment of clinical){const event=bridgeToClinicalRuntime(state,assessment,this.clinicalRuntime);if(event)this.store.appendEvents([event]);}
    this.lastFrame={activities,proposals,clinical};return this.lastFrame;
  }
  private advanceActivity(state:PersistentWorldState,activity:ReturnType<typeof planPopulation>[number],seconds:number){if(!activity.targetId||(activity.kind!=='travel'&&activity.kind!=='seek-alternative'))return;const person=state.entities.find((e):e is PersonEntity=>e.kind==='person'&&e.id===activity.personId),target=state.entities.find(e=>e.id===activity.targetId);if(!person||!target)return;const[px,py,pz]=person.position,[tx,,tz]=target.position,dx=tx-px,dz=tz-pz,d=Math.hypot(dx,dz);if(d<1.25)return;const speed=person.mobility.mode==='powered-wheelchair'?1.25:person.mobility.mode==='manual-wheelchair'?1.0:1.15,amount=Math.min(d,speed*seconds);this.store.move(person.id,[px+dx/d*amount,py,pz+dz/d*amount] as Vec3);}
}

/** @deprecated Use WorldRuntime. */
export class LiveWorldLoop extends WorldRuntime {}
