import * as THREE from '/vendor/three.module.js';

// Estimate render performance with a small scene. No hardware fingerprinting,
// camera/microphone requests, third-party services or benchmark data upload.
export async function checkBrowser(progress) {
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;left:-10000px;top:0;pointer-events:none';
  canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  let renderer,scene;
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    const width=Math.max(280,Math.min(1500,innerWidth*(innerWidth<760?.94:.72)));
    const height=Math.max(440,Math.min(850,innerHeight-180));
    renderer.setSize(width,height,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x17121b);
    const camera=new THREE.PerspectiveCamera(65,width/height,.1,80);camera.position.set(13,10,18);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xdfc38d,0x192832,2));
    const light=new THREE.DirectionalLight(0xbadce5,2);light.position.set(4,8,3);scene.add(light);
    const point=new THREE.PointLight(0xe5bb7b,8,20);point.position.set(0,3,0);scene.add(point);
    const geometry=new THREE.BoxGeometry(1,1,1),solid=new THREE.MeshStandardMaterial({color:0x5b4653,metalness:.4}),glass=new THREE.MeshStandardMaterial({color:0x64ddd4,transparent:true,opacity:.24,depthWrite:false});
    const group=new THREE.Group();scene.add(group);
    for(let i=0;i<150;i++){const mesh=new THREE.Mesh(geometry,i<36?glass:solid);mesh.position.set(i%15-7,Math.floor(i/45)*1.4,Math.floor(i/15)%3*2-3);mesh.scale.set(.7,1+(i%4)*.25,.7);group.add(mesh);}
    const floor=new THREE.Mesh(new THREE.BoxGeometry(23,.2,17),solid);floor.position.y=-1;group.add(floor);
    const gl=renderer.getContext();
    async function sample(ratio,label){
      progress(`Checking ${label} graphics…`);renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));
      const times=[];let previous=0,warmup=0;
      while(times.length<40 && (times.length<12||times.reduce((a,b)=>a+b,0)<650)){
        const now=await new Promise(requestAnimationFrame);
        if(document.hidden){previous=0;continue;}
        if(gl.isContextLost())throw Error('Graphics context lost during check.');
        group.rotation.y=now*.00015;renderer.render(scene,camera);gl.finish();
        const end=performance.now();
        if(previous && warmup++>=5){const interval=end-previous;if(interval<500)times.push(interval);}
        previous=end;
      }
      const mean=times.reduce((a,b)=>a+b,0)/times.length;return 1000/mean;
    }
    let quality=0,fps=await sample(1,'NORMAL');
    if(fps<40){quality=1;fps=await sample(.65,'LOW');}
    if(fps<28){quality=2;fps=await sample(.45,'MINIMAL');}
    return {supported:true,quality,fps};
  } catch(error) {
    return {supported:false,reason:'This browser could not complete the 3D check. Enable hardware acceleration, update or try another browser, then run the check again. '+(error.message?.includes('context lost')?'The graphics connection was lost.':'')};
  } finally {
    if(scene){const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
    renderer?.dispose();renderer?.forceContextLoss();canvas.remove();
  }
}
