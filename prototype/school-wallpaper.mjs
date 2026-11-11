// Wallpaper entry shared by the four school themes. Renders only wallpaper,
// never duplicates, moves or reads the names of Windows desktop icons.
import {DEFAULT_SETTINGS,SCHOOL_THEME_IDS,buildScene,generateSampleIcons,sanitizeSettings,sanitizeGroupNames} from './school-layout.mjs';
import {renderSchoolScene} from './school-renderer.mjs';
import {decodeHostMessage,iconsFromHost} from './school-state.mjs';
import {sanitizeGroupCatalog,reconcileGroups,createSceneTransition} from './school-scene-model.mjs';
import {layoutGroupLabels} from './group-labels.mjs';
import {createPlaygroundCrowd,setPlaygroundObstacles,stepPlaygroundCrowd} from './playground-crowd.mjs';

const canvas=document.getElementById('wallpaper'),ctx=canvas.getContext('2d');
const theme=SCHOOL_THEME_IDS.includes(document.body.dataset.theme)?document.body.dataset.theme:'chalkboard';
const query=new URLSearchParams(location.search),wallpaper=query.has('wallpaper'),preview=query.has('preview');
const bridge=window.chrome?.webview;
let settings={...DEFAULT_SETTINGS},icons=[],scene,lastIcons=null,paused=false,animation=0;
let pendingNames=null;
let catalog=sanitizeGroupCatalog();
let displayScene=null,transition={active:false,progress:1};
let groupStateSignature='';
let crowd=null,crowdSettled=false,crowdAnimation=0,crowdLastTime=0;
const viewport={width:innerWidth*(devicePixelRatio||1),height:innerHeight*(devicePixelRatio||1)};
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const isMoving=()=>!paused&&settings.motion&&!reducedMotion.matches&&!document.hidden&&(!bridge||lastIcons!==null);
function syncCrowd(instant=false){
  if(theme!=='playground')return;
  if(!crowd||crowd.width!==viewport.width||crowd.height!==viewport.height){crowd=createPlaygroundCrowd(viewport.width,viewport.height);crowdSettled=false;}
  const visible=lastIcons?.vis===false||bridge&&!lastIcons?[]:scene.icons;
  setPlaygroundObstacles(crowd,visible,{clearance:settings.padding,instant:instant||!crowdSettled||!isMoving()});
  if(lastIcons||!bridge)crowdSettled=true;
}
function stopCrowdLoop(){if(crowdAnimation){cancelAnimationFrame(crowdAnimation);crowdAnimation=0;}crowdLastTime=0;}
function syncCrowdLoop(){
  if(theme!=='playground'||!isMoving()){stopCrowdLoop();return;}
  if(crowdAnimation)return;
  function tick(now){
    crowdAnimation=0;
    if(theme!=='playground'||!isMoving()){crowdLastTime=0;return;}
    const dt=crowdLastTime?(now-crowdLastTime)/1000:1/30;crowdLastTime=now;
    stepPlaygroundCrowd(crowd,dt);
    if(!transition.active)draw(displayScene||scene);
    crowdAnimation=requestAnimationFrame(tick);
  }
  crowdAnimation=requestAnimationFrame(tick);
}
function publishGroups(){
  if(!bridge||!lastIcons)return;
  const labels=paused||document.hidden||lastIcons.vis===false?[]:layoutGroupLabels(ctx,{scene,...viewport,settings}).map(({id,text,rect,editRect})=>({id,text,rect,editRect}));
  const signature=JSON.stringify({t:'groupState',theme,catalog,labels});
  if(signature===groupStateSignature)return;
  groupStateSignature=signature;bridge.postMessage(signature);
}
function draw(current=scene){displayScene=current;renderSchoolScene(ctx,{theme,width:viewport.width,height:viewport.height,scene:current,settings,progress:1,crowd:theme==='playground'&&isMoving()?crowd:null});if(!transition.active)publishGroups();}
function refresh(animate=true){
  const from=displayScene;
  cancelAnimationFrame(animation);
  animation=0;transition={active:false,progress:1};
  const raw=buildScene(icons,viewport,pendingNames?{...settings,groupNames:pendingNames}:settings);
  if(lastIcons?.vis===false||(bridge&&!lastIcons))scene=raw;
  else {const reconciled=reconcileGroups(raw,catalog,pendingNames||settings.groupNames);scene=reconciled.scene;catalog=reconciled.catalog;}
  if(pendingNames){settings.groupNames=sanitizeGroupNames(pendingNames,scene.groups.map(group=>group.id));if(lastIcons?.vis!==false&&lastIcons)pendingNames=null;}
  syncCrowd(!animate);syncCrowdLoop();
  if(paused||!settings.motion||reducedMotion.matches||document.hidden||!animate||!from?.groups.length||lastIcons?.vis===false){draw();return;}
  const sliding=createSceneTransition(from,scene);
  if(!sliding.changed){draw();return;}
  transition={active:true,progress:0};draw(sliding.at(0));
  const start=performance.now();
  function frame(now){const progress=Math.min(1,Math.max(0,(now-start)/280));transition={active:progress<1,progress};draw(sliding.at(1-Math.pow(1-progress,3)));if(progress<1)animation=requestAnimationFrame(frame);else animation=0;}
  animation=requestAnimationFrame(frame);
}
function resize(){
  // Keep physical coordinates for grouping; scale only the backing bitmap.
  const dpr=devicePixelRatio||1;viewport.width=Math.round(innerWidth*dpr);viewport.height=Math.round(innerHeight*dpr);
  const rasterScale=Math.min(dpr,2);canvas.width=Math.round(innerWidth*rasterScale);canvas.height=Math.round(innerHeight*rasterScale);ctx.setTransform(canvas.width/viewport.width,0,0,canvas.height/viewport.height,0,0);
  if(lastIcons)icons=iconsFromHost(lastIcons,{w:viewport.width,h:viewport.height},viewport);
  refresh(false);
}
function privacySnapshot(){
  const output=document.createElement('canvas');output.width=Math.min(2560,Math.round(innerWidth));output.height=Math.round(output.width*innerHeight/innerWidth);
  const safeSettings={...settings,groupNames:{}};
  const safeScene=buildScene(generateSampleIcons('work',{width:output.width,height:output.height}),{width:output.width,height:output.height},safeSettings);
  renderSchoolScene(output.getContext('2d'),{theme,width:output.width,height:output.height,scene:safeScene,settings:safeSettings,progress:1});
  const thumbnail=document.createElement('canvas');thumbnail.width=480;thumbnail.height=Math.round(output.height*480/output.width);thumbnail.getContext('2d').drawImage(output,0,0,thumbnail.width,thumbnail.height);
  bridge?.postMessage('snapshot|'+thumbnail.toDataURL('image/png')+'|'+output.toDataURL('image/png'));
}
function receive(data){
  const message=decodeHostMessage(data);if(!message)return;
  switch(message.t){
    case 'icons':lastIcons=message;icons=iconsFromHost(message,{w:viewport.width,h:viewport.height},viewport);refresh();break;
    case 'settings':
      if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupNames'))pendingNames=message.v.groupNames||{};
      if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupCatalog'))catalog=sanitizeGroupCatalog(message.v.groupCatalog);
      settings=sanitizeSettings({...settings,...message.v});refresh(false);break;
    case 'reset':
      pendingNames=message.v?.groupNames??pendingNames??settings.groupNames??null;
      if(message.v&&Object.prototype.hasOwnProperty.call(message.v,'groupCatalog'))catalog=sanitizeGroupCatalog(message.v.groupCatalog);
      settings=sanitizeSettings({...DEFAULT_SETTINGS,groupNames:pendingNames||{},...message.v});refresh(false);break;
    // Even while paused, render the final state when icon/settings messages arrive.
    case 'pause':paused=!!message.v;cancelAnimationFrame(animation);animation=0;transition={active:false,progress:1};syncCrowd(true);syncCrowdLoop();draw();break;
    case 'snapshot':privacySnapshot();break;
  }
}
if(!wallpaper&&!preview)icons=generateSampleIcons('work',viewport);
resize();
addEventListener('resize',resize);
reducedMotion.addEventListener('change',()=>refresh(false));
document.addEventListener('visibilitychange',()=>refresh(false));
if(bridge){bridge.addEventListener('message',event=>receive(event.data));bridge.postMessage('ready');}
else if(preview&&parent!==window){
  addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin)receive(event.data);});
  parent.postMessage(JSON.stringify({t:'ready'}),location.origin);
}
await document.fonts.ready;refresh(false);
const summarize=current=>(current?.groups||[]).map(group=>({id:group.id,label:group.label,count:group.icons.length,colorIndex:group.colorIndex,bounds:{...group.bounds},hull:group.hull}));
window.classdeskWallpaper={snapshot:()=>({theme,paused,catalog:sanitizeGroupCatalog(catalog),iconCount:scene.icons.length,groupCount:scene.groups.length,groups:summarize(scene),displayGroups:summarize(displayScene),transition:{...transition},settings:{...settings},width:viewport.width,height:viewport.height,students:crowd?crowd.students.filter(s=>!s.hidden).map(s=>({id:s.id,x:s.x,y:s.y,size:s.size,frame:s.frame,state:s.state})):[]}),receive};
document.documentElement.dataset.ready='true';
