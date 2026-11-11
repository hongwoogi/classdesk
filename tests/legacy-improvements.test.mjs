import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildScene} from '../prototype/school-layout.mjs';
import {reconcileGroups,sanitizeGroupCatalog} from '../prototype/school-scene-model.mjs';
import {renderLegacyLabels,measureLegacyLabels} from '../prototype/legacy-groups.mjs';

let labels = {};
try { labels = await import('../prototype/group-labels.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

const STATE = ['font','textAlign','textBaseline','fillStyle','globalAlpha','shadowBlur','shadowColor'];
function recordingContext() {
  const stack = [], calls = [];
  const ctx = {calls,font:'10px serif',textAlign:'start',textBaseline:'alphabetic',fillStyle:'red',globalAlpha:0.4};
  ctx.save = () => stack.push(Object.fromEntries(STATE.map(key => [key,ctx[key]])));
  ctx.restore = () => Object.assign(ctx,stack.pop());
  ctx.measureText = text => ({width:Array.from(text).length * 12,actualBoundingBoxAscent:11,actualBoundingBoxDescent:3});
  for (const method of ['beginPath','roundRect','fill','fillText','clearRect','setTransform']) {
    ctx[method] = (...args) => calls.push({method,args,...Object.fromEntries(STATE.map(key => [key,ctx[key]]))});
  }
  ctx.stackDepth = () => stack.length;
  return ctx;
}
const viewport = {width:800,height:600};
const group = (id='group-a',overrides={}) => ({id,label:'수업 자료',icons:[],bounds:{x:100,y:150,w:80,h:90},...overrides});
const scene = {icons:[],groups:[group()]};

test('shared legacy measurement matches the 22px pill and actual Canvas text placement without drawing', () => {
  assert.equal(typeof labels.layoutGroupLabels,'function');
  const ctx = recordingContext(), before = {...ctx};
  const measured = labels.layoutGroupLabels(ctx,{scene,...viewport,legacy:true});
  assert.equal(measured.length,1);
  const [label] = measured;
  assert.equal(label.id,'group-a');
  assert.equal(label.text,'수업 자료');
  assert.deepEqual(label.rect,[100,109,86,34]);
  assert.equal(label.textX,113);
  assert.equal(label.textY,126);
  assert.equal(label.textBaseline,'middle');
  assert.match(label.font,/600 22px Pretendard/);
  assert.equal(ctx.calls.length,0,'measurement never paints labels or duplicate pencils');
  assert.equal(ctx.font,before.font);
  assert.equal(ctx.stackDepth(),0);
  assert.deepEqual(renderLegacyLabels(ctx,{scene,...viewport}),['수업 자료']);
  const text = ctx.calls.find(call => call.method === 'fillText');
  const pill = ctx.calls.find(call => call.method === 'roundRect');
  assert.deepEqual(pill.args.slice(0,4),label.rect);
  assert.deepEqual(text.args.slice(0,3),[label.text,label.textX,label.textY]);
  assert.equal(text.font,label.font);
  assert.equal(text.textBaseline,label.textBaseline);
});

const intersects = (a,b) => a[2] > 0 && a[3] > 0 && b[2] > 0 && b[3] > 0
  && a[0] < b[0]+b[2] && a[0]+a[2] > b[0] && a[1] < b[1]+b[3] && a[1]+a[3] > b[1];
const inViewport = (rect,width,height) => rect.every(Number.isFinite) && rect.every(n => n >= 0)
  && rect[0]+rect[2] <= width && rect[1]+rect[3] <= height;

test('legacy measurement convenience API selects legacy pill metrics without a caller flag', () => {
  assert.deepEqual(measureLegacyLabels(recordingContext(),{scene,...viewport}),
    labels.layoutGroupLabels(recordingContext(),{scene,...viewport,legacy:true}));
});

test('pencils use safe alternate positions without intercepting any icon, label or other pencil', () => {
  const obstacle = {id:'private-file',name:'do-not-publish.xlsx',x:190,y:100,w:40,h:60};
  const input = {icons:[obstacle],groups:[group(),group('group-b',{bounds:{x:240,y:160,w:80,h:90}})]};
  for (const legacy of [true,false]) {
    const result = labels.layoutGroupLabels(recordingContext(),{scene:input,...viewport,legacy});
    assert.equal(result.length,2);
    result.forEach((label,index) => {
      assert.deepEqual(label.editRect.slice(2),[24,24],'a safe position must produce a physical 24px button');
      assert.ok(inViewport(label.editRect,viewport.width,viewport.height));
      assert.ok(!intersects(label.editRect,[obstacle.x,obstacle.y,obstacle.w,obstacle.h]));
      for (const other of result) assert.ok(!intersects(label.editRect,other.rect),'all text rectangles are reserved before placing pencils');
      for (const other of result.slice(index+1)) assert.ok(!intersects(label.editRect,other.editRect));
    });
    assert.ok(!JSON.stringify(result).includes('do-not-publish'));
    const blocked = labels.layoutGroupLabels(recordingContext(),{scene:{...input,icons:[{x:0,y:0,w:800,h:600}]},...viewport,legacy});
    assert.equal(blocked.length,2,'tray fallback keeps the label data');
    assert.ok(blocked.every(label => label.editRect.every(n => n === 0)));
  }
});

test('label metadata stays finite and inside tiny viewports while names and counts are bounded', () => {
  for (const legacy of [true,false]) for (const width of [1,9,23,64,320]) for (const height of [1,7,23,40]) {
    const input = {icons:[],groups:[group('group-long',{label:'모'.repeat(80),bounds:{x:900,y:800,w:1,h:1}})]};
    const before = JSON.stringify(input);
    const result = labels.layoutGroupLabels(recordingContext(),{scene:input,width,height,legacy});
    assert.equal(result.length,1);
    const [label] = result;
    assert.equal(Array.from(label.text).length,40);
    assert.ok(inViewport(label.rect,width,height),`${legacy}: ${width}x${height}: ${label.rect}`);
    assert.ok(inViewport(label.editRect,width,height));
    assert.ok([label.textX,label.textY,label.textMaxWidth].every(Number.isFinite));
    assert.equal(JSON.stringify(input),before);
  }
  const many = {icons:[],groups:Array.from({length:520},(_,i) => group('group-'+i))};
  assert.equal(labels.layoutGroupLabels(recordingContext(),{scene:many,...viewport}).length,500);
  for (const dimensions of [{width:0,height:10},{width:10,height:0},{width:NaN,height:10}]) {
    assert.deepEqual(labels.layoutGroupLabels(recordingContext(),{scene,...dimensions}),[]);
  }
  assert.deepEqual(labels.layoutGroupLabels(recordingContext(),{scene,...viewport,settings:{showLabels:false}}),[]);
  assert.deepEqual(labels.layoutGroupLabels(recordingContext(),{scene:{...scene,visible:false},...viewport}),[]);
});

test('exact margin-sized viewports still retain positive label rectangles for native tray fallback', () => {
  for (const legacy of [true,false]) for (const width of [8,16,36]) for (const height of [8,34,66]) {
    const [label] = labels.layoutGroupLabels(recordingContext(),{scene,width,height,legacy});
    assert.ok(label.rect[2]>0&&label.rect[3]>0,`${legacy} ${width}x${height}: ${label.rect}`);
    assert.ok(inViewport(label.rect,width,height));
  }
});

test('legacy fades use each group opacity without hiding unchanged labels or painting pencils', () => {
  const input = {icons:[],groups:[group('fixed'),group('fade',{opacity:0.25}),group('gone',{opacity:0})]};
  const ctx = recordingContext();
  assert.deepEqual(renderLegacyLabels(ctx,{scene:input,...viewport}),['수업 자료','수업 자료']);
  assert.deepEqual(ctx.calls.filter(call => call.method === 'fillText').map(call => call.globalAlpha),[1,0.25]);
  assert.equal(ctx.calls.filter(call => call.method === 'roundRect').length,2,'only label pills, never Canvas pencil buttons');
  assert.equal(ctx.globalAlpha,0.4);
  assert.equal(ctx.stackDepth(),0);
});

// Exercise the actual browser entry with real model/layout imports. The fake
// DOM/adapter records only its protocol; the original WebGL is parent-owned QA.
let importNumber = 0;
async function withLegacyHost(options,run) {
  const {theme='beach',preview=false,width=800,height=600,dpr=1,reduced=false,onReady,fontFailure=false} = options;
  const ctx = recordingContext(), sent = [], shader = [], pauses = [], parentSent = [];
  const events = new Map(), fontEvents = new Map(), nativeListeners = [], frames = new Map();
  let now = 0, frameID = 0;
  const addEvent = (map,name,callback) => map.set(name,[...(map.get(name)??[]),callback]);
  const win = {classdeskLegacy:{receive:message=>shader.push(structuredClone(message)),setPaused:value=>pauses.push(value)}};
  const parentWindow = preview ? {postMessage:(...args)=>parentSent.push(args)} : win;
  const dispatch = message => nativeListeners.forEach(callback=>callback({data:JSON.stringify(message)}));
  if (!preview) win.chrome = {webview:{addEventListener:(_name,callback)=>nativeListeners.push(callback),
    postMessage:message=>{sent.push(message);if(message==='ready')onReady?.(dispatch);}}};
  const canvas = {setAttribute(){},getContext:()=>ctx};
  const doc = {hidden:false,head:{append(){}},body:{append(){}},documentElement:{dataset:{}},
    createElement:kind=>kind==='canvas'?canvas:{},
    addEventListener:(name,callback)=>addEvent(events,name,callback),
    fonts:{load:async()=>{if(fontFailure)throw new Error('font unavailable');return [];},ready:Promise.resolve(),addEventListener:(name,callback)=>addEvent(fontEvents,name,callback)}};
  const globals = {window:win,parent:parentWindow,document:doc,
    location:{search:preview?'?classdeskPreview=1':'?wallpaper=1',pathname:theme==='beach'?'/flat.html':'/meadow.html',origin:'http://local.test'},
    innerWidth:width,innerHeight:height,devicePixelRatio:dpr,
    matchMedia:()=>({matches:reduced,addEventListener:(name,callback)=>addEvent(events,'media:'+name,callback)}),
    addEventListener:(name,callback)=>addEvent(events,name,callback),
    requestAnimationFrame:callback=>{frames.set(++frameID,callback);return frameID;},cancelAnimationFrame:id=>frames.delete(id),
    performance:{now:()=>now}};
  const previous = new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  try {
    const entry = new URL('../prototype/legacy-labels.mjs',import.meta.url);
    const source = (await readFile(entry,'utf8')).replace(/from (['"])(\.\/[^'"]+)\1/g,
      (_match,quote,path)=>`from ${quote}${new URL(path,entry).href}${quote}`);
    await import('data:text/javascript,'+encodeURIComponent(source)+'#test-'+(++importNumber));
    const api = win.classdeskWallpaper;
    await run({api,ctx,sent,shader,pauses,parentSent,dispatch,doc,
      states:()=>sent.filter(message=>message!=='ready').map(message=>JSON.parse(message)).filter(message=>message.t==='groupState'),
      advance(ms){now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));},
      fire(name,event={}){for(const callback of events.get(name)??[])callback(event);},
      fonts(){for(const callback of fontEvents.get('loadingdone')??[])callback();},
      resize(w,h){globalThis.innerWidth=w;globalThis.innerHeight=h;for(const callback of events.get('resize')??[])callback();},
      frameCount:()=>frames.size,parentWindow});
  } finally {
    for(const [key,descriptor] of previous) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
}
const hostIcons = {t:'icons',vis:true,r:[[100,150,164,226],[500,300,564,376]]};

test('originals apply a saved stable catalog before icons and keep identities through add/delete', async () => {
  const initial = reconcileGroups(buildScene([{id:'native-0',x:100,y:150,w:64,h:76},{id:'native-1',x:500,y:300,w:64,h:76}],viewport));
  const saved = {...initial.catalog,groups:initial.catalog.groups.map((record,i)=>({...record,id:'saved-'+i}))};
  for (const theme of ['beach','meadow']) await withLegacyHost({theme},async ({api}) => {
    api.receive({t:'settings',v:{motion:false,groupCatalog:saved,groupNames:Object.fromEntries(saved.groups.map(record=>[record.id,'저장된 '+record.id]))}});
    assert.deepEqual(api.snapshot().catalog,sanitizeGroupCatalog(saved),'startup must not reconcile an empty scene');
    api.receive(hostIcons);
    const before = api.snapshot();
    assert.deepEqual(before.groups.map(item=>item.id).sort(),saved.groups.map(item=>item.id).sort());
    assert.ok(before.groups.every(item=>item.label==='저장된 '+item.id));
    assert.ok(before.groups.every(item=>item.bounds&&item.hull));
    api.receive({t:'icons',vis:true,r:[[100,150,164,226],[180,150,244,226],[500,300,564,376]]});
    assert.deepEqual(api.snapshot().groups.map(item=>item.id),before.groups.map(item=>item.id));
    api.receive({t:'icons',vis:true,r:[[500,300,564,376]]});
    assert.equal(api.snapshot().groups[0].id,before.groups[1].id);
    assert.equal(api.snapshot().groups[0].label,before.groups[1].label);
  });
});

test('hidden icon packets clear only display labels and retain the active scene/catalog', async () => {
  await withLegacyHost({},async ({api}) => {
    api.receive({t:'settings',v:{motion:false}});api.receive(hostIcons);
    const before = api.snapshot(), catalog = JSON.stringify(before.catalog);
    api.receive({t:'icons',vis:false,r:[]});
    assert.equal(api.snapshot().iconCount,0);
    assert.equal(api.snapshot().groupCount,0);
    assert.deepEqual(api.snapshot().drawnLabels,[]);
    assert.equal(JSON.stringify(api.snapshot().catalog),catalog);
    api.receive({t:'settings',v:{groupNames:{[before.groups[0].id]:'숨김 중 편집'}}});
    assert.equal(JSON.stringify(api.snapshot().catalog),catalog);
    api.receive(hostIcons);
    assert.equal(api.snapshot().groups[0].id,before.groups[0].id);
    assert.equal(api.snapshot().groups[0].label,'숨김 중 편집');
  });
});

test('visual reset preserves names and catalog unless either field is explicitly supplied', async () => {
  await withLegacyHost({},async ({api}) => {
    api.receive({t:'settings',v:{motion:false,lineWidth:9}});api.receive(hostIcons);
    const id = api.snapshot().groups[0].id;
    api.receive({t:'settings',v:{groupNames:{[id]:'지키는 이름'}}});
    const catalog = JSON.stringify(api.snapshot().catalog);
    api.receive({t:'reset'});
    assert.equal(api.snapshot().settings.lineWidth,3);
    assert.equal(api.snapshot().groups[0].label,'지키는 이름');
    assert.equal(JSON.stringify(api.snapshot().catalog),catalog);
    api.receive({t:'reset',v:{groupNames:{[id]:'명시적으로 바꿈'}}});
    assert.equal(api.snapshot().groups[0].label,'명시적으로 바꿈');
  });
  await withLegacyHost({},async ({api}) => {
    const saved = {version:1,nextId:5,groups:[{id:'saved',members:['native-0'],bounds:{x:78,y:128,w:108,h:120},colorIndex:3,active:true}]};
    api.receive({t:'settings',v:{groupCatalog:saved,groupNames:{saved:'시작 전 이름'}}});
    api.receive({t:'reset'});
    assert.deepEqual(api.snapshot().catalog,saved);
    api.receive({t:'icons',vis:true,r:[hostIcons.r[0]]});
    assert.equal(api.snapshot().groups[0].label,'시작 전 이름');
  });
});

test('paused originals never redraw shaders for names/catalog/style packets or identical projected icons', async () => {
  for (const dpr of [1,1.25,2]) await withLegacyHost({dpr},async ({api,shader,pauses}) => {
    api.receive({t:'pause',v:true});api.receive(hostIcons);
    assert.deepEqual(shader.at(-1),hostIcons,'the original adapter receives the exact existing physical projection');
    const catalog = JSON.stringify(api.snapshot().catalog), id = api.snapshot().groups[0].id;
    shader.length=0;pauses.length=0;
    for (const v of [{groupNames:{[id]:'이름만 수정'}},{groupCatalog:api.snapshot().catalog},{waviness:1},{renderMode:'fill'},{texture:0.8},{showLabels:false}]) api.receive({t:'settings',v});
    api.receive(hostIcons);
    assert.equal(shader.length,0,'overlay-only settings never enter the original adapter');
    assert.equal(pauses.length,0,'setPaused(true) would force an expensive static WebGL draw');
    assert.equal(JSON.stringify(api.snapshot().catalog),catalog);
    api.receive({t:'settings',v:{sigma:42}});
    assert.equal(shader.at(-1).v.sigma,42,'real original-shader settings still pass through');
    assert.equal(pauses.length,1);
    api.receive({t:'icons',vis:true,r:[[110,150,174,226],hostIcons.r[1]]});
    assert.ok(Math.abs(shader.at(-1).r[0][0]-110)<1e-10);
    assert.equal(pauses.length,2,'real geometry updates settle a paused original');
  });
});

test('260ms label motion keeps unchanged labels fixed and restarts from the current displayed geometry', async () => {
  for (const theme of ['beach','meadow']) await withLegacyHost({theme},async ({api,advance,frameCount}) => {
    api.receive({t:'settings',v:{motion:false}});api.receive(hostIcons);
    const original = api.snapshot();
    api.receive({t:'settings',v:{motion:true}});
    api.receive({t:'icons',vis:true,r:[[150,150,214,226],hostIcons.r[1]]});
    assert.equal(api.snapshot().transition?.active,true,'geometry changes need an independent label transition');
    assert.deepEqual(api.snapshot().drawnLabels,original.drawnLabels,'old labels never all blink off');
    assert.deepEqual(api.snapshot().displayGroups[0].bounds,original.groups[0].bounds);
    advance(130);
    const middle = api.snapshot();
    assert.equal(middle.transition.progress,0.5);
    assert.deepEqual(middle.displayGroups[1].bounds,original.groups[1].bounds);
    assert.deepEqual(middle.displayGroups[1].hull,original.groups[1].hull);
    const expectedX = original.groups[0].bounds.x+(middle.groups[0].bounds.x-original.groups[0].bounds.x)*0.875;
    assert.ok(Math.abs(middle.displayGroups[0].bounds.x-expectedX)<1e-8,'cubic ease-out');
    api.receive({t:'icons',vis:true,r:[[180,150,244,226],hostIcons.r[1]]});
    assert.deepEqual(api.snapshot().displayGroups[0].bounds,middle.displayGroups[0].bounds,'no snap to either earlier target');
    assert.deepEqual(api.snapshot().drawnLabels,original.drawnLabels);
    advance(260);
    const final = api.snapshot();
    assert.deepEqual(final.transition,{active:false,progress:1});
    assert.deepEqual(final.displayGroups.map(item=>item.bounds),final.groups.map(item=>item.bounds));
    assert.deepEqual(final.displayGroups.map(item=>item.hull),final.groups.map(item=>item.hull));
    assert.equal(frameCount(),0,'no continuing label animation after settling');
  });
});

test('native groupState publishes measured physical labels after ready/fonts/resize and deduplicates echoes', async () => {
  for (const theme of ['beach','meadow']) await withLegacyHost({theme,onReady:dispatch=>{
    dispatch({t:'settings',v:{motion:false}});dispatch(hostIcons);
  }},async ({api,sent,states,fonts,ctx,resize}) => {
    assert.equal(sent.filter(message=>message==='ready').length,1);
    assert.ok(states().length>0,'the actual native bridge must receive groupState');
    let state = states().at(-1);
    assert.equal(state.theme,theme);
    assert.deepEqual(state.catalog,api.snapshot().catalog);
    assert.deepEqual(state.labels,api.snapshot().labels);
    assert.equal(state.labels.length,2);
    assert.equal(typeof sent.at(-1),'string','WebView2 protocol is a JSON string');
    for (const label of state.labels) {
      assert.ok(inViewport(label.rect,800,600));assert.ok(inViewport(label.editRect,800,600));
      for (const rect of hostIcons.r) assert.ok(!intersects(label.editRect,[rect[0],rect[1],rect[2]-rect[0],rect[3]-rect[1]]));
    }
    const count = states().length;
    api.receive({t:'settings',v:{groupCatalog:state.catalog}});api.receive(hostIcons);fonts();
    assert.equal(states().length,count,'identical catalogs, icon packets and measurements cause no refresh feedback');
    ctx.measureText = text=>({width:Array.from(text).length*18,actualBoundingBoxAscent:11,actualBoundingBoxDescent:3});
    fonts();
    assert.equal(states().length,count+1,'late font metrics must update native hit rectangles');
    const beforeHidden = JSON.stringify(api.snapshot().catalog);
    api.receive({t:'icons',vis:false,r:[]});state=states().at(-1);
    assert.deepEqual(state.labels,[]);assert.equal(JSON.stringify(state.catalog),beforeHidden);
    api.receive(hostIcons);api.receive({t:'settings',v:{showLabels:false}});
    assert.deepEqual(states().at(-1).labels,[]);
    assert.equal(JSON.stringify(states().at(-1).catalog),beforeHidden);
    api.receive({t:'settings',v:{showLabels:true}});
    const beforeResize = states().length;resize(520,420);
    assert.ok(states().length>beforeResize);
    assert.ok(states().at(-1).labels.every(label=>inViewport(label.rect,520,420)&&inViewport(label.editRect,520,420)));
  });
});

test('a failed custom font still completes ready with fallback metrics and reduced-motion labels', async () => {
  let completed=false, failure;
  await withLegacyHost({fontFailure:true,reduced:true,onReady:dispatch=>dispatch(hostIcons)},async ({api,sent,states,frameCount}) => {
    assert.equal(sent.filter(message=>message==='ready').length,1);
    assert.equal(api.snapshot().paused,true);
    assert.deepEqual(api.snapshot().transition,{active:false,progress:1});
    assert.equal(states().at(-1).labels.length,2);
    assert.equal(frameCount(),0);completed=true;
  }).catch(error=>{failure=error.message;});
  assert.equal(failure,undefined,'font failure must not block the native handshake');
  assert.equal(completed,true);
});

test('native publishing clears stale buttons once, then publishes target labels only when motion settles', async () => {
  await withLegacyHost({},async ({api,states,advance}) => {
    api.receive({t:'settings',v:{motion:false}});api.receive(hostIcons);
    api.receive({t:'settings',v:{motion:true}});
    api.receive({t:'icons',vis:true,r:[hostIcons.r[1]]});
    const moving = api.snapshot(), sentAtStart = states().length;
    assert.equal(moving.transition.active,true);
    assert.deepEqual(states().at(-1).labels,[],'stale native click targets must not cover newly moved OS icons');
    advance(65);
    const quarter = api.snapshot(), retired = quarter.displayGroups.find(item=>item.id===moving.displayGroups[0].id);
    assert.ok(retired.opacity>0&&retired.opacity<1);
    assert.ok(quarter.drawnLabels.length>0,'retired labels fade rather than disappear at once');
    api.receive({t:'settings',v:{groupCatalog:quarter.catalog}});
    assert.equal(api.snapshot().transition.progress,quarter.transition.progress,'a catalog echo must not restart motion');
    advance(65);advance(65);
    assert.equal(states().length,sentAtStart,'no native messages on individual animation frames');
    advance(65);
    assert.equal(api.snapshot().transition.active,false);
    assert.equal(states().length,sentAtStart+1);
    assert.deepEqual(states().at(-1).labels,api.snapshot().labels);
    const beforeAdd = api.snapshot().groups.length;
    api.receive({t:'icons',vis:true,r:[hostIcons.r[1],[100,150,164,226]]});
    advance(65);
    assert.equal(api.snapshot().groups.length,beforeAdd+1);
    const newborn = api.snapshot().displayGroups.find(item=>!moving.groups.some(old=>old.id===item.id));
    assert.ok(newborn.opacity>0&&newborn.opacity<1);
    api.receive({t:'pause',v:true});
    assert.deepEqual(api.snapshot().transition,{active:false,progress:1});
    assert.deepEqual(states().at(-1).labels,api.snapshot().labels);
  });
});

test('preview iframes send only ready, validate parent origin/source, and never send group metadata', async () => {
  await withLegacyHost({preview:true},async ({api,parentSent,sent,fire,parentWindow,shader}) => {
    assert.deepEqual(parentSent,[[{t:'ready'},'http://local.test']]);
    fire('message',{origin:'http://untrusted.test',source:parentWindow,data:hostIcons});
    fire('message',{origin:'http://local.test',source:{},data:hostIcons});
    assert.equal(api.snapshot().iconCount,0);
    fire('message',{origin:'http://local.test',source:parentWindow,data:hostIcons});
    api.receive({t:'settings',v:{groupCatalog:api.snapshot().catalog,groupNames:{[api.snapshot().groups[0].id]:'부모의 이름'}}});
    assert.equal(api.snapshot().iconCount,2);
    assert.deepEqual(shader.at(-1),hostIcons);
    assert.deepEqual(api.snapshot().drawnLabels,[],'parent paints the preview labels');
    assert.deepEqual(parentSent,[[{t:'ready'},'http://local.test']]);
    assert.deepEqual(sent,[]);
  });
});

test('raw startup names survive hidden/style/reset packets before all 500 active groups are known', async () => {
  const physical = {width:4000,height:3200};
  const icons = Array.from({length:500},(_,i)=>({id:'native-'+i,x:(i%25)*150+30,y:Math.floor(i/25)*150+60,w:64,h:76}));
  const raw = buildScene(icons,physical,{groupGap:0});
  const catalog = reconcileGroups(raw).catalog;
  const groupNames = Object.fromEntries([...Array.from({length:512},(_,i)=>['old-'+i,'옛 이름']),
    ...raw.groups.map((item,i)=>[item.id,('현재 모둠 '+i).padEnd(40,'가')])]);
  await withLegacyHost(physical,async ({api,states}) => {
    api.receive({t:'settings',v:{motion:false,groupGap:0,groupNames,groupCatalog:catalog}});
    api.receive({t:'icons',vis:false,r:[]});
    api.receive({t:'settings',v:{texture:0.2}});api.receive({t:'reset',v:{motion:false,groupGap:0}});
    assert.deepEqual(api.snapshot().catalog,catalog);
    api.receive({t:'icons',vis:true,r:icons.map(item=>[item.x,item.y,item.x+item.w,item.y+item.h])});
    const result = api.snapshot(), state = states().at(-1);
    assert.equal(result.groupCount,500);assert.equal(state.labels.length,500);
    assert.equal(result.catalog.groups.filter(item=>item.active).length,500);
    assert.ok(Object.keys(result.settings.groupNames).length<=512);
    for (const item of result.groups) assert.equal(item.label,groupNames[item.id]);
    state.labels.forEach((label,index)=>{
      assert.equal(Array.from(label.text).length,40);
      assert.ok(inViewport(label.rect,physical.width,physical.height));
      assert.ok(inViewport(label.editRect,physical.width,physical.height));
      for (const icon of icons) assert.ok(!intersects(label.editRect,[icon.x,icon.y,icon.w,icon.h]));
      for (const other of state.labels) assert.ok(!intersects(label.editRect,other.rect));
      for (const other of state.labels.slice(index+1)) assert.ok(!intersects(label.editRect,other.editRect));
    });
  });
});

test('school labels retain default 500 16px alphabetic placement, scale with labelSize and surround measured text', () => {
  const ctx = recordingContext();
  const [label] = labels.layoutGroupLabels(ctx,{scene,...viewport});
  assert.equal(label.font,labels.LABEL_FONT);
  assert.match(label.font,/500 16px "Pretendard"/);
  assert.equal(label.textBaseline,'alphabetic');
  assert.equal(label.textX,106);
  assert.equal(label.textY,138);
  assert.deepEqual(label.rect,[106,127,60,14]);
  assert.equal(ctx.calls.length,0);
  assert.equal(ctx.stackDepth(),0);
  const [large] = labels.layoutGroupLabels(ctx,{scene,...viewport,settings:{labelSize:24}});
  assert.match(large.font,/500 24px "Pretendard"/);
  const [legacyLarge] = labels.layoutGroupLabels(ctx,{scene,...viewport,legacy:true,settings:{labelSize:24}});
  assert.match(legacyLarge.font,/600 33px Pretendard/);
  assert.ok(legacyLarge.rect[3] > 34);
});
