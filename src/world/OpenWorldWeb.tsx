import React, { useEffect, useRef, useState } from 'react';
import { InfrastructureEntity, PersonEntity, PersistentWorldStore, accessAssessment } from './worldModel';
import { WorldRuntime } from './liveWorldLoop';
import { nearbyEntities, createSpatialIntent, evaluateSpatialIntent } from './spatialInteraction';
import { WOLFRAM_ROUTE_MODEL } from './accessibleNavigation';
import { WOLFRAM_OBJECT_MODELS } from './objectInteractions';
import { WOLFRAM_SOCIAL_MODEL } from './socialEncounters';
import { WOLFRAM_CONTINUITY_MODEL } from './continuity';

export function OpenWorldWeb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storeRef = useRef<PersistentWorldStore>();
  const runtimeRef = useRef<WorldRuntime>();
  if (!storeRef.current) storeRef.current = new PersistentWorldStore();

  const [status,setStatus]=useState('Loading world…');
  const [xr,setXr]=useState('Checking WebXR…');
  const [access,setAccess]=useState('ACCESS NETWORK ONLINE');
  const [life,setLife]=useState('DAILY LIFE ENGINE STARTING');
  const [clinical,setClinical]=useState('CLINICAL BRIDGE · STANDBY');
  const [nearby,setNearby]=useState('NEARBY · scanning');
  const [route,setRoute]=useState('ROUTE ENGINE · calculating');
  const [objects,setObjects]=useState('OBJECT ENGINE · online');
  const [encounters,setEncounters]=useState('SOCIAL ENCOUNTERS · scanning');
  const [continuity,setContinuity]=useState('CONTINUITY · community');

  useEffect(()=>{
    let disposed=false,engine:any,scene:any,routeMesh:any;
    const store=storeRef.current!;
    const runtime=new WorldRuntime(store);
    runtimeRef.current=runtime;

    const boot=async()=>{
      const B=await import('@babylonjs/core');
      await import('@babylonjs/loaders');
      if(!canvasRef.current||disposed)return;

      engine=new B.Engine(canvasRef.current,true,{preserveDrawingBuffer:true,stencil:true});
      scene=new B.Scene(engine);
      scene.clearColor=new B.Color4(.72,.86,.96,1);
      scene.collisionsEnabled=true;

      const camera=new B.UniversalCamera('player',new B.Vector3(0,1.65,-16),scene);
      camera.attachControl(canvasRef.current,true);
      camera.speed=.45;camera.angularSensibility=3500;camera.applyGravity=true;camera.checkCollisions=true;
      camera.ellipsoid=new B.Vector3(.5,.9,.5);
      camera.keysUp.push(87);camera.keysDown.push(83);camera.keysLeft.push(65);camera.keysRight.push(68);

      new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene).intensity=.85;
      new B.DirectionalLight('sun',new B.Vector3(-.4,-1,.25),scene).intensity=.7;
      const material=(n:string,r:number,g:number,b:number)=>{const m=new B.StandardMaterial(n,scene);m.diffuseColor=new B.Color3(r,g,b);return m;};
      const ground=B.MeshBuilder.CreateGround('accessible-campus',{width:220,height:220},scene);ground.checkCollisions=true;ground.material=material('ground',.38,.55,.35);
      const path=B.MeshBuilder.CreateGround('wide-accessible-path',{width:12,height:190},scene);path.position.y=.015;path.material=material('path',.62,.61,.57);

      const buildingMat=material('building',.72,.76,.78),glass=material('glass',.25,.55,.7);glass.alpha=.72;
      const doorMeshes=new Map<string,{mesh:any,closedX:number}>();
      const makeBuilding=(id:string,label:string,x:number,z:number,w:number,d:number,h:number)=>{
        const body=B.MeshBuilder.CreateBox(label,{width:w,depth:d,height:h},scene);body.position.set(x,h/2,z);body.material=buildingMat;body.checkCollisions=true;
        const door=B.MeshBuilder.CreateBox(id,{width:3.2,depth:.12,height:2.7},scene);door.position.set(x,1.35,z-d/2-.07);door.material=glass;doorMeshes.set(id,{mesh:door,closedX:x});
      };
      makeBuilding('clinical-door','Clinical Simulation Centre',-24,8,28,20,10);
      makeBuilding('community-door','Community Hub',25,22,26,18,7);
      makeBuilding('rehab-door','Rehabilitation Lab',24,-28,24,18,8);
      makeBuilding('transit-door','Accessible Transit Station',-25,-34,30,15,6);

      const personMat=material('people',.22,.32,.55),accessMat=material('access',.16,.48,.5),unavailableMat=material('unavailable',.48,.2,.2),meshes=new Map<string,any>();
      const createEntityMesh=(entity:any)=>{
        if(meshes.has(entity.id))return;
        if(entity.kind==='person'){
          const p=entity as PersonEntity,body=B.MeshBuilder.CreateCapsule(entity.id,{height:1.35,radius:.3},scene);body.position.set(p.position[0],1.05,p.position[2]);body.material=personMat;meshes.set(entity.id,body);
          if(p.mobility.mode.includes('wheelchair')){const chair=B.MeshBuilder.CreateBox(entity.id+'-mobility',{width:.85,height:.55,depth:1.05},scene);chair.position.set(p.position[0],.38,p.position[2]);chair.material=personMat;meshes.set(entity.id+'-mobility',chair);}
        }else if(entity.kind==='infrastructure'){
          const i=entity as InfrastructureEntity,marker=B.MeshBuilder.CreateCylinder(entity.id,{height:1.5,diameter:.65},scene);marker.position.set(i.position[0],.75,i.position[2]);marker.material=i.operational?accessMat:unavailableMat;meshes.set(i.id,marker);
        }
      };
      for(const entity of store.snapshot().entities)createEntityMesh(entity);

      const liftCabin=B.MeshBuilder.CreateBox('station-lift-cabin',{width:2.4,height:2.6,depth:2.4},scene);liftCabin.position.set(-20,1.3,-34);liftCabin.material=glass;
      const charger=B.MeshBuilder.CreateCylinder('aac-charge-visual',{height:1.2,diameter:1.2},scene);charger.position.set(20,.6,20);charger.material=accessMat;
      const shuttle=B.MeshBuilder.CreateBox('community-shuttle',{width:3,height:2.8,depth:7},scene);shuttle.position.set(-30,1.4,-39);shuttle.material=buildingMat;

      for(let i=0;i<28;i++){const a=i*2.399,r=46+(i%4)*9,t=B.MeshBuilder.CreateCylinder('tree-'+i,{height:5,diameterTop:.5,diameterBottom:2.4,tessellation:7},scene);t.position.set(Math.cos(a)*r,2.5,Math.sin(a)*r);t.material=material('tree-'+i,.16,.38,.17);}

      let last=performance.now(),uiLast=0,lastRouteKey='';
      scene.onBeforeRenderObservable.add(()=>{
        const now=performance.now(),elapsed=Math.max(0,(now-last)/1000);last=now;
        const frame=runtime.step(elapsed),snapshot=store.snapshot();

        for(const entity of snapshot.entities){
          createEntityMesh(entity);
          const mesh=meshes.get(entity.id);if(mesh){mesh.position.x=entity.position[0];mesh.position.z=entity.position[2];if(entity.kind==='infrastructure')mesh.material=(entity as InfrastructureEntity).operational?accessMat:unavailableMat;}
          const mobility=meshes.get(entity.id+'-mobility');if(mobility){mobility.position.x=entity.position[0];mobility.position.z=entity.position[2];}
        }

        for(const door of frame.objects.doors){const record=doorMeshes.get(door.id);if(record)record.mesh.position.x=record.closedX+door.progress*2.7;}
        liftCabin.position.y=1.3+frame.objects.lift.positionMetres;
        const mayaCharge=frame.objects.chargers.find(session=>session.personId==='maya');if(mayaCharge)charger.scaling.y=.5+mayaCharge.currentPercent/100;
        shuttle.position.y=frame.objects.transport.passengers.includes('maya')?1.55:1.4;

        const mayaRoute=frame.routes.maya;
        const routeKey=mayaRoute?.nodeIds.join('>')??'';
        if(routeKey!==lastRouteKey){lastRouteKey=routeKey;routeMesh?.dispose?.();if(mayaRoute&&mayaRoute.points.length>1){routeMesh=B.MeshBuilder.CreateLines('maya-accessible-route',{points:mayaRoute.points.map(p=>new B.Vector3(p[0],.08,p[2]))},scene);}}

        if(now-uiLast>1000){
          uiLast=now;
          const maya=store.entity('maya') as PersonEntity|undefined,lift=store.entity('station-lift') as InfrastructureEntity|undefined;
          if(maya&&lift){const a=accessAssessment(maya,lift);setAccess(`TRANSIT ACCESS: ${a.pass?'AVAILABLE':'BARRIER'} · ${a.cause}`);const close=nearbyEntities(snapshot,'maya',6);setNearby(`NEARBY MAYA · ${close.length?close.map(x=>x.entity.label).join(' · '):'none within 6m'}`);}
          const activity=frame.activities.find(x=>x.personId==='maya');setLife(activity?`MAYA · ${activity.kind.toUpperCase()} · ${activity.rationale}`:'MAYA · NO ACTIVE PLAN');
          const bridge=frame.clinical.find(x=>x.personId==='maya');setClinical(`CLINICAL BRIDGE · ${(bridge?.status??'continue-world').toUpperCase().replace(/-/g,' ')}`);
          setRoute(mayaRoute?`ACCESSIBLE ROUTE · ${mayaRoute.nodeIds.join(' → ')} · cost ${mayaRoute.cost.toFixed(1)} · alternatives computed`:'ACCESSIBLE ROUTE · no viable route represented');
          const doorSummary=frame.objects.doors.map(d=>`${d.id}:${d.phase}`).join(' · ');setObjects(`OBJECTS · ${doorSummary} · lift ${frame.objects.lift.phase}@${frame.objects.lift.positionMetres.toFixed(1)}m · shuttle ${frame.objects.transport.passengers.length}/${frame.objects.transport.capacity}`);
          setEncounters(frame.encounters.length?`ENCOUNTERS · ${frame.encounters.map(e=>`${e.a}↔${e.b} ${e.status} ${e.score.toFixed(2)}${e.supportRequested?' support-requested':''}`).join(' · ')}`:'ENCOUNTERS · none above threshold');
          setContinuity(`CONTINUITY · ${frame.continuity.maya??'community'}`);
        }
      });

      try{const helper=await scene.createDefaultXRExperienceAsync({floorMeshes:[ground,path],disableTeleportation:false});setXr(helper.baseExperience?'VR READY · controller, gaze and teleport supported':'VR unavailable');}catch{setXr('WebXR not available on this browser/device');}
      setStatus('WOLFRAM-GROUNDED OPEN WORLD ONLINE');
      engine.runRenderLoop(()=>scene.render());
      const resize=()=>engine.resize();window.addEventListener('resize',resize);(scene as any).__cleanup=()=>window.removeEventListener('resize',resize);
    };
    boot();
    return()=>{disposed=true;scene?.__cleanup?.();routeMesh?.dispose?.();scene?.dispose?.();engine?.dispose?.();};
  },[]);

  const runtime=()=>runtimeRef.current!;
  const toggleLift=()=>{const s=storeRef.current!,lift=s.entity('station-lift') as InfrastructureEntity;s.setInfrastructure('station-lift',!lift.operational);};
  const toggleAAC=()=>{const s=storeRef.current!,maya=s.entity('maya') as PersonEntity;s.setCommunicationAccess('maya',maya.communication.access==='available'?'degraded':'available');};
  const interactNearest=()=>{const s=storeRef.current!,state=s.snapshot(),target=nearbyEntities(state,'maya',8)[0];if(!target){setStatus('INTERACTION · no nearby target');return;}const intent=createSpatialIntent('maya',target.entity.id,target.entity.kind==='person'?'communicate':'use','touch'),result=evaluateSpatialIntent(state,intent);s.recordEvent('world.intent','maya',`${intent.action} ${target.entity.label}: ${result.reason}`);setStatus(`INTERACTION · ${target.entity.label} · ${result.allowed?'AVAILABLE':'BLOCKED'} · ${result.reason}`);};
  const openDoor=()=>runtime().objectEngine().requestDoor('community-door','maya');
  const moveLift=()=>{const lift=runtime().objectEngine().snapshot().lift;runtime().objectEngine().requestLift(lift.currentLevel===0?1:0,'maya');};
  const chargeAAC=()=>runtime().objectEngine().startCharging('maya',30);
  const boardTransport=()=>{const result=runtime().objectEngine().boardTransport('maya');setStatus(`TRANSPORT · ${result.reason}`);};
  const requestSupport=()=>{runtime().requestSupport('maya','liam');setStatus('SUPPORT · Maya explicitly requested support from Liam');};
  const beginContinuity=()=>{runtime().beginContinuity('maya');setStatus('CONTINUITY · educational community deterioration episode started');};
  const advanceContinuity=()=>{runtime().advanceContinuity('maya');setStatus(`CONTINUITY · ${runtime().continuity().summary('maya')}`);};
  const resetWorld=()=>{storeRef.current!.reset();setStatus('WORLD RESET · reload to reseed population');};

  return <div style={{position:'fixed',inset:0,background:'#111'}}>
    <canvas ref={canvasRef} aria-label="Interactive multi-person disability-inclusive open world with accessible route planning, working doors, lift, charging, transport, social encounters and clinical continuity. Desktop uses WASD and mouse; compatible WebXR headsets can enter VR." style={{width:'100%',height:'100%',touchAction:'none',display:'block'}}/>
    <div role="status" aria-live="polite" style={{position:'absolute',top:16,left:16,maxWidth:760,maxHeight:'72vh',overflow:'auto',padding:'12px 14px',borderRadius:12,background:'rgba(8,18,28,.92)',color:'white',fontFamily:'system-ui'}}>
      <strong>MERT · WOLFRAM OPEN WORLD · STEPS 21–24</strong><br/>
      <span>{status}</span><br/><span>{xr}</span><br/><span>{access}</span><br/><span>{life}</span><br/><span>{route}</span><br/><span>{objects}</span><br/><span>{nearby}</span><br/><span>{encounters}</span><br/><span>{clinical}</span><br/><span>{continuity}</span>
      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
        <button onClick={interactNearest} style={{padding:10}}>Interact with nearest</button>
        <button onClick={openDoor} style={{padding:10}}>Open Community door</button>
        <button onClick={moveLift} style={{padding:10}}>Move station lift</button>
        <button onClick={chargeAAC} style={{padding:10}}>Charge Maya AAC</button>
        <button onClick={boardTransport} style={{padding:10}}>Board shuttle</button>
        <button onClick={requestSupport} style={{padding:10}}>Request Liam support</button>
        <button onClick={beginContinuity} style={{padding:10}}>Start continuity episode</button>
        <button onClick={advanceContinuity} style={{padding:10}}>Advance care journey</button>
        <button onClick={toggleLift} style={{padding:10}}>Toggle lift availability</button>
        <button onClick={toggleAAC} style={{padding:10}}>Toggle Maya AAC</button>
        <button onClick={resetWorld} style={{padding:10}}>Reset world</button>
      </div>
    </div>
    <div style={{position:'absolute',right:16,bottom:16,maxWidth:470,padding:12,borderRadius:12,background:'rgba(8,18,28,.88)',color:'white',fontFamily:'system-ui',fontSize:13}}>
      <strong>Wolfram computation layer</strong><br/>
      Route cost: {WOLFRAM_ROUTE_MODEL.formula}. Lift: {WOLFRAM_OBJECT_MODELS.liftSmoothstep}. Charger: {WOLFRAM_OBJECT_MODELS.charger}. Social encounters: {WOLFRAM_SOCIAL_MODEL.formula}. Continuity graph verified acyclic with {WOLFRAM_CONTINUITY_MODEL.unexpectedDeadEnds} unexpected dead ends. Simulation parameters are educational model values, not accessibility-code or clinical-treatment thresholds.
    </div>
  </div>;
}
