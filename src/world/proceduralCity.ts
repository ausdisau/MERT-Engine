import type { InfrastructureEntity, OpenWorldEntity, PersistentWorldStore, Vec3, WorldEntity } from './worldModel';

export type CityDistrictKind = 'residential' | 'community' | 'health' | 'education' | 'employment' | 'transport';
export type CityBuildingKind = 'home' | 'community' | 'hospital' | 'clinic' | 'education' | 'workplace' | 'retail' | 'emergency-base' | 'transport-hub';

export interface CityDistrict { id:string; label:string; kind:CityDistrictKind; centre:Vec3; radius:number; }
export interface CityRoad { id:string; from:Vec3; to:Vec3; width:number; walkableWidth:number; gradient:number; surfacePenalty:number; }
export interface CityBuilding {
  id:string; label:string; kind:CityBuildingKind; position:Vec3; width:number; depth:number; height:number; districtId:string; residentIds:string[];
  access:{ automaticDoor:boolean; stepFreeEntry:boolean; charging:boolean; quietSpace:boolean; };
}
export interface ProceduralCityPlan { seed:number; bounds:{minX:number;maxX:number;minZ:number;maxZ:number}; districts:CityDistrict[]; roads:CityRoad[]; buildings:CityBuilding[]; }

function rng(seed:number){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function road(id:string,from:Vec3,to:Vec3):CityRoad{return{id,from,to,width:14,walkableWidth:10,gradient:.02,surfacePenalty:.02};}

export function generateProceduralCity(seed=20260824):ProceduralCityPlan{
  const random=rng(seed);
  const districts:CityDistrict[]=[
    {id:'district-west-residential',label:'West Residential',kind:'residential',centre:[-135,0,45],radius:85},
    {id:'district-east-residential',label:'East Residential',kind:'residential',centre:[135,0,45],radius:85},
    {id:'district-community',label:'Community and Civic',kind:'community',centre:[0,0,90],radius:90},
    {id:'district-health',label:'Health and Emergency',kind:'health',centre:[135,0,-135],radius:90},
    {id:'district-learning',label:'Learning and Work',kind:'education',centre:[-90,0,-135],radius:100},
    {id:'district-transport',label:'Transport Exchange',kind:'transport',centre:[-180,0,-180],radius:70},
  ];
  const roads:CityRoad[]=[];for(const z of[-180,-90,0,90,180])roads.push(road(`road-h-${z}`,[-230,0,z],[230,0,z]));for(const x of[-180,-90,0,90,180])roads.push(road(`road-v-${x}`,[x,0,-230],[x,0,230]));
  const buildings:CityBuilding[]=[
    {id:'home-maya',label:'Maya home',kind:'home',position:[-135,0,45],width:22,depth:20,height:7,districtId:'district-west-residential',residentIds:['maya'],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:true}},
    {id:'home-liam',label:'Liam home',kind:'home',position:[-45,0,45],width:20,depth:18,height:7,districtId:'district-west-residential',residentIds:['liam'],access:{automaticDoor:true,stepFreeEntry:true,charging:false,quietSpace:true}},
    {id:'home-rohan',label:'Rohan home',kind:'home',position:[135,0,45],width:20,depth:18,height:7,districtId:'district-east-residential',residentIds:['rohan'],access:{automaticDoor:false,stepFreeEntry:true,charging:false,quietSpace:true}},
    {id:'home-aisha',label:'Aisha home',kind:'home',position:[135,0,135],width:20,depth:18,height:7,districtId:'district-east-residential',residentIds:['aisha'],access:{automaticDoor:true,stepFreeEntry:true,charging:false,quietSpace:true}},
    {id:'hospital-main',label:'Metropolitan Teaching Hospital',kind:'hospital',position:[135,0,-135],width:58,depth:42,height:18,districtId:'district-health',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:true}},
    {id:'ems-base',label:'Emergency Response Base',kind:'emergency-base',position:[135,0,-45],width:34,depth:28,height:9,districtId:'district-health',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:false}},
    {id:'learning-centre',label:'Inclusive Learning Centre',kind:'education',position:[-135,0,-135],width:42,depth:34,height:11,districtId:'district-learning',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:true}},
    {id:'employment-centre',label:'Employment and Enterprise Centre',kind:'workplace',position:[-45,0,-135],width:42,depth:34,height:11,districtId:'district-learning',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:true}},
    {id:'city-market',label:'Community Market',kind:'retail',position:[45,0,135],width:38,depth:30,height:8,districtId:'district-community',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:false,quietSpace:false}},
    {id:'city-transport-hub',label:'City Mobility Exchange',kind:'transport-hub',position:[-180,0,-180],width:44,depth:34,height:10,districtId:'district-transport',residentIds:[],access:{automaticDoor:true,stepFreeEntry:true,charging:true,quietSpace:true}},
  ];
  const blockCentres:Array<[number,number]>=[[-135,135],[-45,135],[-135,-45],[45,-45],[45,-135]];
  for(let i=0;i<blockCentres.length;i++){const centre=blockCentres[i];if(!centre)continue;const[x,z]=centre,kind:CityBuildingKind=random()>.72?'retail':'home';buildings.push({id:`generated-${i}`,label:kind==='home'?`Accessible residence ${i+1}`:`Neighbourhood service ${i+1}`,kind,position:[x+(random()-.5)*18,0,z+(random()-.5)*18],width:18+random()*8,depth:16+random()*8,height:6+random()*5,districtId:x<0?'district-west-residential':'district-east-residential',residentIds:[],access:{automaticDoor:random()>.2,stepFreeEntry:true,charging:random()>.55,quietSpace:random()>.5}});}
  return{seed,bounds:{minX:-250,maxX:250,minZ:-250,maxZ:250},districts,roads,buildings};
}

function buildingEntity(building:CityBuilding):WorldEntity{const tags=['city-building',building.kind,`district:${building.districtId}`];for(const resident of building.residentIds)tags.push(`resident:${resident}`);return{id:building.id,kind:'place',label:building.label,position:building.position,persistent:true,tags};}
function entranceEntity(building:CityBuilding):InfrastructureEntity{return{id:`${building.id}-entry`,kind:'infrastructure',label:`${building.label} entrance`,position:[building.position[0],0,building.position[2]-building.depth/2-2],persistent:true,tags:['city-entry',building.kind],feature:building.access.automaticDoor?'automatic-door':'ramp',operational:true,accessibility:['walk','powered-wheelchair','manual-wheelchair','touch']};}
export function applyProceduralCity(store:PersistentWorldStore,plan:ProceduralCityPlan){for(const building of plan.buildings){if(!store.entity(building.id))store.upsertEntity(buildingEntity(building) as OpenWorldEntity);const entry=entranceEntity(building);if(!store.entity(entry.id))store.upsertEntity(entry);if(building.access.charging){const charge:InfrastructureEntity={id:`${building.id}-charge`,kind:'infrastructure',label:`${building.label} accessible charging`,position:[building.position[0]+4,0,building.position[2]+4],persistent:true,tags:['city-charge',building.kind],feature:'charging-point',operational:true,accessibility:['powered-wheelchair','manual-wheelchair','touch']};if(!store.entity(charge.id))store.upsertEntity(charge);}}store.recordEvent('city.generated',undefined,`seed=${plan.seed}; districts=${plan.districts.length}; roads=${plan.roads.length}; buildings=${plan.buildings.length}`);}
