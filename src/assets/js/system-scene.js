// An exploded assembly illustrates interface / API / automation / data.
// Semantic HTML controls and the CSS illustration survive WebGL/import failure.
const stage = document.querySelector('[data-system-stage]');
const host = document.querySelector('[data-system-canvas]');
const buttons = [...document.querySelectorAll('[data-layer]')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const descriptions = [
  'Interfaces people use. React, Next.js, and WordPress.',
  'APIs connect the parts. Node.js, Express, and PHP.',
  'Automation carries the work. n8n and AI integrations.',
  'Data gives it structure. PostgreSQL, MongoDB, and Firebase.'
];
let selected=0, updateScene=()=>{};
buttons.forEach((button,index)=>button.addEventListener('click',()=>{
  selected=index;
  buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  document.querySelector('[data-layer-description]').textContent=descriptions[index];
  updateScene();
}));

async function init(){
  const THREE=await import('/assets/vendor/three/three.module.js');
  if (!stage || !host) return;
  let renderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0x18191b,0);
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(36,1,.1,50);
  camera.position.set(6.2,4.3,7.2); camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xfffae0,0x454647,3));
  const key=new THREE.DirectionalLight(0xfff2bd,4);key.position.set(4,7,3);scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,2);rim.position.set(-5,2,-4);scene.add(rim);
  const assembly=new THREE.Group();scene.add(assembly);
  const layers=[];
  const material=(color,metalness=.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.32});
  const gold=material(0xe2d8a3,.65), dark=material(0x373935,.65), silver=material(0x979a8e,.65);
  const light=new THREE.MeshBasicMaterial({color:0xf1df91});
  const geometries=new Set(), materials=new Set([gold,dark,silver,light]);
  function box(w,h,d,mat,x=0,y=0,z=0,parent=assembly){
    const geometry=new THREE.BoxGeometry(w,h,d);geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  function line(points,parent=assembly,color=0x908d73){
    const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));geometries.add(geometry);
    const mat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.75});materials.add(mat);
    const mesh=new THREE.Line(geometry,mat);parent.add(mesh);return mesh;
  }
  // Thin material plates create readable separation and a precise silhouette.
  for(let i=0;i<4;i++){
    const group=new THREE.Group();assembly.add(group);layers.push(group);
    const plateMat=material(i===0?0x666957:0x363933,.55);materials.add(plateMat);
    group.userData.plate=box(3.15,.13,2.3,plateMat,0,0,0,group);
    const edgeGeo=new THREE.EdgesGeometry(group.userData.plate.geometry);geometries.add(edgeGeo);
    const edgeMat=new THREE.LineBasicMaterial({color:0xc6bf96,transparent:true,opacity:.65});materials.add(edgeMat);
    group.add(new THREE.LineSegments(edgeGeo,edgeMat));
    [-1.35,1.35].forEach(x=>[-.9,.9].forEach(z=>box(.09,.12,.09,gold,x,.1,z,group)));
    // Each plate carries a different structural pattern, not a fake screenshot.
    if(i===0){
      box(2.45,.055,.15,gold,0,.11,-.73,group);
      box(.62,.12,1.13,silver,-.91,.15,.06,group);
      box(1.56,.10,.5,dark,.35,.15,-.26,group);
      box(.73,.10,.45,gold,-.06,.15,.39,group);
      box(.73,.10,.45,silver,.77,.15,.39,group);
    }else if(i===1){
      for(let j=0;j<3;j++){
        box(.52,.2,.52,j===1?gold:silver,-.92+j*.92,.18,0,group);
        if(j<2)line([[-.65+j*.92,.1,0],[-.27+j*.92,.1,0]],group,0xe2d8a3);
      }
      line([[-1.1,.1,-.7],[.1,.1,-.7],[.1,.1,-.25]],group);
      line([[.8,.1,.3],[.8,.1,.7],[-.7,.1,.7]],group);
    }else if(i===2){
      for(let j=0;j<4;j++){
        const x=-1.05+j*.7,z=j%2? .42:-.42;
        const mesh=box(.37,.14,.37,j===2?gold:silver,x,.17,z,group);mesh.rotation.y=Math.PI/4;
        if(j<3)line([[x,.1,z],[x+.35,.1,z],[x+.35,.1,-z],[x+.7,.1,-z]],group,0xe2d8a3);
      }
    }else{
      for(let j=0;j<3;j++){
        const geometry=new THREE.CylinderGeometry(.26,.26,.27,24);geometries.add(geometry);
        for(let k=0;k<2;k++) {const cylinder=new THREE.Mesh(geometry,j===1?gold:silver);cylinder.position.set(-.8+j*.8,.23+k*.3,0);group.add(cylinder);}
      }
    }
  }
  // Vertical guides expose the relationship between layers.
  [-1.5,1.5].forEach(x=>line([[x,-1.6,-1.05],[x,1.7,-1.05]],assembly,0x646754));
  const pulses=[];
  const pulseGeo=new THREE.SphereGeometry(.045,8,8);geometries.add(pulseGeo);
  for(let i=0;i<6;i++){const dot=new THREE.Mesh(pulseGeo,light);assembly.add(dot);pulses.push(dot);}
  let paused=reduced.matches,visible=true,disposed=false,frame=0,last=0,time=0;
  const pointer={x:0,y:0};
  const pause=document.querySelector('[data-motion-toggle]');pause.hidden=false;
  function syncPause(){pause.textContent=reduced.matches?'Reduced motion':paused?'Resume motion':'Pause motion';pause.disabled=reduced.matches;pause.setAttribute('aria-pressed',String(paused));}
  syncPause();
  function draw(now=0){
    frame=0;if(disposed)return;
    if(now-last<32&&!paused&&!reduced.matches){frame=requestAnimationFrame(draw);return;}
    const delta=Math.min((now-last)/1000,.05);last=now;
    if(!paused&&!reduced.matches)time+=delta;
    const rect=stage.getBoundingClientRect();
    const progress=paused||reduced.matches?0:Math.max(0,Math.min(1,-rect.top/Math.max(rect.height,1)));
    assembly.rotation.y=-.22+(paused||reduced.matches?0:Math.sin(time*.22)*.16+pointer.x*.14);
    assembly.rotation.z=paused||reduced.matches?0:pointer.y*.025;
    layers.forEach((layer,i)=>{
      layer.position.y=(1.5-i)*(.78+progress*.32);
      layer.position.x=i===selected?.12:0;
      layer.userData.plate.material.color.setHex(i===selected?0x77765b:0x363933);
    });
    pulses.forEach((dot,i)=>{dot.position.set(i%2?-1.5:1.5,((time*.55+i*.52)%3.2)-1.6,-1.05);});
    renderer.render(scene,camera);
    stage.classList.add('scene-ready');
    if(!paused&&!reduced.matches&&visible&&!document.hidden)frame=requestAnimationFrame(draw);
  }
  function requestDraw(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.position.set(6.2,4.3,7.2);if(w<400)camera.position.multiplyScalar(1.1);camera.updateProjectionMatrix();requestDraw();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)requestDraw();else{cancelAnimationFrame(frame);frame=0;}},{threshold:.01});observer.observe(stage);
  const onPointer=e=>{if(e.pointerType==='touch')return;const r=host.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width-.5;pointer.y=(e.clientY-r.top)/r.height-.5;};
  host.addEventListener('pointermove',onPointer);
  host.addEventListener('pointerleave',()=>{pointer.x=0;pointer.y=0;});
  pause.addEventListener('click',()=>{paused=!paused;syncPause();requestDraw();});
  const onReduced=()=>{paused=reduced.matches;syncPause();requestDraw();};reduced.addEventListener('change',onReduced);
  const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else requestDraw();};document.addEventListener('visibilitychange',onVisibility);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;stage.classList.remove('scene-ready');pause.hidden=true;});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{pause.hidden=false;requestDraw();});
  updateScene=requestDraw;resize();
  window.addEventListener('pagehide',e=>{
    if(e.persisted)return;
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();resizeObserver.disconnect();
    reduced.removeEventListener('change',onReduced);document.removeEventListener('visibilitychange',onVisibility);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();
  },{once:true});
}
init().catch(()=>{ /* The meaningful HTML / CSS illustration remains available. */ });
