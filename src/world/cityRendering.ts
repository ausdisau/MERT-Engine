import type { LiveWorldFrame, WorldRuntime } from './liveWorldLoop';

export interface CityVisualController {
  update(frame:LiveWorldFrame):void;
  toggleNavMesh():boolean;
  dispose():void;
}

export function createCityVisuals(B:any,scene:any,runtime:WorldRuntime,material:(name:string,r:number,g:number,b:number)=>any):CityVisualController {
  const plan=runtime.cityPlan(),navMesh=runtime.navMesh();
  const cityMat=material('procedural-city-buildings',.62,.68,.72),homeMat=material('procedural-city-homes',.55,.66,.62),roadMat=material('procedural-city-roads',.22,.25,.27),transportMat=material('city-transport',.22,.48,.66),emsMat=material('city-ems',.72,.76,.8),activeEmsMat=material('city-ems-active',.78,.38,.3);
  const disposable:any[]=[];

  for(const road of plan.roads){
    const dx=road.to[0]-road.from[0],dz=road.to[2]-road.from[2],length=Math.hypot(dx,dz);
    const mesh=B.MeshBuilder.CreateGround(road.id,{width:road.width,height:length},scene);
    mesh.position.set((road.from[0]+road.to[0])/2,.025,(road.from[2]+road.to[2])/2);mesh.rotation.y=Math.atan2(dx,dz);mesh.material=roadMat;disposable.push(mesh);
  }

  for(const building of plan.buildings){
    const mesh=B.MeshBuilder.CreateBox(`city-${building.id}`,{width:building.width,depth:building.depth,height:building.height},scene);
    mesh.position.set(building.position[0],building.height/2,building.position[2]);mesh.material=building.kind==='home'?homeMat:cityMat;mesh.checkCollisions=true;mesh.metadata={worldEntityId:building.id,kind:building.kind};disposable.push(mesh);
  }

  const navVisual=new B.Mesh('city-navmesh',scene);const positions:number[]=[],indices:number[]=[];let cursor=0;
  for(const triangle of navMesh.triangles){for(const v of triangle.vertices)positions.push(v[0],.08,v[2]);indices.push(cursor,cursor+1,cursor+2);cursor+=3;}
  const vertexData=new B.VertexData();vertexData.positions=positions;vertexData.indices=indices;vertexData.applyToMesh(navVisual);
  const navMat=material('city-navmesh-material',.1,.55,.68);navMat.alpha=.18;navMat.wireframe=true;navVisual.material=navMat;navVisual.isVisible=false;navVisual.isPickable=false;disposable.push(navVisual);

  const transportMesh=B.MeshBuilder.CreateBox('city-access-shuttle-visual',{width:3.2,height:2.8,depth:7.2},scene);transportMesh.material=transportMat;disposable.push(transportMesh);
  const unitMeshes=new Map<string,any>();
  for(const unit of runtime.emergencyEngine().snapshot().units){const mesh=B.MeshBuilder.CreateBox(`${unit.id}-visual`,{width:2.6,height:2.5,depth:5.5},scene);mesh.position.set(unit.position[0],1.25,unit.position[2]);mesh.material=emsMat;unitMeshes.set(unit.id,mesh);disposable.push(mesh);}

  return {
    update(frame){
      const vehicle=frame.services.vehicles.find(item=>item.id==='city-access-shuttle');if(vehicle)transportMesh.position.set(vehicle.position[0],1.4,vehicle.position[2]);
      for(const unit of frame.emergency.units){const mesh=unitMeshes.get(unit.id);if(mesh){mesh.position.set(unit.position[0],1.25,unit.position[2]);mesh.material=unit.status==='available'?emsMat:activeEmsMat;}}
    },
    toggleNavMesh(){navVisual.isVisible=!navVisual.isVisible;return navVisual.isVisible;},
    dispose(){for(const item of disposable)item.dispose?.();},
  };
}
