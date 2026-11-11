import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),base='http://127.0.0.1:5189';
const server=spawn(process.execPath,['prototype/serve.mjs'],{cwd:root,env:{...process.env,PORT:'5189'},stdio:'pipe'});
const report={passed:[],failed:[],errors:[]};
let browser;
const glyphs={t:'icons',vis:true,r:[[200,200,248,248],[270,200,318,248],[900,300,948,348]],ids:['icon-a','icon-b','icon-c']};
async function check(name,fn){if(process.env.QA_ONLY&&!name.includes(process.env.QA_ONLY))return;try{await fn();report.passed.push(name);console.log('PASS',name);}catch(error){report.failed.push({name,error:error.stack});console.error('FAIL',name,error.stack);}}
async function nativePage(path,{clock=false}={}){
 const context=await browser.newContext({viewport:{width:1920,height:1080}});
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.addInitScript(({clock})=>{
  window.__sent=[];window.chrome={webview:{postMessage:value=>window.__sent.push(value),addEventListener:(_,callback)=>window.__deliver=value=>callback({data:value})}};
  if(clock){let sequence=0;const callbacks=new Map();window.__time=0;Object.defineProperty(performance,'now',{value:()=>window.__time});window.requestAnimationFrame=callback=>{callbacks.set(++sequence,callback);return sequence;};window.cancelAnimationFrame=id=>callbacks.delete(id);window.__step=ms=>{window.__time+=ms;const current=[...callbacks.values()];callbacks.clear();for(const callback of current)callback(window.__time);};}
 },{clock});
 await page.goto(base+'/'+path);await page.waitForSelector('html[data-ready=true]');
 return {context,page};
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===59)throw Error('Test server not ready');await new Promise(resolve=>setTimeout(resolve,100));}
 const executablePath=[chromium.executablePath(),'/snap/chromium/current/usr/lib/chromium-browser/chrome','/usr/bin/chromium'].find(existsSync);
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
 await check('settings preserve a named group through member insertion, reordering, removal and restart',async()=>{
  const {page,context}=await nativePage('settings.html');
  await page.evaluate(glyphs=>{window.classdesk.receiveNative({t:'init',theme:'chalkboard',screen:{w:1920,h:1080},params:{}});window.classdesk.receiveNative(glyphs);},glyphs);
  const before=await page.evaluate(()=>window.classdesk.snapshot());
  await page.locator('#group-name-list input').first().fill('수업 자료');
  const added={...glyphs,r:[[340,200,388,248],...glyphs.r],ids:['icon-new',...glyphs.ids]};
  await page.evaluate(message=>window.classdesk.receiveNative(message),added);
  const changed=await page.evaluate(()=>window.classdesk.snapshot());
  assert.equal(changed.groups[0].id,before.groups[0].id);
  assert.equal(changed.groups[0].label,'수업 자료');
  assert.equal(changed.groups[1].id,before.groups[1].id);
  assert.equal(await page.locator('#group-name-list input').first().inputValue(),'수업 자료');
  await page.evaluate(message=>window.classdesk.receiveNative(message),glyphs);
  const saved=await page.evaluate(()=>window.classdesk.snapshot());
  const params={chalkboard:{...saved.settings,groupCatalog:saved.catalog}};
  await page.reload();await page.waitForSelector('html[data-ready=true]');
  await page.evaluate(({glyphs,params})=>{window.classdesk.receiveNative({t:'init',theme:'chalkboard',screen:{w:1920,h:1080},params});window.classdesk.receiveNative(glyphs);},{glyphs,params});
  const restored=await page.evaluate(()=>window.classdesk.snapshot());
  assert.equal(restored.groups[0].id,before.groups[0].id);assert.equal(restored.groups[0].label,'수업 자료');
  await context.close();
 });
 await check('desktop catalog and name relays update the open settings window without a write-back loop',async()=>{
  const {page,context}=await nativePage('settings.html');
  await page.evaluate(glyphs=>{window.classdesk.receiveNative({t:'init',theme:'chalkboard',screen:{w:1920,h:1080},params:{}});window.classdesk.receiveNative(glyphs);},glyphs);
  const packet=await page.evaluate(()=>{const snapshot=window.classdesk.snapshot();const catalog=snapshot.catalog;catalog.groups.find(group=>group.id===snapshot.groups[0].id).id='group-from-wallpaper';return {t:'groupState',theme:'chalkboard',catalog};});
  await page.evaluate(packet=>{window.__sent=[];window.classdesk.receiveNative(packet);window.classdesk.receiveNative({t:'groupNames',theme:'chalkboard',groupNames:{'group-from-wallpaper':'바탕화면에서 수정'}});},packet);
  const state=await page.evaluate(()=>window.classdesk.snapshot());
  assert.equal(state.groups[0].id,'group-from-wallpaper');assert.equal(state.groups[0].label,'바탕화면에서 수정');
  assert.equal(await page.locator('#group-name-list input').first().inputValue(),'바탕화면에서 수정');
  assert.equal(await page.evaluate(()=>window.__sent.filter(value=>{try{return JSON.parse(value).t==='set';}catch{return false;}}).length),0);
  await context.close();
 });
 await check('school wallpaper keeps its catalog and names across changed membership, hiding and visual reset',async()=>{
  const {page,context}=await nativePage('chalkboard.html?wallpaper=1',{clock:true});
  await page.evaluate(glyphs=>{const w=window.classdeskWallpaper;w.receive({t:'settings',v:{motion:false}});w.receive(glyphs);},glyphs);
  const before=await page.evaluate(()=>window.classdeskWallpaper.snapshot());
  await page.evaluate(id=>window.classdeskWallpaper.receive({t:'settings',v:{groupNames:{[id]:'분필 수업'}}}),before.groups[0].id);
  const added={...glyphs,r:[[340,200,388,248],...glyphs.r],ids:['icon-new',...glyphs.ids]};
  await page.evaluate(message=>window.classdeskWallpaper.receive(message),added);
  const changed=await page.evaluate(()=>window.classdeskWallpaper.snapshot());
  assert.equal(changed.groups[0].id,before.groups[0].id);assert.equal(changed.groups[0].label,'분필 수업');
  await page.evaluate(()=>window.classdeskWallpaper.receive({t:'icons',vis:false,r:[],ids:[]}));
  const hidden=await page.evaluate(()=>window.classdeskWallpaper.snapshot());
  assert.equal(hidden.groupCount,0);assert.deepEqual(hidden.catalog,changed.catalog);
  await page.evaluate(message=>window.classdeskWallpaper.receive(message),added);
  await page.evaluate(()=>window.classdeskWallpaper.receive({t:'reset',v:{}}));
  const restored=await page.evaluate(()=>window.classdeskWallpaper.snapshot());
  assert.equal(restored.groups[0].id,before.groups[0].id);assert.equal(restored.groups[0].label,'분필 수업');
  await context.close();
 });
 await check('school boundary updates slide one group without erasing the unchanged group pixels',async()=>{
  const {page,context}=await nativePage('chalkboard.html?wallpaper=1',{clock:true});
  await page.evaluate(glyphs=>{const w=window.classdeskWallpaper;w.receive({t:'settings',v:{motion:true,texture:0,waviness:0,showLabels:false}});w.receive(glyphs);window.__step(500);},glyphs);
  const probe=()=>page.evaluate(async()=>{const canvas=document.getElementById('wallpaper');const bytes=canvas.getContext('2d').getImageData(860,260,128,128).data;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',');return {hash,state:window.classdeskWallpaper.snapshot()};});
  const before=await probe();
  const moved={...glyphs,r:[[180,200,228,248],...glyphs.r.slice(1)]};
  await page.evaluate(message=>{window.classdeskWallpaper.receive(message);window.__step(0);},moved);
  const first=await probe();assert.equal(first.hash,before.hash,'unchanged group must not disappear at the first frame');
  await page.evaluate(()=>window.__step(130));const middle=await probe();
  assert.equal(middle.hash,before.hash);assert.equal(middle.state.transition.active,true);assert.equal(middle.state.groupCount,2);
  const old=before.state.groups[0],intermediate=middle.state.displayGroups.find(group=>group.id===old.id),target=middle.state.groups[0];
  assert.ok(intermediate.bounds.x<old.bounds.x&&intermediate.bounds.x>target.bounds.x);
  assert.deepEqual(middle.state.displayGroups.find(group=>group.id===before.state.groups[1].id).hull,before.state.groups[1].hull);
  await page.evaluate(()=>window.__step(500));const final=await probe();assert.equal(final.hash,before.hash);assert.equal(final.state.transition.active,false);assert.deepEqual(final.state.displayGroups,final.state.groups);
  await context.close();
 });
 await check('settings preview uses the same fixed-group sliding transition as the wallpaper',async()=>{
  const {page,context}=await nativePage('settings.html',{clock:true});
  await page.evaluate(glyphs=>{window.classdesk.receiveNative({t:'init',theme:'chalkboard',screen:{w:1920,h:1080},params:{chalkboard:{motion:true,texture:0,waviness:0,showLabels:false}}});window.classdesk.receiveNative(glyphs);window.__step(500);},glyphs);
  const probe=()=>page.evaluate(async()=>{const bytes=document.getElementById('scene-canvas').getContext('2d').getImageData(640,190,110,110).data;return {hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(','),state:window.classdesk.snapshot()};});
  const before=await probe(),moved={...glyphs,r:[[180,200,228,248],...glyphs.r.slice(1)]};
  await page.evaluate(message=>{window.classdesk.receiveNative(message);window.__step(0);},moved);
  assert.equal((await probe()).hash,before.hash,'preview cannot restart all outlines from zero');
  await page.evaluate(()=>window.__step(130));const middle=await probe();assert.equal(middle.hash,before.hash);assert.equal(middle.state.transition.active,true);
  const old=before.state.groups[0],current=middle.state.displayGroups.find(group=>group.id===old.id);assert.ok(current.bounds.x<old.bounds.x&&current.bounds.x>middle.state.groups[0].bounds.x);
  await page.evaluate(()=>window.__step(500));const end=await probe();assert.equal(end.hash,before.hash);assert.equal(end.state.transition.active,false);
  await context.close();
 });
 await check('school wallpaper publishes safe physical desktop-editor labels and deduplicates unchanged state',async()=>{
  const {page,context}=await nativePage('chalkboard.html?wallpaper=1');
  await page.evaluate(glyphs=>{const w=window.classdeskWallpaper;w.receive({t:'settings',v:{motion:false}});w.receive(glyphs);},glyphs);
  const packets=()=>page.evaluate(()=>window.__sent.flatMap(value=>{try{const packet=JSON.parse(value);return packet.t==='groupState'?[packet]:[];}catch{return [];}}));
  let sent=await packets();assert.ok(sent.length>0,'native editor requires an actual groupState message');
  const last=sent.at(-1),state=await page.evaluate(()=>window.classdeskWallpaper.snapshot());assert.deepEqual(last.catalog,state.catalog);assert.equal(last.labels.length,2);
  for(const label of last.labels){assert.ok(label.rect.every(Number.isFinite));assert.equal(label.editRect[2],24);assert.equal(label.editRect[3],24);for(const r of glyphs.r){const [x,y,w,h]=label.editRect;assert.ok(!(x<r[2]&&x+w>r[0]&&y<r[3]&&y+h>r[1]),'desktop pencil cannot overlap a real file glyph');}}
  await page.evaluate(message=>window.classdeskWallpaper.receive(message),glyphs);assert.equal((await packets()).length,sent.length);
  await page.evaluate(()=>window.classdeskWallpaper.receive({t:'pause',v:true}));assert.deepEqual((await packets()).at(-1).labels,[]);
  await page.evaluate(()=>window.classdeskWallpaper.receive({t:'pause',v:false}));assert.equal((await packets()).at(-1).labels.length,2);
  await context.close();
 });
 await check('ordinary top-left desktop columns retain a native-usable pencil beside the group label',async()=>{
  const {page,context}=await nativePage('chalkboard.html?wallpaper=1');
  for(const top of [10,40]){
   const message={t:'icons',vis:true,ids:['a','b','c','d'],r:Array.from({length:4},(_,i)=>[20,top+96*i,68,top+96*i+48])};
   await page.evaluate(message=>{window.classdeskWallpaper.receive({t:'settings',v:{motion:false}});window.classdeskWallpaper.receive(message);},message);
   const packet=await page.evaluate(()=>window.__sent.flatMap(value=>{try{const packet=JSON.parse(value);return packet.t==='groupState'?[packet]:[];}catch{return [];}}).at(-1));
   assert.equal(packet.labels.length,1);const label=packet.labels[0];assert.equal(label.editRect[2],24,'ordinary top-left layout must offer direct editing at y='+top);
   for(const r of message.r){const reserved=[r[0]-48,r[1]-4,r[2]-r[0]+96,r[3]-r[1]+84];for(const rect of [label.rect,label.editRect])assert.ok(!(rect[0]<reserved[0]+reserved[2]&&rect[0]+rect[2]>reserved[0]&&rect[1]<reserved[1]+reserved[3]&&rect[1]+rect[3]>reserved[1]),'label and pencil must both clear native filename-cell reservations');}
  }
  await context.close();
 });
 await check('0.1 native-index names migrate when 0.2 first supplies opaque icon identifiers',async()=>{
  const {buildScene}=await import('../prototype/school-layout.mjs'),{iconsFromHost}=await import('../prototype/school-state.mjs');
  const viewport={width:1920,height:1080};
  const old=buildScene(iconsFromHost({...glyphs,ids:undefined},viewport,viewport),viewport).groups[0];
  const upgraded={...glyphs,ids:['z-a','y-b','a-c']};
  for(const path of ['settings.html','chalkboard.html?wallpaper=1','flat.html?wallpaper=1','meadow.html?wallpaper=1']){
   const {page,context}=await nativePage(path);
   await page.evaluate(({glyphs,names,isSettings})=>{
    if(isSettings){window.classdesk.receiveNative({t:'init',theme:'chalkboard',screen:{w:1920,h:1080},params:{chalkboard:{groupNames:names}}});window.classdesk.receiveNative(glyphs);}
    else{window.classdeskWallpaper.receive({t:'settings',v:{motion:false,groupNames:names}});window.classdeskWallpaper.receive(glyphs);}
   },{glyphs:upgraded,names:{[old.id]:'기존 저장 이름'},isSettings:path==='settings.html'});
   const state=await page.evaluate(()=>window.classdesk?.snapshot()||window.classdeskWallpaper.snapshot());
   assert.equal(state.groups.find(group=>group.id===old.id)?.label,'기존 저장 이름',path+' must retain an existing 0.1 name');
   assert.equal(state.catalog.groups.find(group=>group.id===old.id).colorIndex,old.colorIndex);
   await context.close();
  }
 });
}finally{
 await browser?.close();server.kill();
 await mkdir(new URL('../artifacts/qa/',import.meta.url),{recursive:true});
 await writeFile(new URL('../artifacts/qa/improvements.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed.length,failed:report.failed.length,errors:report.errors}));
 if(report.failed.length||report.errors.length)process.exitCode=1;
}
