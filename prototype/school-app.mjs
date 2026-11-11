import {DEFAULT_SETTINGS,THEME_IDS,buildScene,generateSampleIcons,sanitizeSettings,sanitizeGroupNames} from './school-layout.mjs';
import {renderSchoolScene} from './school-renderer.mjs';
import {STORAGE_KEY,restoreWorkspace,iconsFromHost,decodeHostMessage,saveWorkspace} from './school-state.mjs';
import {projectLegacyIcons,renderLegacyLabels} from './legacy-groups.mjs';
import {sanitizeGroupCatalog,reconcileGroups,createSceneTransition} from './school-scene-model.mjs';
import {createPlaygroundCrowd,setPlaygroundObstacles,stepPlaygroundCrowd} from './playground-crowd.mjs';
import {layoutGroupLabels} from './group-labels.mjs';

const $ = id => document.getElementById(id);
const FLUENT_EDIT_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M14.77 2.1a1.75 1.75 0 0 1 2.47 2.47l-10.22 10.22c-.32.32-.73.54-1.18.63l-3.25.7a.75.75 0 0 1-.88-.88l.7-3.25c.09-.45.31-.86.63-1.18L14.77 2.1Zm1.41 1.06a.25.25 0 0 0-.35 0L5.7 13.38c-.16.16-.27.36-.31.58l-.48 2.22 2.22-.48c.22-.05.42-.15.58-.31l10.22-10.22a.25.25 0 0 0 0-.35l-1.06-1.06ZM13.8 4.7 15.3 6.2 6.53 14.97l-1.5-1.5L13.8 4.7Z"/></svg>';
const WORLD = {width:1440,height:900};
const host = window.chrome?.webview;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let stored = null;
try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* A locked-down browser can still preview. */ }
let state = restoreWorkspace(stored,DEFAULT_SETTINGS);
if (!state.icons.length) state.icons = generateSampleIcons(state.layout,WORLD);
let registry;
try {
  const response=await fetch('themes.json');
  if(!response.ok) throw new Error('theme registry');
  registry=(await response.json()).themes.filter(theme=>THEME_IDS.includes(theme.id));
  if(registry.length!==6||new Set(registry.map(theme=>theme.id)).size!==6)throw new Error('six themes missing');
} catch(error) {
  document.body.innerHTML='<div class="fatal-notice">테마를 불러오지 못했어요. 프로그램 폴더의 파일을 모두 압축 해제했는지 확인하고 다시 실행해 주세요.</div>';
  throw error;
}
const canvas=$('scene-canvas'),ctx=canvas.getContext('2d'),stage=$('scene-stage'),iconsBox=$('desktop-icons'),editLayer=$('group-edit-layer');
if(!ctx)throw new Error('Canvas 2D is not supported');
let scene,animation=0,toastTimer=0,selected=null,drag=null,sceneScale=1,nativeScreen={w:1440,h:900},nativeIcons=null,groupSignature='',extra=0,activeEditGroupId=null;
let legacyFrame=null,legacyReady=false;
let pendingNativeParams=null;
let displayScene=null,displayTheme=null,transition={active:false,progress:1};
let crowd=null,crowdSettled=false,crowdAnimation=0,crowdLastTime=0;
const history=[];
const iconElements=new Map();
const palette=['#d3b56d','#85b7ae','#d0a7ad','#a7b589','#8eaacc','#bfaa86'];
const values=()=>sanitizeSettings(state.params[state.theme]);
// Native grouping uses physical pixels; only the preview presentation scales.
const sceneViewport=()=>host?{width:nativeScreen.w,height:nativeScreen.h}:WORLD;
const previewSize=()=>host?{width:WORLD.width,height:WORLD.width*nativeScreen.h/nativeScreen.w}:WORLD;
const send=message=>host?.postMessage(JSON.stringify(message));
const copyIcons=()=>state.icons.map(icon=>({...icon}));
const isLegacy=()=>registry.find(theme=>theme.id===state.theme).renderer==='legacy';

