import { planPopulation } from './autonomy';
import { assessClinicalTrigger, bridgeToClinicalRuntime, type ClinicalRuntimePort } from './clinicalBridge';
import { defaultSchedules, runDailyLifeTick } from './dailyLife';
import { ensurePopulation, populationSchedules } from './population';
import { defaultSocialAgents, interact, socialEvents } from './socialAgents';
import { dynamicsEvents, proposeDynamics, type DynamicsProposal } from './vnnDynamics';
import { defaultNavigationNetwork, routeForPerson, type RouteResult } from './accessibleNavigation';
import { ObjectInteractionEngine, type ObjectWorldSnapshot } from './objectInteractions';
import { SocialEncounterEngine, type SocialEncounter } from './socialEncounters';
import { ContinuityEngine, type ContinuityStage } from './continuity';
import { applyProceduralCity, generateProceduralCity, type ProceduralCityPlan } from './proceduralCity';
import { buildCityNavMesh, findNavMeshPath, type CityNavMesh, type NavMeshPath } from './navmeshGeometry';
import { HomeTransportEngine, type HomeTransportSnapshot, type TransportTripRequest } from './homeTransport';
import { EmergencyResponseEngine, type EmergencyResponseSnapshot } from './emergencyServices';
import type { PersonEntity, PersistentWorldState, PersistentWorldStore, Vec3 } from './worldModel';

export interface LiveWorldFrame {
  activities: ReturnType<typeof planPopulation>;
  proposals: DynamicsProposal[];
  clinical: ReturnType<typeof assessClinicalTrigger>[];
  routes: Record<string, RouteResult | undefined>;
  navMeshRoutes: Record<string,NavMeshPath|undefined>;
  objects: ObjectWorldSnapshot;
  encounters: SocialEncounter[];
  continuity: Record<string,string>;
  services: HomeTransportSnapshot;
  emergency: EmergencyResponseSnapshot;
}

export class WorldRuntime {
  private accumulator=0;
  private socialAccumulator=0;
  private objects:ObjectInteractionEngine;
  private encounterEngine=new SocialEncounterEngine();
  private continuityEngine:ContinuityEngine;
  private cityPlanData:ProceduralCityPlan;
  private navMeshData:CityNavMesh;
  private homeTransport:HomeTransportEngine;
  private emergencyResponse:EmergencyResponseEngine;
  private lastFrame:LiveWorldFrame;

  constructor(private store:PersistentWorldStore,private clinicalRuntime?:ClinicalRuntimePort){
    ensurePopulation(store);
    this.cityPlanData=generateProceduralCity();
    applyProceduralCity(store,this.cityPlanData);
    this.navMeshData=buildCityNavMesh(this.cityPlanData);
    this.objects=new ObjectInteractionEngine(store);
    this.continuityEngine=new ContinuityEngine(store);
    this.homeTransport=new HomeTransportEngine(store,this.cityPlanData);
    this.emergencyResponse=new EmergencyResponseEngine(store,this.cityPlanData,this.continuityEngine);
    this.lastFrame={
      activities:[],proposals:[],clinical:[],routes:{},navMeshRoutes:{},
      objects:this.objects.snapshot(),encounters:[],continuity:{},services:this.homeTransport.snapshot(),emergency:this.emergencyResponse.snapshot(),
    };
  }

  snapshot(){return this.lastFrame;}
  objectEngine(){return this.objects;}
  continuity(){return this.continuityEngine;}
  cityPlan(){return this.cityPlanData;}
  navMesh(){return this.navMeshData;}
  serviceEngine(){return this.homeTransport;}
  emergencyEngine(){return this.emergencyResponse;}

