import React, { useEffect, useRef, useState } from 'react';
import { InfrastructureEntity, PersonEntity, PersistentWorldStore, accessAssessment } from './worldModel';

export function OpenWorldWeb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storeRef = useRef<PersistentWorldStore>();
  if (!storeRef.current) storeRef.current = new PersistentWorldStore();
  const [status, setStatus] = useState('Loading world…');
  const [xr, setXr] = useState('Checking WebXR…');
  const [access, setAccess] = useState('ACCESS NETWORK ONLINE');

  useEffect(() => {
    let disposed = false; let engine: any; let scene: any;
    const store = storeRef.current!;
    const boot = async () => {
      const B = await import('@babylonjs/core'); await import('@babylonjs/loaders');
      if (!canvasRef.current || disposed) return;
      engine = new B.Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
      scene = new B.Scene(engine); scene.clearColor = new B.Color4(0.72, 0.86, 0.96, 1); scene.collisionsEnabled = true;
      const camera = new B.UniversalCamera('player', new B.Vector3(0, 1.65, -16), scene); camera.attachControl(canvasRef.current, true); camera.speed=.45; camera.angularSensibility=3500; camera.applyGravity=true; camera.checkCollisions=true; camera.ellipsoid=new B.Vector3(.5,.9,.5); camera.keysUp.push(87); camera.keysDown.push(83); camera.keysLeft.push(65); camera.keysRight.push(68);
      new B.HemisphericLight('sky', new B.Vector3(0,1,0), scene).intensity=.85; new B.DirectionalLight('sun', new B.Vector3(-.4,-1,.25), scene).intensity=.7;
      const material=(name:string,r:number,g:number,b:number)=>{const m=new B.StandardMaterial(name,scene);m.diffuseColor=new B.Color3(r,g,b);return m;};
      const ground=B.MeshBuilder.CreateGround('accessible-campus',{width:220,height:220},scene); ground.checkCollisions=true; ground.material=material('ground',.38,.55,.35);
      const path=B.MeshBuilder.CreateGround('wide-accessible-path',{width:12,height:190},scene); path.position.y=.015; path.material=material('path',.62,.61,.57);
      const buildingMat=material('building',.72,.76,.78); const glass=material('glass',.25,.55,.7); glass.alpha=.72;
      const makeBuilding=(name:string,x:number,z:number,w:number,d:number,h:number)=>{const body=B.MeshBuilder.CreateBox(name,{width:w,depth:d,height:h},scene);body.position.set(x,h/2,z);body.material=buildingMat;body.checkCollisions=true;const door=B.MeshBuilder.CreateBox(name+'-automatic-entry',{width:3.2,depth:.12,height:2.7},scene);door.position.set(x,1.35,z-d/2-.07);door.material=glass;return body;};
      makeBuilding('Clinical Simulation Centre',-24,8,28,20,10); makeBuilding('Community Hub',25,22,26,18,7); makeBuilding('Rehabilitation Lab',24,-28,24,18,8); makeBuilding('Accessible Transit Station',-25,-34,30,15,6);

      const personMat=material('people',.22,.32,.55); const accessMat=material('access',.16,.48,.5); const unavailableMat=material('unavailable',.48,.2,.2);
      const meshes=new Map<string,any>();
      for (const entity of store.snapshot().entities) {
        if (entity.kind==='person') {
          const p=entity as PersonEntity;
          const body=B.MeshBuilder.CreateCapsule(entity.id,{height:1.35,radius:.3},scene); body.position.set(p.position[0],1.05,p.position[2]); body.material=personMat; meshes.set(entity.id,body);
          if(p.mobility.mode.includes('wheelchair')) { const chair=B.MeshBuilder.CreateBox(entity.id+'-mobility',{width:.85,height:.55,depth:1.05},scene); chair.position.set(p.position[0],.38,p.position[2]); chair.material=personMat; }
        }
        if(entity.kind==='infrastructure') {
          const i=entity as InfrastructureEntity; const marker=B.MeshBuilder.CreateCylinder(entity.id,{height:1.5,diameter:.65},scene); marker.position.set(i.position[0],.75,i.position[2]); marker.material=i.operational?accessMat:unavailableMat; meshes.set(i.id,marker);
        }
      }
      for(let i=0;i<28;i++){const a=i*2.399,r=46+(i%4)*9,t=B.MeshBuilder.CreateCylinder('tree-'+i,{height:5,diameterTop:.5,diameterBottom:2.4,tessellation:7},scene);t.position.set(Math.cos(a)*r,2.5,Math.sin(a)*r);t.material=material('tree-'+i,.16,.38,.17);}

      let last=performance.now();
      scene.onBeforeRenderObservable.add(()=>{const now=performance.now(); if(now-last>1000){store.tick((now-last)/1000);last=now;} const maya=store.entity('maya') as PersonEntity|undefined; const lift=store.entity('station-lift') as InfrastructureEntity|undefined; if(maya&&lift){const assessment=accessAssessment(maya,lift);setAccess(`TRANSIT ACCESS: ${assessment.pass?'AVAILABLE':'BARRIER'} · ${assessment.cause}`);}});
      try { const helper=await scene.createDefaultXRExperienceAsync({floorMeshes:[ground,path],disableTeleportation:false}); setXr(helper.baseExperience?'VR READY · use headset Enter VR control':'VR unavailable'); } catch { setXr('WebXR not available on this browser/device'); }
      setStatus('PERSISTENT WORLD ONLINE · WASD / mouse / WebXR'); engine.runRenderLoop(()=>scene.render()); const resize=()=>engine.resize();window.addEventListener('resize',resize);(scene as any).__cleanup=()=>window.removeEventListener('resize',resize);
    };
    boot(); return()=>{disposed=true;scene?.__cleanup?.();scene?.dispose?.();engine?.dispose?.();};
  },[]);

  const toggleLift=()=>{const store=storeRef.current!;const lift=store.entity('station-lift') as InfrastructureEntity;store.setInfrastructure('station-lift',!lift.operational);};
  const toggleAAC=()=>{const store=storeRef.current!;const maya=store.entity('maya') as PersonEntity;store.setCommunicationAccess('maya',maya.communication.access==='available'?'degraded':'available');setStatus(`MAYA AAC ACCESS · ${store.entity('maya') && (store.entity('maya') as PersonEntity).communication.access.toUpperCase()}`);};

  return <div style={{position:'fixed',inset:0,background:'#111'}}>
    <canvas ref={canvasRef} aria-label="Interactive persistent disability-inclusive 3D open world. Desktop uses WASD and mouse; compatible WebXR headsets can enter VR." style={{width:'100%',height:'100%',touchAction:'none',display:'block'}} />
    <div role="status" aria-live="polite" style={{position:'absolute',top:16,left:16,maxWidth:480,padding:'12px 14px',borderRadius:12,background:'rgba(8,18,28,.9)',color:'white',fontFamily:'system-ui'}}><strong>MERT · PERSISTENT DISABILITY WORLD</strong><br/><span>{status}</span><br/><span>{xr}</span><br/><span>{access}</span><br/><small>Clinical Centre · Community · Rehab · Accessible Transit</small><div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><button onClick={toggleLift} style={{padding:10}}>Toggle station lift</button><button onClick={toggleAAC} style={{padding:10}}>Toggle Maya AAC access</button></div></div>
    <div style={{position:'absolute',right:16,bottom:16,maxWidth:360,padding:12,borderRadius:12,background:'rgba(8,18,28,.86)',color:'white',fontFamily:'system-ui',fontSize:13}}>Accessibility is causal: infrastructure failure is recorded as an environmental barrier; AAC access changes observability, not Maya's authority or cognition. State persists locally between sessions.</div>
  </div>;
}
