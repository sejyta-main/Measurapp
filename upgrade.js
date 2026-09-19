/* Measurapp reliability and live AR upgrade. No remote dependencies. */
(() => {
  const rad = Math.PI / 180;
  // The screen normal's vertical component is cos(beta)*cos(gamma).
  incline = (b,g) => Math.acos(Math.min(1,Math.abs(Math.cos(b*rad)*Math.cos(g*rad))))/rad;
  let samples=[], last=0, raw=0, offsets=[0,0], enabled=false;
  const status=document.createElement('p');
  status.className='formula'; status.textContent='Waiting for sensor data';
  $('#inclinePanel').before(status);
  $('.angle-stage p').textContent='Rest the phone BACK flat on the bench; avoid the camera bump.';
  $('.hero h1').innerHTML='Your pocket.<br><span>Measurement toolkit.</span>';
  $('#angleValue').textContent='—';
  const reset=document.createElement('button'); reset.className='secondary';reset.textContent='Reset calibration';
  $('#calibrateBtn').after(reset);
  reset.onclick=()=>{state.zero=0;offsets=[0,0];samples=[];toast('Absolute angle restored')};
  orientation=e=>{
    if(!Number.isFinite(e.beta)||!Number.isFinite(e.gamma)||state.held)return;
    const now=performance.now();raw=incline(e.beta,e.gamma);
    samples.push({a:raw,t:now});samples=samples.filter(x=>now-x.t<800);
    const sorted=samples.map(x=>x.a).sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    const alpha=last?1-Math.exp(-(now-last)/140):1; last=now;
    state.angle+=(Math.abs(median-state.zero)-state.angle)*alpha;
    state.beta=e.beta-offsets[0];state.gamma=e.gamma-offsets[1];
    state.rawBeta=e.beta;state.rawGamma=e.gamma;
    updateAngle();
    status.textContent=(sorted.length>8&&sorted.at(-1)-sorted[0]<.6?'Steady':'Settling — keep still')+' · '+(state.angle<89.9?(Math.tan(state.angle*rad)*100).toFixed(1)+'% slope':'Vertical')+(state.zero?' · Relative zero':' · Absolute tilt');
    $('#sensorPrompt').hidden=true;
  };
  $('#sensorBtn').onclick=async()=>{
    try{
      if(!window.isSecureContext)throw Error('Open the HTTPS app link to use sensors');
      if(typeof DeviceOrientationEvent==='undefined')throw Error('Orientation sensor unavailable');
      if(DeviceOrientationEvent.requestPermission&&await DeviceOrientationEvent.requestPermission()!=='granted')throw Error('Motion permission denied');
      if(!enabled){addEventListener('deviceorientation',orientation);enabled=true;}
      status.textContent='Waiting for real sensor readings…';
      setTimeout(()=>{if(!last)status.textContent='No sensor data received. Try opening in Chrome and check motion permissions.'},4000);
    }catch(e){status.textContent=e.message;}
  };
  $('#calibrateBtn').onclick=()=>{
    if(!last||performance.now()-last>2000||samples.length<9)return toast('Start sensor and hold still first');
    if(Math.max(...samples.map(x=>x.a))-Math.min(...samples.map(x=>x.a))>.6)return toast('Keep still before calibrating');
    state.zero=raw; offsets=[state.rawBeta,state.rawGamma];state.angle=0;updateAngle();toast('Relative zero set; reset to restore absolute tilt');
  };
  $('#saveAngleBtn').onclick=()=>{
    if(!last||(!state.held&&performance.now()-last>2000))return toast('No current sensor reading');
    saveMeasurement({type:state.zero?'Relative angle':'Surface inclination',value:state.angle.toFixed(1)+'°',icon:'∠'});
  };
  // Prevent reference skipping and reject coincident points.
  canvas.style.maxHeight='none';
  const oldTap=canvas.onpointerdown;
  canvas.onpointerdown=e=>{if(state.points.length===2&&!state.referencePixels)return toast('Confirm the reference first');oldTap(e)};
  const oldConfirm=$('#confirmReference').onclick;
  $('#confirmReference').onclick=()=>{if(state.points.length===2&&distance(...state.points)<20)return toast('Choose a longer reference for accuracy');oldConfirm()};
  $('#photoInput').removeAttribute('capture');
  $('#cameraStart p').textContent='Photo fallback: reference and object must be on the same plane. Photograph straight-on; perspective distorts results.';
  const arCard=document.createElement('div'); arCard.className='permission-card';
  arCard.innerHTML='<div><b>Live AR tape measure</b><p id="arSupport">Checking device support…</p></div><button class="primary" id="startAR" disabled>Start live AR</button>';
  $('#cameraStart').before(arCard);
  const overlay=document.createElement('div');overlay.id='arOverlay';overlay.hidden=true;
  overlay.innerHTML='<div class="arTop"><b>LIVE AR · approximate</b><p id="arHint">Move slowly to find a textured surface</p><output id="arReading">—</output></div><div class="arCross">⊕</div><div class="arBottom"><button id="arPoint" class="primary" disabled>Mark point</button><button id="arUndo" class="secondary">Undo</button><button id="arSave" class="secondary">Save</button><button id="arExit" class="secondary">Exit AR</button><p>Good light • avoid glass • verify critical dimensions with a tape</p></div>';
  document.body.append(overlay);
  overlay.addEventListener('beforexrselect',e=>e.preventDefault());
  let session,hitSource,current,points=[],total=0,hitTime=0;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  const show=v=>v.toFixed(3)+' m / '+(v/0.3048).toFixed(2)+' ft';
  function tally(){total=points.slice(1).reduce((s,p,i)=>s+dist(p,points[i]),0);$('#arReading').textContent=points.length>1?show(total):'Mark the next point';}
  $('#arPoint').onclick=()=>{if(!current||performance.now()-hitTime>250)return;points.push({...current});tally();};
  $('#arUndo').onclick=()=>{points.pop();tally()};
  $('#arSave').onclick=()=>{if(points.length<2)return toast('Mark at least two points');saveMeasurement({type:'AR path estimate',value:show(total),icon:'⌗'})};
  $('#arExit').onclick=()=>session?.end();
  (async()=>{try{const ok=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-ar');$('#startAR').disabled=!ok;$('#arSupport').textContent=ok?'AR available. Scan a surface, then mark endpoints.':'Live AR unavailable in this browser/device. Try Chrome on an AR-capable Android phone; photo fallback remains available.'}catch{$('#arSupport').textContent='Unable to check AR support. Check browser permissions.'}})();
  $('#startAR').onclick=async()=>{
    let gl;
    try{
      session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test','dom-overlay'],domOverlay:{root:overlay}});
      overlay.hidden=false;points=[];current=null;total=0;
      session.addEventListener('end',()=>{hitSource?.cancel();overlay.hidden=true;current=null;session=null;gl?.getExtension('WEBGL_lose_context')?.loseContext()},{once:true});
      const surface=document.createElement('canvas');gl=surface.getContext('webgl',{xrCompatible:true,alpha:true});
      if(!gl)throw Error('WebGL unavailable');
      await gl.makeXRCompatible();session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});
      const space=await session.requestReferenceSpace('local'),viewer=await session.requestReferenceSpace('viewer');
      hitSource=await session.requestHitTestSource({space:viewer});
      space.addEventListener('reset',()=>{points=[];current=null;tally();toast('Tracking reset — measure again')});
      function frame(t,f){
        if(!session)return;session.requestAnimationFrame(frame);
        gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const hit=f.getHitTestResults(hitSource)[0],pose=hit?.getPose(space);current=pose?{x:pose.transform.position.x,y:pose.transform.position.y,z:pose.transform.position.z}:null;
        $('#arPoint').disabled=!current;
        $('.arCross').style.color=current?'#bafc45':'#ffffff';
        $('#arHint').textContent=current?'Surface found · aim the center at an endpoint':'Tracking lost / scanning · move slowly over a textured surface';
        if(current){hitTime=performance.now();if(points.length)$('#arReading').textContent=show(total+dist(points.at(-1),current))+' · live preview';}
      }
      session.requestAnimationFrame(frame);
    }catch(e){await session?.end().catch(()=>{});overlay.hidden=true;$('#arSupport').textContent='AR could not start: '+e.message+'. Photo mode is still available.';}
  };
})();