function sendLegacyPreview(){
  if(!legacyFrame||!legacyReady)return;
  const target=legacyFrame.contentWindow,origin=location.origin;
  target.postMessage({t:'settings',v:values()},origin);
  target.postMessage({t:'pause',v:!values().motion||reducedMotion.matches||document.hidden},origin);
  target.postMessage(projectLegacyIcons(scene.icons,sceneViewport(),previewSize(),target.devicePixelRatio||1),origin);
}
function syncLegacyPreview(){
  const theme=registry.find(item=>item.id===state.theme);
  if(legacyFrame?.dataset.theme===theme.id)return;
  legacyFrame?.remove();legacyFrame=null;legacyReady=false;
  if(theme.renderer!=='legacy')return;
  const frame=document.createElement('iframe');frame.id='legacy-preview';frame.dataset.theme=theme.id;
  frame.title=theme.name+' 원본 풍경';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
  frame.src=theme.page+'?wallpaper=1&classdeskPreview=1';
  frame.addEventListener('load',()=>{if(legacyFrame===frame&&frame.contentDocument?.documentElement.dataset.ready==='true'){legacyReady=true;sendLegacyPreview();}});
  legacyFrame=frame;stage.prepend(frame);
}
addEventListener('message',event=>{
  if(event.source!==legacyFrame?.contentWindow||event.origin!==location.origin)return;
  if(decodeHostMessage(event.data)?.t==='ready'){legacyReady=true;sendLegacyPreview();}
});
reducedMotion.addEventListener('change',()=>{sendLegacyPreview();redraw();});
document.addEventListener('visibilitychange',()=>{sendLegacyPreview();redraw();});
const isCrowdMoving=()=>state.theme==='playground'&&values().motion&&!reducedMotion.matches&&!document.hidden&&(!host||nativeIcons!==null);
let crowdObstacleSignature='';
function syncCrowd(instant=false){
  if(state.theme!=='playground')return;
  const viewport=sceneViewport();
  if(!crowd||crowd.width!==viewport.width||crowd.height!==viewport.height){crowd=createPlaygroundCrowd(viewport.width,viewport.height);crowdSettled=false;crowdObstacleSignature='';}
  const visible=nativeIcons?.vis===false||host&&!nativeIcons?[]:scene.icons;
  const nextInstant=instant||!crowdSettled||!isCrowdMoving();
  const sig=`${viewport.width}:${viewport.height}:${values().padding}:${nextInstant?1:0}:`+visible.map(i=>`${i.x},${i.y},${i.w},${i.h}`).join(';');
  if(sig!==crowdObstacleSignature){
    crowdObstacleSignature=sig;
    setPlaygroundObstacles(crowd,visible,{clearance:values().padding,instant:nextInstant});
  }
  if(nativeIcons||!host)crowdSettled=true;
}
function stopCrowdLoop(){if(crowdAnimation){cancelAnimationFrame(crowdAnimation);crowdAnimation=0;}crowdLastTime=0;}
function syncCrowdLoop(){
  if(!isCrowdMoving()){stopCrowdLoop();return;}
  if(crowdAnimation)return;
  function tick(now){
    crowdAnimation=0;
    if(!isCrowdMoving()){crowdLastTime=0;return;}
    const dt=crowdLastTime?(now-crowdLastTime)/1000:1/30;crowdLastTime=now;
    stepPlaygroundCrowd(crowd,dt);
    if(!transition.active)renderProgress(1,displayScene||scene);
    crowdAnimation=requestAnimationFrame(tick);
  }
  crowdAnimation=requestAnimationFrame(tick);
}

