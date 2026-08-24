import type { PersonEntity, PersistentWorldStore, Vec3 } from './worldModel';
import type { CityBuilding, ProceduralCityPlan } from './proceduralCity';

export interface HomeState {
  id:string;
  residentIds:string[];
  entryOperational:boolean;
  mainsPower:boolean;
  backupPower:boolean;
  chargingAvailable:boolean;
  quietSpace:boolean;
}

export interface TransportVehicleState {
  id:string;
  label:string;
  position:Vec3;
  capacity:number;
  wheelchairSpaces:number;
  passengers:string[];
  reservedWheelchairSpaces:string[];
  route:string[];
  currentStopIndex:number;
  nextStopIndex:number;
  dwellSeconds:number;
  status:'dwelling'|'moving'|'out-of-service';
  speedMetresPerSecond:number;
}

export interface TransportTripRequest {
  id:string;
  personId:string;
  originId:string;
  destinationId:string;
  status:'requested'|'allocated'|'boarded'|'completed'|'unavailable';
  vehicleId?:string;
  reason:string;
  supportRequested:boolean;
}

export interface HomeTransportSnapshot {
  homes:HomeState[];
  vehicles:TransportVehicleState[];
  trips:TransportTripRequest[];
}

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

function buildingPosition(plan:ProceduralCityPlan,id:string):Vec3|undefined {
  return plan.buildings.find(building=>building.id===id)?.position;
}

export class HomeTransportEngine {
  private homes=new Map<string,HomeState>();
  private vehicles=new Map<string,TransportVehicleState>();
  private trips=new Map<string,TransportTripRequest>();
  private requestCounter=0;

  constructor(private store:PersistentWorldStore,private plan:ProceduralCityPlan){
    for(const building of plan.buildings.filter(item=>item.kind==='home'))this.homes.set(building.id,this.homeFromBuilding(building));
    const route=['home-maya','community-hub','city-transport-hub','hospital-main','employment-centre','home-maya'];
    this.vehicles.set('city-access-shuttle',{
      id:'city-access-shuttle',label:'City accessible shuttle',position:buildingPosition(plan,'city-transport-hub')??[-180,0,-180],
      capacity:8,wheelchairSpaces:3,passengers:[],reservedWheelchairSpaces:[],route,currentStopIndex:2,nextStopIndex:3,dwellSeconds:12,status:'dwelling',speedMetresPerSecond:9,
    });
    this.store.recordEvent('services.home-transport.ready',undefined,`homes=${this.homes.size}; vehicles=${this.vehicles.size}`);
  }

  snapshot():HomeTransportSnapshot{return {homes:[...this.homes.values()].map(clone),vehicles:[...this.vehicles.values()].map(clone),trips:[...this.trips.values()].map(clone)};}

  homeForPerson(personId:string){return [...this.homes.values()].find(home=>home.residentIds.includes(personId));}

  setHomePower(homeId:string,mainsPower:boolean){
    const home=this.homes.get(homeId);if(!home)return false;home.mainsPower=mainsPower;
    this.store.recordEvent('home.power.changed',homeId,`mains=${mainsPower}; backup=${home.backupPower}; charging=${home.chargingAvailable}`);return true;
  }