  step(realSeconds:number):LiveWorldFrame{
    this.store.tick(realSeconds);
    this.objects.step(realSeconds);
    this.homeTransport.step(realSeconds);
    this.emergencyResponse.step(realSeconds);
    this.accumulator+=realSeconds;
    this.socialAccumulator+=realSeconds;
    if(this.accumulator<2)return {...this.lastFrame,objects:this.objects.snapshot(),services:this.homeTransport.snapshot(),emergency:this.emergencyResponse.snapshot()};

    const stepSeconds=this.accumulator;
    this.accumulator=0;
    let state=this.store.snapshot();
    const schedules=[...defaultSchedules,...populationSchedules];
    this.store.appendEvents(schedules.flatMap(schedule=>runDailyLifeTick(state,schedule).events));
    state=this.store.snapshot();

    const activities=planPopulation(state);
    const proposals=activities.map(activity=>proposeDynamics(state,activity));
    this.store.appendEvents(proposals.flatMap(p=>dynamicsEvents(state,p)));

    const routes:Record<string,RouteResult|undefined>={};
    const navMeshRoutes:Record<string,NavMeshPath|undefined>={};
    for(const activity of activities){
      const person=state.entities.find((e):e is PersonEntity=>e.kind==='person'&&e.id===activity.personId);
      if(!person||!activity.targetId)continue;
      const route=routeForPerson(state,person,activity.targetId,defaultNavigationNetwork)[0];
      routes[person.id]=route;
      const target=state.entities.find(entity=>entity.id===activity.targetId);
      const navRoute=target?findNavMeshPath(this.navMeshData,state,person,person.position,target.position):undefined;
      navMeshRoutes[person.id]=navRoute;
      this.advanceActivity(state,activity,route,navRoute,stepSeconds);
    }

    if(this.socialAccumulator>=15){
      this.socialAccumulator=0;
      const people=state.entities.filter((e):e is PersonEntity=>e.kind==='person');
      for(let i=0;i<people.length;i++){
        const person=people[i],agent=defaultSocialAgents[(i+Math.floor(state.simulationSeconds/15))%defaultSocialAgents.length];
        if(person&&agent){const interaction=interact(state,agent,person.id,person.communication.access==='available'?'greet':'ask');if(interaction)this.store.appendEvents(socialEvents(state,interaction));}
      }
    }

    const encounterResult=this.encounterEngine.detect(this.store.snapshot());
    if(encounterResult.events.length)this.store.appendEvents(encounterResult.events);

    state=this.store.snapshot();
    const clinical=state.entities.filter((e):e is PersonEntity=>e.kind==='person').map(p=>assessClinicalTrigger(state,p.id,proposals));
    for(const assessment of clinical){
      if(assessment.status==='scenario-eligible'){
        const person=state.entities.find((e):e is PersonEntity=>e.kind==='person'&&e.id===assessment.personId);
        if(person&&!this.continuityEngine.episode(person.id)){
          this.continuityEngine.start(person,assessment.reasons.join('; '));
          this.emergencyResponse.dispatchFromContinuity(person.id,assessment.reasons.join('; '));
        }
      }
      if(this.clinicalRuntime){const event=bridgeToClinicalRuntime(state,assessment,this.clinicalRuntime);if(event)this.store.appendEvents([event]);}
    }

    const continuity:Record<string,string>={};
    for(const person of state.entities.filter((e):e is PersonEntity=>e.kind==='person'))continuity[person.id]=this.continuityEngine.summary(person.id);
    this.lastFrame={activities,proposals,clinical,routes,navMeshRoutes,objects:this.objects.snapshot(),encounters:encounterResult.encounters,continuity,services:this.homeTransport.snapshot(),emergency:this.emergencyResponse.snapshot()};
    return this.lastFrame;
  }

  requestSupport(from:string,to:string){this.encounterEngine.requestSupport(from,to);this.store.recordEvent('social.support.requested',from,`support requested from ${to}; support is not assumed`);}
  requestCityTrip(personId:string,originId:string,destinationId:string):TransportTripRequest|undefined{return this.homeTransport.requestTrip(personId,originId,destinationId);}
  boardCityTrip(tripId:string){return this.homeTransport.board(tripId);}
  beginContinuity(personId:string,reason='facilitator-triggered educational deterioration'){
    const person=this.store.entity(personId);if(!person||person.kind!=='person')return false;
    this.continuityEngine.start(person as PersonEntity,reason);
    this.emergencyResponse.dispatchFromContinuity(personId,reason);
    return true;
  }
  advanceContinuity(personId:string,next?:ContinuityStage){return next?this.continuityEngine.advance(personId,next):this.continuityEngine.advanceDemoPath(personId);}

  private advanceActivity(state:PersistentWorldState,activity:ReturnType<typeof planPopulation>[number],route:RouteResult|undefined,navRoute:NavMeshPath|undefined,seconds:number){
    if(!activity.targetId||(activity.kind!=='travel'&&activity.kind!=='seek-alternative'))return;
    const person=state.entities.find((e):e is PersonEntity=>e.kind==='person'&&e.id===activity.personId);
    if(!person)return;
    if(!route&&!navRoute){this.store.recordEvent('navigation.no-accessible-route',person.id,`goal preserved; target=${activity.targetId}; environmental/route barrier`);return;}

    const current=[person.position[0],person.position[1],person.position[2]] as Vec3;
    const points=navRoute?.points??route?.points??[];
    const remaining=points.filter(point=>Math.hypot(point[0]-current[0],point[2]-current[2])>1.2);
    const waypoint=remaining[0]??points[points.length-1];
    if(!waypoint)return;

    if(route){
      const legacyWaypoint=route.points.find(point=>Math.hypot(point[0]-current[0],point[2]-current[2])>1.2);
      if(legacyWaypoint){const waypointIndex=route.points.indexOf(legacyWaypoint),waypointId=route.nodeIds[waypointIndex],distance=Math.hypot(legacyWaypoint[0]-current[0],legacyWaypoint[2]-current[2]);if(distance<2.5&&waypointId?.includes('-door'))this.objects.requestDoor(waypointId,person.id);if(distance<2.5&&waypointId==='station-lift')this.objects.requestLift(0,person.id);}
    }

    const dx=waypoint[0]-current[0],dz=waypoint[2]-current[2],distance=Math.hypot(dx,dz);
    if(distance<.01)return;
    const speed=person.mobility.mode==='powered-wheelchair'?1.25:person.mobility.mode==='manual-wheelchair'?1.0:1.15;
    const amount=Math.min(distance,speed*seconds);
    this.store.move(person.id,[current[0]+dx/distance*amount,current[1],current[2]+dz/distance*amount] as Vec3);
  }
}

/** @deprecated Use WorldRuntime. */
export class LiveWorldLoop extends WorldRuntime {}