function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function persist(){
  if(host){$('save-state').lastElementChild.textContent='이 기기의 바탕화면에 설정을 적용했어요.';return;}
  let ok=false;
  try { ok=saveWorkspace(window.localStorage,state); } catch { /* Storage itself may be disabled by school policy. */ }
  $('save-state').classList.toggle('error',!ok);
  $('save-state').lastElementChild.textContent=ok?'변경 사항을 이 기기에 저장했어요.':'이 브라우저에서 저장할 수 없어요. 미리보기는 계속 사용할 수 있어요.';
}
function remember(){history.push(copyIcons());if(history.length>30)history.shift();$('undo-button').disabled=!history.length||!!host;}
function fitPreview(){const size=previewSize();stage.style.width=size.width+'px';stage.style.height=size.height+'px';$('preview-viewport').style.aspectRatio=`${size.width}/${size.height}`;sceneScale=$('preview-viewport').clientWidth/size.width;stage.style.transform=`scale(${sceneScale})`;}
function prepareCanvas(){const size=previewSize(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function renderProgress(progress=1,current=scene){
  displayScene=current;displayTheme=state.theme;
  const viewport=sceneViewport(),size=previewSize();ctx.save();
  try{
    ctx.scale(size.width/viewport.width,size.height/viewport.height);
    if(isLegacy()){
      ctx.clearRect(0,0,viewport.width,viewport.height);
      renderLegacyLabels(ctx,{width:viewport.width,height:viewport.height,scene:current,settings:values()});
    }else renderSchoolScene(ctx,{theme:state.theme,width:viewport.width,height:viewport.height,scene:current,settings:values(),progress:1,crowd:isCrowdMoving()?crowd:null});
  }
  finally{ctx.restore();}
}
function redraw(animate=false){
  const from=displayTheme===state.theme?displayScene:null;
  cancelAnimationFrame(animation);
  animation=0;transition={active:false,progress:1};
  const params=state.params[state.theme],previousCatalog=JSON.stringify(params.groupCatalog);
  const raw=buildScene(state.icons,sceneViewport(),values());
  if(!host||nativeIcons?.vis===true||(nativeIcons&&nativeIcons.vis!==false)){
    const reconciled=reconcileGroups(raw,params.groupCatalog,params.groupNames);
    scene=reconciled.scene;params.groupCatalog=reconciled.catalog;
    if(params.groupNames)params.groupNames=sanitizeGroupNames(params.groupNames,scene.groups.map(group=>group.id));
  }else scene=raw;
  syncIcons();syncGroupNames();syncEditButtons();
  $('scene-count').textContent=`구역 ${scene.groups.length}개 · 자료 ${scene.icons.length}개`;
  $('groups-badge').textContent=String(scene.groups.length);
  if(!host&&!drag&&previousCatalog!==JSON.stringify(params.groupCatalog))persist();
  sendLegacyPreview();
  syncCrowd(!animate||from===null);syncCrowdLoop();
  if(!animate||!values().motion||reducedMotion.matches||document.hidden||!from?.groups.length||nativeIcons?.vis===false){renderProgress();return;}
  const sliding=createSceneTransition(from,scene);
  if(!sliding.changed){renderProgress();return;}
  transition={active:true,progress:0};renderProgress(1,sliding.at(0));
  const start=performance.now();
  function frame(now){const progress=Math.min(1,Math.max(0,(now-start)/280));transition={active:progress<1,progress};renderProgress(1,sliding.at(1-Math.pow(1-progress,3)));if(progress<1)animation=requestAnimationFrame(frame);else animation=0;}
  animation=requestAnimationFrame(frame);
}
function iconSvg(type){
  if(type==='folder')return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 12a3 3 0 0 1 3-3h11l5 5h16a3 3 0 0 1 3 3v21H5z" fill="#f3c969"/><path d="M4 20a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3l-3 18H7z" fill="#f7db8a"/><path d="M7 20h34" stroke="#fff0b8" stroke-width="2"/></svg>';
  const colors={sheet:'#4c9372',slides:'#d59a57',pdf:'#cf7971',document:'#6894ad'};
  const color=colors[type]||colors.document;
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 5h18l9 9v27a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" fill="#f9faf4"/><path d="M29 5v9h9" fill="#dbe6df"/><rect x="4" y="20" width="24" height="19" rx="3" fill="${color}"/><path d="M11 26h11m-11 6h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function selectIcon(id){selected=id;iconElements.forEach((element,key)=>element.classList.toggle('is-selected',key===id));}
function syncIcons(){
  const viewport=sceneViewport(),size=previewSize(),scaleX=size.width/viewport.width,scaleY=size.height/viewport.height;
  const ids=new Set(state.icons.map(icon=>icon.id));
  iconElements.forEach((element,id)=>{if(!ids.has(id)){element.remove();iconElements.delete(id);}});
  for(const icon of state.icons){
    let button=iconElements.get(icon.id);
    if(!button){
      button=document.createElement('button');button.type='button';button.className='desktop-icon';button.dataset.id=icon.id;
      button.innerHTML=iconSvg(icon.type)+'<span class="icon-label"></span>';
      iconsBox.append(button);iconElements.set(icon.id,button);
      button.addEventListener('pointerdown',event=>beginDrag(event,icon.id));
      button.addEventListener('keydown',event=>moveWithKeyboard(event,icon.id));
      button.addEventListener('click',()=>selectIcon(icon.id));
    }
    Object.assign(button.style,{left:icon.x*scaleX+'px',top:icon.y*scaleY+'px',width:icon.w*scaleX+'px',height:icon.h*scaleY+'px'});
    button.querySelector('.icon-label').textContent=icon.name;
    button.setAttribute('aria-label',`${icon.name}${host?' 미리보기':' · 끌거나 방향키로 이동'}`);
    button.classList.toggle('is-selected',selected===icon.id);button.tabIndex=host?-1:0;
    button.style.pointerEvents=host?'none':'';
  }
}
function syncGroupNames(){
  const signature=state.theme+':'+scene.groups.map(group=>group.id).join('|');
  if(signature===groupSignature)return;
  groupSignature=signature;
  const box=$('group-name-list');box.replaceChildren();
  const groupNames=values().groupNames||{};
  for(const [index,group] of scene.groups.entries()){
    const row=document.createElement('label');row.className='group-name-row';
    const dot=document.createElement('i');dot.className='group-swatch';dot.style.background=palette[group.colorIndex%palette.length];
    const input=document.createElement('input');input.type='text';input.maxLength=40;input.setAttribute('aria-label',`${index+1}번 구역 이름`);input.value=groupNames[group.id]??group.label;
    input.addEventListener('input',()=>{
      state.params[state.theme].groupNames=sanitizeGroupNames({...state.params[state.theme].groupNames,[group.id]:input.value},scene.groups.map(item=>item.id));
      send({t:'set',theme:state.theme,key:'groupNames',value:state.params[state.theme].groupNames});
      redraw();persist();
    });row.append(dot,input);box.append(row);
  }
  if(!scene.groups.length){const p=document.createElement('p');p.textContent='아이콘이 생기면 구역도 함께 생겨요.';box.append(p);}
}
function applyGroupName(groupId,rawValue){
  state.params[state.theme].groupNames=sanitizeGroupNames({...state.params[state.theme].groupNames,[groupId]:rawValue},scene.groups.map(item=>item.id));
  groupSignature='';
  send({t:'set',theme:state.theme,key:'groupNames',value:state.params[state.theme].groupNames});
  redraw();persist();
}
function syncEditButtons(){
  if(!editLayer)return;
  const settings=values();
  if(!settings.showLabels||!scene?.groups.length||nativeIcons?.vis===false){
    activeEditGroupId=null;editLayer.replaceChildren();return;
  }
  const viewport=sceneViewport(),size=previewSize(),scaleX=size.width/viewport.width,scaleY=size.height/viewport.height;
  const labels=layoutGroupLabels(ctx,{scene,width:viewport.width,height:viewport.height,settings,legacy:isLegacy()});
  if(activeEditGroupId&&!labels.some(item=>item.id===activeEditGroupId))activeEditGroupId=null;
  editLayer.replaceChildren();
  for(const item of labels){
    const [ex,ey,ew,eh]=item.editRect;
    if(ew<=0||eh<=0)continue;
    const button=document.createElement('button');
    button.type='button';button.className='group-edit-btn';button.dataset.groupId=item.id;
    button.title=`${item.text} 모둠 이름 바꾸기`;button.setAttribute('aria-label',`${item.text} 모둠 이름 바꾸기`);
    button.innerHTML=FLUENT_EDIT_SVG;
    Object.assign(button.style,{left:Math.round(ex*scaleX)+'px',top:Math.round(ey*scaleY)+'px',width:Math.round(ew*scaleX)+'px',height:Math.round(eh*scaleY)+'px'});
    button.addEventListener('click',event=>{
      event.stopPropagation();
      activeEditGroupId=item.id;
      syncEditButtons();
    });
    editLayer.append(button);
    if(activeEditGroupId===item.id){
      const [rx,ry,rw,rh]=item.rect;
      const form=document.createElement('form');form.className='group-inline-editor';form.dataset.groupId=item.id;
      const editorLeft=Math.max(8,Math.min(size.width-200,Math.round(rx*scaleX)));
      const editorTop=Math.max(8,Math.min(size.height-44,Math.round(ry*scaleY-2)));
      Object.assign(form.style,{left:editorLeft+'px',top:editorTop+'px',minWidth:Math.max(140,Math.round((rw+ew+12)*scaleX))+'px',minHeight:Math.max(30,Math.round(rh*scaleY+4))+'px'});
      const input=document.createElement('input');input.type='text';input.maxLength=40;input.className='group-inline-input';
      input.setAttribute('aria-label',`${item.text} 모둠 이름 입력`);
      input.value=(settings.groupNames||{})[item.id]??item.text;
      let committed=false;
      const commit=save=>{
        if(committed)return;committed=true;
        const nextValue=input.value;
        activeEditGroupId=null;
        if(save)applyGroupName(item.id,nextValue);
        else syncEditButtons();
      };
      form.addEventListener('submit',event=>{event.preventDefault();commit(true);});
      input.addEventListener('keydown',event=>{
        event.stopPropagation();
        if(event.key==='Escape'){event.preventDefault();commit(false);}
      });
      input.addEventListener('blur',()=>commit(true));
      form.append(input);editLayer.append(form);
      queueMicrotask(()=>{input.focus();input.select();});
    }
  }
}
function clampPosition(icon,x,y){return {x:Math.round(Math.max(12,Math.min(WORLD.width-icon.w-12,x))),y:Math.round(Math.max(65,Math.min(WORLD.height-icon.h-24,y)))};}
function beginDrag(event,id){
  if(host||event.button!==0)return;
  const icon=state.icons.find(item=>item.id===id);if(!icon)return;
  selectIcon(id);remember();
  drag={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:icon.x,y:icon.y};
  event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.classList.add('is-dragging');
}
iconsBox.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const icon=state.icons.find(item=>item.id===drag.id);if(!icon)return;
  Object.assign(icon,clampPosition(icon,drag.x+(event.clientX-drag.startX)/sceneScale,drag.y+(event.clientY-drag.startY)/sceneScale));redraw();
});
function endDrag(event){if(!drag||event.pointerId!==drag.pointerId)return;iconElements.get(drag.id)?.classList.remove('is-dragging');drag=null;persist();redraw(true);}
iconsBox.addEventListener('pointerup',endDrag);iconsBox.addEventListener('pointercancel',endDrag);
function moveWithKeyboard(event,id){
  if(host||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(event.key))return;
  event.preventDefault();const icon=state.icons.find(item=>item.id===id);if(!icon)return;remember();selectIcon(id);
  if(event.key==='Delete'||event.key==='Backspace'){state.icons=state.icons.filter(item=>item.id!==id);selected=null;}
  else{const amount=event.shiftKey?32:8;const delta={ArrowLeft:[-amount,0],ArrowRight:[amount,0],ArrowUp:[0,-amount],ArrowDown:[0,amount]}[event.key];Object.assign(icon,clampPosition(icon,icon.x+delta[0],icon.y+delta[1]));}
  persist();redraw(true);
}
function syncControls(){
  const settings=values();
  const legacy=isLegacy(),playground=state.theme==='playground';
  $('material-heading').closest('fieldset').hidden=legacy;
  document.querySelector('label[for="motion"] strong').textContent=legacy?'자연 풍경 움직임':playground?'학생들과 구역 움직임':'부드러운 그리기';
  document.querySelector('label[for="motion"] small').textContent=legacy?'끄면 파도와 구름을 멈춰요.':playground?'아이콘을 놓으면 학생들이 비켜나요.':'위치가 바뀌면 경계도 따라와요.';
  $('group-gap').closest('fieldset').querySelector('legend').textContent=legacy?'이름을 붙이는 방법':'구역을 만드는 방법';
  $('group-gap').closest('.range-field').querySelector('p').textContent=legacy?'가까운 아이콘끼리 한 이름표를 써요. 원래의 지형은 유지돼요.':'가까운 아이콘끼리 한 구역으로 묶어요.';
  $('border-padding').closest('.range-field').querySelector('p').textContent=legacy?'아이콘과 이름표 사이를 여유롭게.':playground?'아이콘과 학생들 사이를 여유롭게.':'아이콘과 경계선 사이를 여유롭게.';
  for(const input of $('settings-form').querySelectorAll('input')){
    if(input.type==='checkbox'){input.checked=!!settings[input.name];continue;}
    input.value=String(settings[input.name]);
    input.style.setProperty('--value',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
    const output=document.querySelector(`output[for="${input.id}"]`);if(output)output.value=['texture','waviness','roundBoundary'].includes(input.name)?Math.round(Number(input.value)*100)+'%':input.name==='labelSize'?`${input.value}px`:input.value;
  }
  $('render-mode').value=settings.renderMode;
  $('line-width').disabled=settings.renderMode==='fill'||playground;
  $('render-mode').disabled=playground;
  $('waviness').disabled=playground;
  $('round-boundary').disabled=playground;
  $('material-heading').textContent=registry.find(item=>item.id===state.theme).material;
  const labels=legacy?['이름을 함께 쓸 묶기 거리','이름표 여백','선 두께']:state.theme==='classroom'?['책상 묶기 거리','모둠 여백','모둠 경계 두께']:playground?['아이콘 묶기 거리','학생 비켜서기 여백','선 두께']:['아이콘 묶기 거리','외곽선 여백',state.theme==='gym'?'테이프 두께':'선 두께'];
  for(const [index,id] of ['group-gap','border-padding','line-width'].entries())document.querySelector(`label[for="${id}"]`).textContent=labels[index];
}
function switchTheme(id,notify=true){
  if(!THEME_IDS.includes(id))return;
  state.theme=id;stage.dataset.theme=id;document.documentElement.dataset.theme=id;
  const theme=registry.find(item=>item.id===id);$('theme-description').textContent=theme.desc;
  for(const button of $('theme-list').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.theme===id));
  syncLegacyPreview();syncControls();groupSignature='';redraw(true);if(notify){send({t:'theme',id});persist();}
}
function renderThemes(){
  const miniatureIcons=generateSampleIcons('groups',WORLD);const miniatureScene=buildScene(miniatureIcons,WORLD,DEFAULT_SETTINGS);
  for(const theme of registry){
    const button=document.createElement('button');button.type='button';button.className='theme-card';button.dataset.theme=theme.id;button.setAttribute('aria-pressed',String(theme.id===state.theme));button.setAttribute('aria-label',theme.name+' 테마');
    const mini=document.createElement('canvas');mini.width=264;mini.height=220;mini.setAttribute('aria-hidden','true');
    const miniContext=mini.getContext('2d');miniContext.scale(264/WORLD.width,220/WORLD.height);
    if(theme.renderer==='legacy'){
      // Illustrative cards only; the main preview always runs the real shaders.
      miniContext.fillStyle=theme.id==='beach'?'#65c6c3':'#a6c46e';miniContext.fillRect(0,0,WORLD.width,WORLD.height);
      miniContext.fillStyle=theme.id==='beach'?'#eee2b8':'#eff4dd';
      for(const group of miniatureScene.groups){const b=group.bounds;miniContext.beginPath();miniContext.ellipse(b.x+b.w/2,b.y+b.h/2,b.w*.9,b.h*.8,-.2,0,Math.PI*2);miniContext.fill();}
    }else renderSchoolScene(miniContext,{theme:theme.id,width:WORLD.width,height:WORLD.height,scene:miniatureScene,settings:DEFAULT_SETTINGS,progress:1});
    const copy=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=theme.name;small.textContent=theme.subtitle;copy.append(strong,small);
    button.append(mini,copy);button.addEventListener('click',()=>switchTheme(theme.id));$('theme-list').append(button);
  }
}
$('settings-form').addEventListener('input',event=>{
  const input=event.target;if(!input.name)return;
  const value=input.type==='checkbox'?input.checked:input.tagName==='SELECT'?input.value:Number(input.value);
  state.params[state.theme]={...state.params[state.theme],[input.name]:value};send({t:'set',theme:state.theme,key:input.name,value});syncControls();redraw();persist();
});
for(const button of document.querySelectorAll('[data-layout]'))button.addEventListener('click',()=>{
  if(host)return;remember();state.layout=button.dataset.layout;state.icons=generateSampleIcons(state.layout,WORLD);selected=null;
  document.querySelectorAll('[data-layout]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.layout===state.layout)));persist();redraw(true);
});
$('undo-button').addEventListener('click',()=>{if(host||!history.length)return;state.icons=history.pop();selected=null;$('undo-button').disabled=!history.length;persist();redraw();});
$('add-icon-button').addEventListener('click',()=>{
  if(host)return;if(state.icons.length>=100){toast('미리보기 자료는 100개까지 추가할 수 있어요.');return;}
  remember();const offset=(extra++%5)*18;const icon={id:'sample-'+Date.now()+'-'+extra,name:'새 자료 '+extra,type:'folder',x:1100+offset,y:640+offset,w:92,h:94};state.icons.push(icon);selected=icon.id;persist();redraw(true);
});
$('reset-button').addEventListener('click',()=>{const {groupNames,groupCatalog}=state.params[state.theme];state.params[state.theme]={...DEFAULT_SETTINGS,...(groupNames?{groupNames}:{}),...(groupCatalog?{groupCatalog}:{} )};send({t:'reset',theme:state.theme});syncControls();groupSignature='';redraw(true);persist();toast('표현 설정을 기본값으로 되돌렸어요. 구역 이름은 유지돼요.');});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('preview-shell').requestFullscreen();fitPreview();}catch{toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.');}});
$('download-button').addEventListener('click',()=>{
  const viewport=sceneViewport(),image=document.createElement('canvas');image.width=Math.min(3840,viewport.width);image.height=Math.round(viewport.height*image.width/viewport.width);
  const imageContext=image.getContext('2d');
  if(isLegacy()){
    const snapshot=legacyReady&&legacyFrame?.contentWindow.classdeskBackgroundSnapshot;
    if(typeof snapshot!=='function'){toast('풍경을 준비하고 있어요. 잠시 후 다시 저장해 주세요.');return;}
    imageContext.drawImage(snapshot(image.width/previewSize().width),0,0,image.width,image.height);
    imageContext.scale(image.width/viewport.width,image.height/viewport.height);
    renderLegacyLabels(imageContext,{width:viewport.width,height:viewport.height,scene,settings:values()});
  }else{
    imageContext.scale(image.width/viewport.width,image.height/viewport.height);
    renderSchoolScene(imageContext,{theme:state.theme,width:viewport.width,height:viewport.height,scene,settings:values(),progress:1,crowd:isCrowdMoving()?crowd:null});
  }
  image.toBlob(blob=>{if(!blob){toast('이미지를 만들지 못했어요. 다시 시도해 주세요.');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ClassDesk-'+state.theme+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('파일명 없이 배경과 구역만 이미지로 저장했어요.');},'image/png');
});
function openHelp(){if(!$('help-dialog').open)$('help-dialog').showModal();}
$('help-button').addEventListener('click',openHelp);$('windows-help-button').addEventListener('click',openHelp);$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
$('autostart').addEventListener('change',event=>send({t:'autostart',v:event.target.checked}));
function receiveNative(data){
  const message=decodeHostMessage(data);if(!message)return;
  if(message.t==='init'){
    if(message.screen&&[message.screen.w,message.screen.h].every(value=>Number.isFinite(value)&&value>0))nativeScreen=message.screen;
    prepareCanvas();fitPreview();
    if(nativeIcons)state.icons=iconsFromHost(nativeIcons,nativeScreen,sceneViewport());else state.icons=[];
    pendingNativeParams=message.params;
    const restored=restoreWorkspace({theme:message.theme,params:message.params,icons:state.icons},DEFAULT_SETTINGS);state.params=restored.params;state.theme=restored.theme;
    $('autostart').checked=!!message.autostart;switchTheme(state.theme,false);
  }else if(message.t==='icons'){
    nativeIcons=message;state.icons=iconsFromHost(message,nativeScreen,sceneViewport());
    if(pendingNativeParams){
      // init can precede the first icon message. Delay history eviction until
      // real active memberships are known, never sending a truncated dictionary.
      state.params=restoreWorkspace({theme:state.theme,params:pendingNativeParams,icons:state.icons},DEFAULT_SETTINGS).params;
      if(message.vis!==false)pendingNativeParams=null;
      groupSignature='';
    }
    redraw(true);
  }
  else if(message.t==='groupState'||message.t==='groupNames'){
    if(!THEME_IDS.includes(message.theme))return;
    const key=message.t==='groupState'?'groupCatalog':'groupNames';
    if(key==='groupCatalog'&&(!message.catalog||message.catalog.version!==1||!Array.isArray(message.catalog.groups)))return;
    const params=state.params[message.theme];
    const value=key==='groupCatalog'?sanitizeGroupCatalog(message.catalog):sanitizeGroupNames(message.groupNames,params.groupCatalog?.groups.filter(group=>group.active).map(group=>group.id)||[]);
    params[key]=value;
    if(pendingNativeParams)pendingNativeParams={...pendingNativeParams,[message.theme]:{...pendingNativeParams[message.theme],[key]:value}};
    if(message.theme===state.theme){groupSignature='';redraw();}
  }
  else if(message.t==='themeChanged')switchTheme(message.id,false);
  else if(message.t==='autostart')$('autostart').checked=!!message.v;
}
prepareCanvas();fitPreview();renderThemes();stage.dataset.theme=state.theme;switchTheme(state.theme,false);
document.querySelectorAll('[data-layout]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.layout===state.layout)));
new ResizeObserver(fitPreview).observe($('preview-viewport'));
if(host){
  $('mode-badge').lastChild.textContent=' Windows 바탕화면 연결';$('preview-notice').textContent='실제 아이콘 위치를 보여줘요. 아이콘은 Windows 바탕화면에서 옮겨주세요.';
  $('native-banner').hidden=true;$('add-icon-button').disabled=true;$('autostart-row').hidden=false;
  for(const item of document.querySelectorAll('[data-layout]')){item.disabled=true;item.title='실제 아이콘 배치는 바탕화면에서 변경해요.';}
  host.addEventListener('message',event=>receiveNative(event.data));send({t:'hello'});
}
await document.fonts.ready;redraw();
const summarize=current=>(current?.groups||[]).map(group=>({id:group.id,label:group.label,count:group.icons.length,colorIndex:group.colorIndex,bounds:{...group.bounds},hull:group.hull}));
window.classdesk={snapshot:()=>({theme:state.theme,settings:values(),catalog:sanitizeGroupCatalog(state.params[state.theme].groupCatalog),icons:copyIcons(),groups:summarize(scene),displayGroups:summarize(displayScene),transition:{...transition},viewport:sceneViewport(),hosted:!!host,students:crowd?crowd.students.filter(s=>!s.hidden).map(s=>({id:s.id,x:s.x,y:s.y,size:s.size,frame:s.frame,state:s.state})):[]}),receiveNative};
document.documentElement.dataset.ready='true';