  requestTrip(personId:string,originId:string,destinationId:string):TransportTripRequest|undefined {
    const entity=this.store.entity(personId);if(!entity||entity.kind!=='person')return undefined;
    const person=entity as PersonEntity;
    const vehicle=[...this.vehicles.values()].find(item=>item.status!=='out-of-service');
    const id=`trip-${++this.requestCounter}`;
    if(!vehicle){const trip:TransportTripRequest={id,personId,originId,destinationId,status:'unavailable',reason:'no represented transport vehicle available; preserve travel goal',supportRequested:false};this.trips.set(id,trip);return clone(trip);}
    const usesWheelchair=person.mobility.mode==='powered-wheelchair'||person.mobility.mode==='manual-wheelchair';
    const wheelchairAvailable=vehicle.reservedWheelchairSpaces.length<vehicle.wheelchairSpaces;
    const capacityAvailable=vehicle.passengers.length<vehicle.capacity;
    if(!capacityAvailable||(usesWheelchair&&!wheelchairAvailable)){
      const trip:TransportTripRequest={id,personId,originId,destinationId,status:'unavailable',reason:usesWheelchair?'wheelchair space unavailable on current service':'vehicle capacity unavailable',supportRequested:false};this.trips.set(id,trip);return clone(trip);
    }
    const trip:TransportTripRequest={id,personId,originId,destinationId,status:'allocated',vehicleId:vehicle.id,reason:'accessible capacity allocated; boarding remains an explicit action',supportRequested:false};
    this.trips.set(id,trip);if(usesWheelchair)vehicle.reservedWheelchairSpaces.push(personId);
    this.store.recordEvent('transport.trip.allocated',personId,`${originId}->${destinationId}; vehicle=${vehicle.id}; support not assumed`);return clone(trip);
  }

  requestSupport(tripId:string){const trip=this.trips.get(tripId);if(!trip)return false;trip.supportRequested=true;this.store.recordEvent('transport.support.requested',trip.personId,`trip=${tripId}; explicit request`);return true;}

  board(tripId:string){
    const trip=this.trips.get(tripId);if(!trip||trip.status!=='allocated'||!trip.vehicleId)return false;
    const vehicle=this.vehicles.get(trip.vehicleId);if(!vehicle||vehicle.status!=='dwelling')return false;
    const currentStop=vehicle.route[vehicle.currentStopIndex];if(currentStop!==trip.originId)return false;
    if(!vehicle.passengers.includes(trip.personId))vehicle.passengers.push(trip.personId);trip.status='boarded';
    this.store.recordEvent('transport.boarded',trip.personId,`vehicle=${vehicle.id}; destination=${trip.destinationId}; explicit boarding action`);return true;
  }

  step(seconds:number){
    for(const vehicle of this.vehicles.values()){
      if(vehicle.status==='out-of-service')continue;
      if(vehicle.status==='dwelling'){
        vehicle.dwellSeconds-=seconds;
        if(vehicle.dwellSeconds<=0){vehicle.status='moving';vehicle.nextStopIndex=(vehicle.currentStopIndex+1)%vehicle.route.length;}
        continue;
      }
      const targetId=vehicle.route[vehicle.nextStopIndex];if(!targetId)continue;
      const target=this.store.entity(targetId)?.position??buildingPosition(this.plan,targetId);if(!target)continue;
      const [x,y,z]=vehicle.position,dx=target[0]-x,dz=target[2]-z,d=Math.hypot(dx,dz);
      if(d<1){vehicle.position=target;vehicle.currentStopIndex=vehicle.nextStopIndex;vehicle.status='dwelling';vehicle.dwellSeconds=12;this.completeTripsAtStop(vehicle,targetId);continue;}
      const amount=Math.min(d,vehicle.speedMetresPerSecond*seconds);vehicle.position=[x+dx/d*amount,y,z+dz/d*amount];
    }
  }

  private completeTripsAtStop(vehicle:TransportVehicleState,stopId:string){
    for(const trip of this.trips.values())if(trip.vehicleId===vehicle.id&&trip.status==='boarded'&&trip.destinationId===stopId){trip.status='completed';vehicle.passengers=vehicle.passengers.filter(id=>id!==trip.personId);vehicle.reservedWheelchairSpaces=vehicle.reservedWheelchairSpaces.filter(id=>id!==trip.personId);this.store.recordEvent('transport.trip.completed',trip.personId,`arrived=${stopId}`);}
  }

  private homeFromBuilding(building:CityBuilding):HomeState{return {id:building.id,residentIds:[...building.residentIds],entryOperational:true,mainsPower:true,backupPower:building.access.charging,chargingAvailable:building.access.charging,quietSpace:building.access.quietSpace};}
}
