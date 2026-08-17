import type { PersistentWorldStore, WorldEvent } from './worldModel';

export const WOLFRAM_OBJECT_MODELS = {
  liftSmoothstep: 's(u)=3u^2-2u^3',
  liftExample: { distanceMetres: 4.2, durationSeconds: 8, maxVelocityMetresPerSecond: .7875 },
  charger: 'B(t)=C-(C-B0) exp(-k t)',
  chargerExample: { initialPercent: 30, targetPercent: 80, kPerSecond: .0015, timeToTargetSeconds: 835.1753123302453 },
};

export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing';
export interface DoorState { id:string; phase:DoorPhase; progress:number; holdSeconds:number; elapsed:number; }
export interface LiftState { id:string; currentLevel:number; fromLevel:number; targetLevel:number; phase:'idle'|'moving'|'doors-open'; elapsed:number; duration:number; positionMetres:number; }
export interface ChargerSession { personId:string; initialPercent:number; currentPercent:number; capacityPercent:number; kPerSecond:number; elapsed:number; active:boolean; }
export interface TransportState { id:string; atStop:boolean; capacity:number; passengers:string[]; doorsOpen:boolean; }

export interface ObjectWorldSnapshot {
  doors: DoorState[];
  lift: LiftState;
  chargers: ChargerSession[];
  transport: TransportState;
}

const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
export const smoothstep=(u:number)=>{const x=clamp01(u);return 3*x*x-2*x*x*x;};
export const chargerPercent=(initial:number,capacity:number,k:number,t:number)=>capacity-(capacity-initial)*Math.exp(-k*Math.max(0,t));

export class ObjectInteractionEngine {
  private doors = new Map<string,DoorState>([
    ['community-door',{id:'community-door',phase:'closed',progress:0,holdSeconds:4,elapsed:0}],
    ['clinical-door',{id:'clinical-door',phase:'closed',progress:0,holdSeconds:4,elapsed:0}],
    ['rehab-door',{id:'rehab-door',phase:'closed',progress:0,holdSeconds:4,elapsed:0}],
    ['transit-door',{id:'transit-door',phase:'closed',progress:0,holdSeconds:4,elapsed:0}],
  ]);
  private lift:LiftState={id:'station-lift',currentLevel:0,fromLevel:0,targetLevel:0,phase:'idle',elapsed:0,duration:8,positionMetres:0};
  private chargers=new Map<string,ChargerSession>();
  private transport:TransportState={id:'community-shuttle',atStop:true,capacity:6,passengers:[],doorsOpen:true};

  constructor(private store?:PersistentWorldStore){}

  snapshot():ObjectWorldSnapshot{return {doors:[...this.doors.values()].map(x=>({...x})),lift:{...this.lift},chargers:[...this.chargers.values()].map(x=>({...x})),transport:{...this.transport,passengers:[...this.transport.passengers]}};}

  requestDoor(id:string,personId?:string){const door=this.doors.get(id);if(!door)return false;if(door.phase==='closed'||door.phase==='closing'){door.phase='opening';door.elapsed=0;this.event('object.door.requested',personId,`${id} opening requested`);}return true;}

  requestLift(targetLevel:number,personId?:string){if(this.lift.phase==='moving')return false;if(targetLevel===this.lift.currentLevel){this.lift.phase='doors-open';this.event('object.lift.available',personId,`lift already at level ${targetLevel}`);return true;}this.lift.fromLevel=this.lift.currentLevel;this.lift.targetLevel=targetLevel;this.lift.elapsed=0;this.lift.phase='moving';this.event('object.lift.requested',personId,`lift moving ${this.lift.fromLevel}->${targetLevel}`);return true;}

  startCharging(personId:string,initialPercent:number,kPerSecond=.0015){this.chargers.set(personId,{personId,initialPercent,currentPercent:initialPercent,capacityPercent:100,kPerSecond,elapsed:0,active:true});this.event('object.charger.started',personId,`charging started at ${initialPercent.toFixed(1)}%`);}
  stopCharging(personId:string){const session=this.chargers.get(personId);if(!session)return;session.active=false;this.event('object.charger.stopped',personId,`charging stopped at ${session.currentPercent.toFixed(1)}%`);}

  boardTransport(personId:string){if(!this.transport.atStop||!this.transport.doorsOpen)return {ok:false,reason:'transport not ready for boarding'};if(this.transport.passengers.includes(personId))return {ok:true,reason:'already boarded'};if(this.transport.passengers.length>=this.transport.capacity)return {ok:false,reason:'transport capacity reached'};this.transport.passengers.push(personId);this.event('object.transport.boarded',personId,'boarding completed after explicit request');return {ok:true,reason:'boarded'};}
  alightTransport(personId:string){this.transport.passengers=this.transport.passengers.filter(id=>id!==personId);this.event('object.transport.alighted',personId,'alighted transport');}

  step(seconds:number){const dt=Math.max(0,seconds);
    for(const door of this.doors.values()){
      if(door.phase==='opening'){door.elapsed+=dt;door.progress=smoothstep(door.elapsed/1.25);if(door.elapsed>=1.25){door.phase='open';door.progress=1;door.elapsed=0;}}
      else if(door.phase==='open'){door.elapsed+=dt;if(door.elapsed>=door.holdSeconds){door.phase='closing';door.elapsed=0;}}
      else if(door.phase==='closing'){door.elapsed+=dt;door.progress=1-smoothstep(door.elapsed/1.25);if(door.elapsed>=1.25){door.phase='closed';door.progress=0;door.elapsed=0;}}
    }
    if(this.lift.phase==='moving'){this.lift.elapsed+=dt;const u=this.lift.elapsed/this.lift.duration;const y0=this.lift.fromLevel*4.2,y1=this.lift.targetLevel*4.2;this.lift.positionMetres=y0+(y1-y0)*smoothstep(u);if(u>=1){this.lift.currentLevel=this.lift.targetLevel;this.lift.positionMetres=y1;this.lift.phase='doors-open';this.lift.elapsed=0;}}
    else if(this.lift.phase==='doors-open'){this.lift.elapsed+=dt;if(this.lift.elapsed>=4){this.lift.phase='idle';this.lift.elapsed=0;}}
    for(const session of this.chargers.values())if(session.active){session.elapsed+=dt;session.currentPercent=chargerPercent(session.initialPercent,session.capacityPercent,session.kPerSecond,session.elapsed);if(session.currentPercent>=99.5)session.active=false;}
  }

  private event(type:string,entityId:string|undefined,detail:string):WorldEvent|undefined{return this.store?.recordEvent(type,entityId,detail);}
}
