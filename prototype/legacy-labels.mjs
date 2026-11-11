// SPDX-License-Identifier: GPL-3.0-or-later
// Add ClassDesk's physical-coordinate group names over the ORIGINAL shaders.
import {DEFAULT_SETTINGS,buildScene,sanitizeSettings,sanitizeGroupNames} from './school-layout.mjs';
import {decodeHostMessage,iconsFromHost} from './school-state.mjs';
import {renderLegacyLabels} from './legacy-groups.mjs';
import {layoutGroupLabels} from './group-labels.mjs';
import {sanitizeGroupCatalog,reconcileGroups,createSceneTransition} from './school-scene-model.mjs';

const query=new URLSearchParams(location.search),preview=query.has('classdeskPreview')||query.has('preview');
const adapter=window.classdeskLegacy,bridge=preview?null:window.chrome?.webview;
if(adapter){
  const theme=location.pathname.endsWith('/flat.html')?'beach':'meadow';
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let settings={...DEFAULT_SETTINGS},lastIcons=null,icons=[],scene={icons:[],groups:[]},hostPaused=false,drawnLabels=[];
  let pendingNames=null,catalog=sanitizeGroupCatalog(null);
  let displayScene=scene,targetSignature=JSON.stringify(scene),transition=null,animation=0;
  let transitionActive=false,transitionProgress=1,transitionStart=0;
  let labels=[],ready=false,publishedSignature='';
  const transitionDuration=260;
  let awaitingHost=!!bridge||(preview&&parent!==window);
  let shaderDirty=true,lastPaused=null,shaderIcons='';
  const overlayKeys=new Set(['groupGap','padding','lineWidth','texture','showLabels','motion','groupNames','groupCatalog','waviness','renderMode','labelSize','roundBoundary']);
  const viewport={width:0,height:0};
  let canvas=null,ctx=null;
  // The settings parent owns its icon/label layers. Never duplicate them in an iframe.
  if(!preview){
    const style=document.createElement('style');
    style.textContent='@font-face{font-family:Pretendard;src:url("assets/fonts/PretendardVariable.woff2") format("woff2");font-weight:100 900;font-display:swap}#classdesk-labels{position:fixed;inset:0;width:100%;height:100%;z-index:10;pointer-events:none}';
    document.head.append(style);
    canvas=document.createElement('canvas');canvas.id='classdesk-labels';canvas.setAttribute('aria-label','모둠 이름');document.body.append(canvas);ctx=canvas.getContext('2d');
  }
  const isPaused=()=>awaitingHost||hostPaused||!settings.motion||reducedMotion.matches||document.hidden;
  const visibleScene=(value=scene)=>lastIcons?.vis===false?{icons:[],groups:[]}:value;
  function sampleDisplay(now){
    if(!transitionActive)return;
    transitionProgress=Math.max(0,Math.min(1,(now-transitionStart)/transitionDuration));
    displayScene=transition.at(1-Math.pow(1-transitionProgress,3));
    if(transitionProgress>=1)transitionActive=false;
  }
  function finishTransition(){
    cancelAnimationFrame(animation);animation=0;
    displayScene=scene;transitionActive=false;transitionProgress=1;
  }
  function drawLabels(){
    drawnLabels=[];
    if(ctx){
      ctx.clearRect(0,0,viewport.width,viewport.height);
      drawnLabels=renderLegacyLabels(ctx,{...viewport,scene:visibleScene(displayScene),settings});
    }
  }
  function publishGroupState(){
    if(!bridge||!ready)return;
    // Clear stale native hit targets during motion; Canvas labels remain visible.
    // Publish the measured target once at rest, never per animation frame.
    const packet=JSON.stringify({t:'groupState',theme,catalog,labels:transitionActive?[]:labels});
    if(packet===publishedSignature)return;
    publishedSignature=packet; // Set BEFORE postMessage: the host may echo synchronously.
    bridge.postMessage(packet);
  }
  function frame(now){
    animation=0;sampleDisplay(now);drawLabels();
    if(transitionActive)animation=requestAnimationFrame(frame);
    else publishGroupState();
  }
  function refresh(animate=true){
    if(lastIcons&&lastIcons.vis!==false){
      const result=reconcileGroups(buildScene(icons,viewport,settings),catalog,pendingNames??settings.groupNames);
      catalog=result.catalog;
      settings.groupNames=sanitizeGroupNames(pendingNames??settings.groupNames,result.scene.groups.map(group=>group.id));
      if(icons.length)pendingNames=null;
      const signature=JSON.stringify(result.scene);
      if(signature!==targetSignature){
        // Interrupt from the visible geometry, not the previous target. Only this
        // transparent Canvas animates; the untouched original shader owns itself.
        const now=performance.now();sampleDisplay(now);cancelAnimationFrame(animation);animation=0;
        transition=createSceneTransition(displayScene,result.scene);
        scene=result.scene;targetSignature=signature;
        transitionActive=transition.changed&&!!animate&&!isPaused()&&!preview&&settings.showLabels;
        transitionStart=now;transitionProgress=0;
        if(transitionActive){displayScene=transition.at(0);animation=requestAnimationFrame(frame);}
        else finishTransition();
      }
    }
    settings.groupCatalog=catalog;
    const paused=isPaused();
    // setPaused(true) redraws a static shader: never call it for label-only packets.
    if(shaderDirty||paused!==lastPaused){adapter.setPaused(paused);lastPaused=paused;shaderDirty=false;}
    if(paused||lastIcons?.vis===false||!settings.showLabels||!animate)finishTransition();
    drawLabels();
    labels=ctx?layoutGroupLabels(ctx,{...viewport,scene:visibleScene(),settings,legacy:true}):[];
    publishGroupState();
  }
  function resize(){
    shaderDirty=true;
    const dpr=devicePixelRatio||1;viewport.width=Math.round(innerWidth*dpr);viewport.height=Math.round(innerHeight*dpr);
    if(canvas){
      const raster=Math.min(dpr,2);canvas.width=Math.round(innerWidth*raster);canvas.height=Math.round(innerHeight*raster);
      ctx.setTransform(canvas.width/viewport.width,0,0,canvas.height/viewport.height,0,0);
    }
    if(lastIcons)icons=iconsFromHost(lastIcons,viewport,viewport);
    refresh(false);
  }
  function receive(data){
    const message=decodeHostMessage(data);if(!message)return;
    if(!['settings','reset','icons','pause'].includes(message.t))return;
    awaitingHost=false;
    switch(message.t){
      case 'settings':
        if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupNames'))pendingNames=message.v.groupNames||{};
        if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupCatalog'))catalog=sanitizeGroupCatalog(message.v.groupCatalog);
        settings=sanitizeSettings({...settings,...message.v});
        if(Object.keys(message.v||{}).some(key=>!overlayKeys.has(key))){adapter.receive(message);shaderDirty=true;}
        break;
      case 'reset':
        if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupNames'))pendingNames=message.v.groupNames||{};
        if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupCatalog'))catalog=sanitizeGroupCatalog(message.v.groupCatalog);
        settings=sanitizeSettings({...DEFAULT_SETTINGS,groupNames:settings.groupNames,...message.v});
        adapter.receive(message);shaderDirty=true;break;
      case 'icons':
        lastIcons=message;icons=iconsFromHost(message,viewport,viewport);
        const projected={t:'icons',vis:message.vis!==false,r:icons.map(icon=>[icon.x,icon.y,icon.x+icon.w,icon.y+icon.h])};
        const signature=JSON.stringify(projected);
        if(signature!==shaderIcons){adapter.receive(projected);shaderIcons=signature;shaderDirty=true;}
        break;
      case 'pause':hostPaused=!!message.v;break;
      default:return;
    }
    refresh();
  }
  const groupSnapshot=group=>({id:group.id,label:group.label,count:group.icons.length,bounds:group.bounds,hull:group.hull,opacity:group.opacity??1});
  window.classdeskWallpaper={receive,snapshot:()=>({theme,paused:isPaused(),iconCount:visibleScene().icons.length,groupCount:visibleScene().groups.length,groups:visibleScene().groups.map(groupSnapshot),displayGroups:visibleScene(displayScene).groups.map(groupSnapshot),catalog,labels,transition:{active:transitionActive,progress:transitionProgress},drawnLabels:[...drawnLabels],settings:{...settings},...viewport})};
  resize();addEventListener('resize',resize);
  reducedMotion.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);
  if(preview&&parent!==window){
    addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin)receive(event.data);});
  }else if(bridge)bridge.addEventListener('message',event=>receive(event.data));
  if(canvas){
    try{await document.fonts?.load?.('600 22px Pretendard');}
    catch{/* Offline/managed font failures use the measured system fallback. */}
  }
  document.fonts?.addEventListener?.('loadingdone',()=>refresh(false));
  refresh(false);document.documentElement.dataset.ready='true';ready=true;
  // Signal only AFTER both the original shader and label listeners are installed.
  if(preview&&parent!==window)parent.postMessage({t:'ready'},location.origin);
  else bridge?.postMessage('ready');
  publishGroupState();
}else document.documentElement.dataset.ready='true';
