import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),base='http://127.0.0.1:5194';
const server=spawn(process.execPath,['prototype/serve.mjs'],{cwd:root,env:{...process.env,PORT:'5194'},stdio:'pipe'});
const report={passed:[],failed:[],errors:[]};let browser;
const screen={w:1920,h:1080},one={t:'icons',vis:true,ids:['student-area'],r:[[800,430,896,526]]};
async function check(name,fn){if(process.env.QA_ONLY&&!name.includes(process.env.QA_ONLY))return;try{await fn();report.passed.push(name);console.log('PASS',name);}catch(error){report.failed.push({name,error:error.stack});console.error('FAIL',name,error.stack);}}
async function open(path='playground.html?wallpaper=1',{clock=false,dpr=1}={}){
 const context=await browser.newContext({viewport:{width:1920/dpr,height:1080/dpr},deviceScaleFactor:dpr});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(({clock})=>{
  window.__sent=[];window.chrome={webview:{postMessage:value=>window.__sent.push(value),addEventListener:()=>{}}};
  if(clock){let id=0;const jobs=new Map();window.__time=0;Object.defineProperty(performance,'now',{value:()=>window.__time});window.requestAnimationFrame=fn=>{jobs.set(++id,fn);return id;};window.cancelAnimationFrame=id=>jobs.delete(id);window.__step=ms=>{window.__time+=ms;const callbacks=[...jobs.values()];jobs.clear();for(const fn of callbacks)fn(window.__time);};}
 },{clock});
 await page.goto(base+'/'+path);await page.waitForSelector('html[data-ready=true]');
 return {context,page};
}
const configure=(page,settings={})=>page.evaluate(settings=>window.classdeskWallpaper.receive({t:'settings',v:{motion:false,texture:0,waviness:0,showLabels:false,padding:64,...settings}}),settings);
const send=(page,message)=>page.evaluate(message=>window.classdeskWallpaper.receive(message),message);
async function pixels(page,rect=[0,0,1920,1080]){
 return page.evaluate(async rect=>{const canvas=document.getElementById('wallpaper'),data=canvas.getContext('2d').getImageData(...rect).data;let dark=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&Math.max(data[i],data[i+1],data[i+2])<115)dark++;return {dark,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).join(',')};},rect);
}
try{
 for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===79)throw Error('Playground server unavailable');await new Promise(r=>setTimeout(r,100));}
 const executablePath=[chromium.executablePath(),'/snap/chromium/current/usr/lib/chromium-browser/chrome','/usr/bin/chromium'].find(existsSync);
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
 await check('playground has readable overlapping students and stays deterministic when motion is off',async()=>{
  const {page,context}=await open();await configure(page);await send(page,{t:'icons',vis:true,r:[],ids:[]});
  const before=await pixels(page);assert.ok(before.dark>12000,'empty playground must contain a lively student crowd, not plain dirt');
  await send(page,{t:'icons',vis:true,r:[],ids:[]});assert.equal((await pixels(page)).hash,before.hash,'students must not reshuffle on messages when motion is off');
  await context.close();
 });
 await check('students walk around overlapping one another and step aside when an icon is placed',async()=>{
  const {page,context}=await open('playground.html?wallpaper=1',{clock:true});
  await configure(page,{motion:true,padding:48});
  await send(page,{t:'icons',vis:true,r:[],ids:[]});
  const first=await pixels(page);
  for(let i=0;i<30;i++)await page.evaluate(()=>window.__step(33));
  const walked=await pixels(page);
  assert.notEqual(walked.hash,first.hash,'students must walk continuously when motion is enabled');
  await send(page,one);
  for(let i=0;i<90;i++)await page.evaluate(()=>window.__step(33));
  assert.equal((await pixels(page,[784,414,128,128])).dark,0,'students inside the icon area must walk aside');
  for(let i=0;i<30;i++)await page.evaluate(()=>window.__step(33));
  assert.equal((await pixels(page,[784,414,128,128])).dark,0,'walking students must continue routing around the icon');
  await context.close();
 });
 await check('all boundary modes keep students out of icon areas without group borders at both native DPI scales',async()=>{
  for(const dpr of [1,2]){
   const {page,context}=await open('playground.html?wallpaper=1',{dpr});
   for(const padding of [8,22,64])for(const waviness of [0,1])for(const renderMode of ['outline','fill','both']){await configure(page,{padding,waviness,renderMode});await send(page,one);assert.equal((await pixels(page,[800,430,96,96])).dark,0,renderMode+' must still clear the glyph at padding '+padding+', waviness '+waviness+', DPR '+dpr);}
   await send(page,{t:'icons',vis:false,r:[],ids:[]});assert.ok((await pixels(page)).dark>12000,'hidden desktop returns the full crowd');
   await context.close();
  }
 });
 await check('settings preview and exported PNG contain the student crowd and clear icon floor without borders',async()=>{
  const {page,context}=await open('settings.html');
  await page.evaluate(({screen,one})=>{window.classdesk.receiveNative({t:'init',theme:'playground',screen,params:{playground:{motion:false,texture:0,waviness:0,padding:64,showLabels:false}}});window.classdesk.receiveNative(one);},{screen,one});
  const preview=await page.evaluate(()=>{const c=document.getElementById('scene-canvas'),ctx=c.getContext('2d'),p=ctx.getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<p.length;i+=4)if(p[i+3]&&Math.max(p[i],p[i+1],p[i+2])<115)dark++;return {dark,theme:window.classdesk.snapshot().theme};});
  assert.equal(preview.theme,'playground');assert.ok(preview.dark>3000,'preview must use the actual student renderer');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-button').click()]);
  await mkdir(new URL('../artifacts/qa/',import.meta.url),{recursive:true});
  const path=fileURLToPath(new URL('../artifacts/qa/playground-export.png',import.meta.url));await download.saveAs(path);
  const exported=await page.evaluate(async data=>{const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const count=rect=>{const data=ctx.getImageData(...rect).data;let dark=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&Math.max(data[i],data[i+1],data[i+2])<115)dark++;return dark;};return {width:c.width,height:c.height,all:count([0,0,c.width,c.height]),inside:count([800,430,96,96])};},'data:image/png;base64,'+(await readFile(path)).toString('base64'));
  assert.equal(exported.width,1920);assert.equal(exported.height,1080);
  assert.ok(exported.all>12000,'the actually downloaded PNG must include the crowd');
  assert.equal(exported.inside,0,'download must leave real icon space empty, not bake student figures or duplicate file glyphs into it');
  await context.close();
 });
 await check('500 independent playground icons stay within a bounded warm render budget',async()=>{
  const {page,context}=await open();
  const timing=await page.evaluate(async()=>{const {buildScene}=await import('/school-layout.mjs'),{renderSchoolScene}=await import('/school-renderer.mjs');const scene=buildScene(Array.from({length:500},(_,i)=>({id:'perf-'+i,x:40+(i%25)*130,y:40+Math.floor(i/25)*100,w:32,h:32})),{width:3840,height:2160},{groupGap:0,padding:8});const c=document.createElement('canvas');c.width=3840;c.height=2160;const ctx=c.getContext('2d'),times=[];for(let i=0;i<4;i++){const start=performance.now();renderSchoolScene(ctx,{theme:'playground',width:3840,height:2160,scene,settings:{groupGap:0,padding:8,texture:0,waviness:0,showLabels:false,motion:false}});times.push(performance.now()-start);}return {groups:scene.groups.length,renderMs:times,warmMedianMs:times.slice(1).sort((a,b)=>a-b)[1]};});
  report.timing=timing;assert.equal(timing.groups,500);assert.ok(timing.warmMedianMs<400,'bounded playground render budget: '+JSON.stringify(timing));
  await context.close();
 });
}finally{
 await browser?.close();server.kill();await mkdir(new URL('../artifacts/qa/',import.meta.url),{recursive:true});
 await writeFile(new URL('../artifacts/qa/playground.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed.length,failed:report.failed.length,errors:report.errors}));if(report.failed.length||report.errors.length)process.exitCode=1;
}
