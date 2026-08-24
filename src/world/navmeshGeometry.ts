import type { AccessModality, PersonEntity, PersistentWorldState, Vec3 } from './worldModel';
import type { ProceduralCityPlan } from './proceduralCity';

export interface NavTriangle {
  id: string;
  vertices: readonly [Vec3,Vec3,Vec3];
  centroid: Vec3;
  neighbours: string[];
  gradient: number;
  surfacePenalty: number;
  access: AccessModality[];
}

export interface CityNavMesh {
  cellSize: number;
  triangles: NavTriangle[];
  bounds: ProceduralCityPlan['bounds'];
}

export interface NavMeshPath {
  triangleIds: string[];
  points: Vec3[];
  cost: number;
}

function pointSegmentDistance(x:number,z:number,a:Vec3,b:Vec3) {
  const dx=b[0]-a[0],dz=b[2]-a[2];
  const len2=dx*dx+dz*dz;
  if(len2===0)return Math.hypot(x-a[0],z-a[2]);
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/len2));
  return Math.hypot(x-(a[0]+dx*t),z-(a[2]+dz*t));
}

function insideBuilding(x:number,z:number,plan:ProceduralCityPlan) {
  return plan.buildings.some(building=>Math.abs(x-building.position[0])<building.width/2+2&&Math.abs(z-building.position[2])<building.depth/2+2);
}

function roadAt(x:number,z:number,plan:ProceduralCityPlan) {
  return plan.roads
    .map(road=>({road,d:pointSegmentDistance(x,z,road.from,road.to)}))
    .filter(item=>item.d<=item.road.walkableWidth/2)
    .sort((a,b)=>a.d-b.d)[0]?.road;
}

const vertexKey=(v:Vec3)=>`${v[0].toFixed(3)},${v[2].toFixed(3)}`;
const edgeKeys=(triangle:NavTriangle)=>{
  const [a,b,c]=triangle.vertices;
  return [[a,b],[b,c],[c,a]].map(pair=>pair.map(vertexKey).sort().join('|'));
};

export function buildCityNavMesh(plan:ProceduralCityPlan,cellSize=8):CityNavMesh {
  const triangles:NavTriangle[]=[];
  let index=0;
  for(let x=plan.bounds.minX;x<plan.bounds.maxX;x+=cellSize){
    for(let z=plan.bounds.minZ;z<plan.bounds.maxZ;z+=cellSize){
      const cx=x+cellSize/2,cz=z+cellSize/2;
      const road=roadAt(cx,cz,plan);
      const plaza=Math.abs(cx)<38&&Math.abs(cz)<38;
      if((!road&&!plaza)||insideBuilding(cx,cz,plan))continue;
      const gradient=road?.gradient??0;
      const surfacePenalty=road?.surfacePenalty??0;
      const access:AccessModality[]=['walk','powered-wheelchair','manual-wheelchair'];
      const v00:[number,number,number]=[x,0,z],v10:[number,number,number]=[x+cellSize,0,z],v11:[number,number,number]=[x+cellSize,0,z+cellSize],v01:[number,number,number]=[x,0,z+cellSize];
      const mk=(vertices:readonly [Vec3,Vec3,Vec3]):NavTriangle=>({
        id:`nav-${index++}`,vertices,
        centroid:[(vertices[0][0]+vertices[1][0]+vertices[2][0])/3,0,(vertices[0][2]+vertices[1][2]+vertices[2][2])/3],
        neighbours:[],gradient,surfacePenalty,access,
      });
      triangles.push(mk([v00,v10,v11]),mk([v00,v11,v01]));
    }
  }

  const edges=new Map<string,string[]>();
  for(const triangle of triangles)for(const key of edgeKeys(triangle))edges.set(key,[...(edges.get(key)??[]),triangle.id]);
  const byId=new Map(triangles.map(t=>[t.id,t]));
  for(const ids of edges.values())if(ids.length===2){const a=byId.get(ids[0]!),b=byId.get(ids[1]!);if(a&&b){a.neighbours.push(b.id);b.neighbours.push(a.id);}}

  // Stitch adjacent cells around road intersections where triangulation may meet only at a vertex.
  for(const triangle of triangles){
    for(const other of triangles){
      if(triangle.id===other.id||triangle.neighbours.includes(other.id))continue;
      const d=Math.hypot(triangle.centroid[0]-other.centroid[0],triangle.centroid[2]-other.centroid[2]);
      if(d<=cellSize*.82)triangle.neighbours.push(other.id);
    }
  }
  return {cellSize,triangles,bounds:plan.bounds};
}

function nearestTriangle(mesh:CityNavMesh,point:Vec3,person:PersonEntity){
  return mesh.triangles
    .filter(t=>t.access.includes(person.mobility.mode))
    .sort((a,b)=>Math.hypot(a.centroid[0]-point[0],a.centroid[2]-point[2])-Math.hypot(b.centroid[0]-point[0],b.centroid[2]-point[2]))[0];
}

function triangleCost(a:NavTriangle,b:NavTriangle,person:PersonEntity){
  const maxGradient=person.mobility.mode==='manual-wheelchair'?.07:person.mobility.mode==='powered-wheelchair'?.09:.16;
  if(Math.abs(b.gradient)>maxGradient||!b.access.includes(person.mobility.mode))return Infinity;
  const distance=Math.hypot(a.centroid[0]-b.centroid[0],a.centroid[2]-b.centroid[2]);
  return distance*(1+4*Math.abs(b.gradient)+b.surfacePenalty);
}

export function findNavMeshPath(mesh:CityNavMesh,state:PersistentWorldState,person:PersonEntity,start:Vec3,end:Vec3):NavMeshPath|undefined {
  void state; // reserved for dynamic triangle blockers and future crowd/closure costs.
  const startTri=nearestTriangle(mesh,start,person),goalTri=nearestTriangle(mesh,end,person);
  if(!startTri||!goalTri)return undefined;
  const byId=new Map(mesh.triangles.map(t=>[t.id,t]));
  const open=new Set<string>([startTri.id]);
  const came=new Map<string,string>();
  const g=new Map<string,number>([[startTri.id,0]]);
  const f=new Map<string,number>([[startTri.id,Math.hypot(startTri.centroid[0]-goalTri.centroid[0],startTri.centroid[2]-goalTri.centroid[2])]]);

  while(open.size){
    const current=[...open].sort((a,b)=>(f.get(a)??Infinity)-(f.get(b)??Infinity))[0];
    if(!current)break;
    if(current===goalTri.id){
      const ids=[current];let cursor=current;
      while(came.has(cursor)){cursor=came.get(cursor)!;ids.unshift(cursor);}
      const points:Vec3[]=[start,...ids.slice(1,-1).map(id=>byId.get(id)!.centroid),end];
      return {triangleIds:ids,points,cost:g.get(current)??0};
    }
    open.delete(current);
    const tri=byId.get(current);if(!tri)continue;
    for(const neighbourId of tri.neighbours){
      const neighbour=byId.get(neighbourId);if(!neighbour)continue;
      const edge=triangleCost(tri,neighbour,person);if(!Number.isFinite(edge))continue;
      const tentative=(g.get(current)??Infinity)+edge;
      if(tentative<(g.get(neighbourId)??Infinity)){
        came.set(neighbourId,current);g.set(neighbourId,tentative);
        const h=Math.hypot(neighbour.centroid[0]-goalTri.centroid[0],neighbour.centroid[2]-goalTri.centroid[2]);
        f.set(neighbourId,tentative+h);open.add(neighbourId);
      }
    }
  }
  return undefined;
}
