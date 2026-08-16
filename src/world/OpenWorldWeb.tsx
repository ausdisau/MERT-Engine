import React, { useEffect, useRef, useState } from 'react';

export function OpenWorldWeb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('Loading world…');
  const [xr, setXr] = useState('Checking WebXR…');

  useEffect(() => {
    let disposed = false;
    let engine: any;
    let scene: any;
    const boot = async () => {
      const B = await import('@babylonjs/core');
      await import('@babylonjs/loaders');
      if (!canvasRef.current || disposed) return;
      engine = new B.Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
      scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.72, 0.86, 0.96, 1);
      scene.collisionsEnabled = true;

      const camera = new B.UniversalCamera('player', new B.Vector3(0, 1.65, -16), scene);
      camera.attachControl(canvasRef.current, true);
      camera.speed = 0.45;
      camera.angularSensibility = 3500;
      camera.applyGravity = true;
      camera.checkCollisions = true;
      camera.ellipsoid = new B.Vector3(0.5, 0.9, 0.5);
      camera.keysUp.push(87); camera.keysDown.push(83); camera.keysLeft.push(65); camera.keysRight.push(68);

      new B.HemisphericLight('sky', new B.Vector3(0, 1, 0), scene).intensity = 0.85;
      const sun = new B.DirectionalLight('sun', new B.Vector3(-0.4, -1, 0.25), scene); sun.intensity = 0.7;

      const ground = B.MeshBuilder.CreateGround('accessible-campus', { width: 220, height: 220, subdivisions: 2 }, scene);
      ground.checkCollisions = true;
      const groundMat = new B.StandardMaterial('groundMat', scene); groundMat.diffuseColor = new B.Color3(0.38, 0.55, 0.35); ground.material = groundMat;

      const pathMat = new B.StandardMaterial('pathMat', scene); pathMat.diffuseColor = new B.Color3(0.62, 0.61, 0.57);
      const path = B.MeshBuilder.CreateGround('wide-accessible-path', { width: 12, height: 190 }, scene); path.position.y = 0.015; path.material = pathMat;

      const buildingMat = new B.StandardMaterial('buildingMat', scene); buildingMat.diffuseColor = new B.Color3(0.72, 0.76, 0.78);
      const glassMat = new B.StandardMaterial('glassMat', scene); glassMat.diffuseColor = new B.Color3(0.25, 0.55, 0.7); glassMat.alpha = 0.72;
      const makeBuilding = (name:string, x:number, z:number, w:number, d:number, h:number) => {
        const body = B.MeshBuilder.CreateBox(name, { width:w, depth:d, height:h }, scene); body.position.set(x,h/2,z); body.material=buildingMat; body.checkCollisions=true;
        const door = B.MeshBuilder.CreateBox(name+'-entry', { width:3.2, depth:0.12, height:2.7 }, scene); door.position.set(x,1.35,z-d/2-0.07); door.material=glassMat;
        return body;
      };
      makeBuilding('Clinical Simulation Centre', -24, 8, 28, 20, 10);
      makeBuilding('Community Hub', 25, 22, 26, 18, 7);
      makeBuilding('Rehabilitation Lab', 24, -28, 24, 18, 8);
      makeBuilding('Accessible Transit Station', -25, -34, 30, 15, 6);

      const treeMat = new B.StandardMaterial('tree', scene); treeMat.diffuseColor = new B.Color3(0.16,0.38,0.17);
      for (let i=0;i<44;i++) { const a=i*2.399, r=42+(i%5)*8; const t=B.MeshBuilder.CreateCylinder('tree-'+i,{height:5,diameterTop:0.5,diameterBottom:2.4,tessellation:7},scene); t.position.set(Math.cos(a)*r,2.5,Math.sin(a)*r); t.material=treeMat; }

      const personMat = new B.StandardMaterial('people', scene); personMat.diffuseColor = new B.Color3(0.22,0.32,0.55);
      for (let i=0;i<12;i++) { const p=B.MeshBuilder.CreateCapsule('community-member-'+i,{height:1.7,radius:0.32},scene); p.position.set(-5+(i%4)*4,0.85,4+Math.floor(i/4)*5); p.material=personMat; }
      const chair = B.MeshBuilder.CreateBox('powered-wheelchair-user',{width:0.8,height:0.9,depth:1.05},scene); chair.position.set(5,0.48,9); chair.material=personMat;

      try {
        const helper = await scene.createDefaultXRExperienceAsync({ floorMeshes: [ground, path], disableTeleportation: false });
        setXr(helper.baseExperience ? 'VR READY · use headset Enter VR control' : 'VR unavailable');
      } catch { setXr('WebXR not available on this browser/device'); }

      setStatus('WORLD ONLINE · explore with WASD / mouse');
      engine.runRenderLoop(()=>scene.render());
      const resize=()=>engine.resize(); window.addEventListener('resize',resize);
      (scene as any).__cleanup=()=>window.removeEventListener('resize',resize);
    };
    boot();
    return ()=>{ disposed=true; scene?.__cleanup?.(); scene?.dispose?.(); engine?.dispose?.(); };
  },[]);

  return <div style={{position:'fixed',inset:0,background:'#111'}}>
    <canvas ref={canvasRef} aria-label="Interactive 3D disability-inclusive open world. Use WASD and mouse on desktop, or the Enter VR control on a compatible WebXR headset." style={{width:'100%',height:'100%',touchAction:'none',display:'block'}} />
    <div role="status" style={{position:'absolute',top:16,left:16,maxWidth:420,padding:'12px 14px',borderRadius:12,background:'rgba(8,18,28,.86)',color:'white',fontFamily:'system-ui'}}>
      <strong>MERT · DISABILITY WORLD</strong><br/><span>{status}</span><br/><span>{xr}</span><br/><small>Clinical Simulation Centre · Community Hub · Rehab Lab · Accessible Transit</small>
    </div>
  </div>;
}
