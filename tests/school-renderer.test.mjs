import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../prototype/school-layout.mjs';

let renderSchoolScene;
try { ({ renderSchoolScene } = await import('../prototype/school-renderer.mjs')); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

// A recording Canvas contract, not a substitute for the parent browser/pixel QA.
const STATE = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'lineCap', 'lineJoin',
  'font', 'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
  'filter', 'lineDashOffset', 'globalCompositeOperation'];
function recordingContext() {
  const calls = [];
  const stack = [];
  const ctx = { calls, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: 'transparent',
    shadowOffsetX: 0, shadowOffsetY: 0, filter: 'none', lineDashOffset: 0,
    globalCompositeOperation: 'source-over' };
  const record = (op, args) => calls.push({ op, args, ...Object.fromEntries(STATE.map(key => [key, ctx[key]])) });
  ctx.save = () => { stack.push(Object.fromEntries(STATE.map(key => [key, ctx[key]]))); record('save', []); };
  ctx.restore = () => { assert.ok(stack.length, 'restore must match save'); Object.assign(ctx, stack.pop()); record('restore', []); };
  for (const method of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse',
    'rect', 'roundRect', 'fillRect', 'strokeRect', 'clearRect', 'stroke', 'fill', 'clip', 'translate', 'scale',
    'rotate', 'setLineDash', 'fillText', 'drawImage']) {
    ctx[method] = (...args) => {
      for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${method} received nonfinite geometry`);
      if (method === 'arc') assert.ok(args[2] >= 0, 'nonnegative arc radius');
      record(method, args);
    };
  }
  for (const method of ['createLinearGradient', 'createRadialGradient']) {
    ctx[method] = (...args) => {
      const gradient = { kind: method, args, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
      record(method, args);
      return gradient;
    };
  }
  ctx.measureText = text => ({ width: String(text).length * 8 });
  ctx.stackDepth = () => stack.length;
  return ctx;
}
const width = 1440;
const height = 900;
const icons = [{ id: 'a', x: 180, y: 200, w: 64, h: 76, name: '비공개_학생명단.xlsx', type: 'sheet' },
  { id: 'b', x: 280, y: 200, w: 64, h: 76, name: '실제_파일명.hwp' }];
const scene = buildScene(icons, { width, height });
const draw = (ctx, options = {}) => renderSchoolScene(ctx, { width, height, scene, theme: 'chalkboard', ...options });

test('chalkboard renders pine surface, chalk hulls, and labels without owning any icons', () => {
  assert.equal(typeof renderSchoolScene, 'function');
  assert.equal(typeof globalThis.document, 'undefined');
  const ctx = recordingContext();
  const before = Object.fromEntries(STATE.map(key => [key, ctx[key]]));
  draw(ctx);
  assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#1c4036'));
  assert.ok(ctx.calls.some(call => call.op === 'stroke' && call.lineWidth >= 3));
  assert.deepEqual(ctx.calls.filter(call => call.op === 'fillText').map(call => call.args[0]), ['1모둠']);
  assert.ok(!JSON.stringify(ctx.calls).includes('비공개_학생명단'));
  assert.ok(!JSON.stringify(ctx.calls).includes('실제_파일명'));
  assert.equal(ctx.stackDepth(), 0);
  assert.deepEqual(Object.fromEntries(STATE.map(key => [key, ctx[key]])), before);
  const again = recordingContext();
  draw(again);
  assert.equal(JSON.stringify(again.calls), JSON.stringify(ctx.calls), 'static rendering must be reproducible');
  const noLabels = recordingContext();
  draw(noLabels, { settings: { showLabels: false } });
  assert.equal(noLabels.calls.filter(call => call.op === 'fillText').length, 0);
  const empty = recordingContext();
  draw(empty, { scene: { icons: [], groups: [] } });
  assert.equal(empty.calls.filter(call => call.op === 'fillText').length, 0);
});

test('playground has ochre granular dirt, a running track, faded sport lines, students and no group boundary', () => {
  for (const renderMode of ['outline', 'fill', 'both']) {
    const ctx = recordingContext();
    draw(ctx, { theme: 'playground', settings: { renderMode, waviness: .8 } });
    assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#d7c39c'));
    assert.ok(!ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#1c4036'));
    assert.ok(ctx.calls.some(call => call.op === 'stroke' && call.lineWidth >= 60), 'broad oval running track');
    assert.ok(ctx.calls.some(call => call.op === 'arc' && call.args[2] > 50), 'sports center circle');
    assert.ok(!ctx.calls.some(call => call.op === 'stroke' && call.strokeStyle === '#faf4df'), renderMode + ': no chalk boundary');
    assert.ok(!ctx.calls.some(call => call.op === 'fill' && call.globalAlpha === .18), renderMode + ': no tinted group area');
    assert.ok(!ctx.calls.some(call => call.op === 'clip' && call !== ctx.calls.find(c => c.op === 'clip')), 'no clearing clip per group');
    assert.ok(ctx.calls.filter(call => call.op === 'fillRect').length > 900, 'pixel-art student sprites and details are painted');
    assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#f28482'), 'cute pixel-art cheek blush is painted');
    assert.ok(ctx.calls.some(call => call.op === 'fillText' && call.fillStyle === '#4b4e43'), 'group names remain readable');
    assert.equal(ctx.stackDepth(), 0);
  }
  for (const renderMode of ['outline', 'fill', 'both']) {
    const withBoundary = recordingContext();
    draw(withBoundary, { theme: 'playground', settings: { playgroundBoundary: true, renderMode, waviness: .5, roundBoundary: .4 } });
    const strokes = withBoundary.calls.filter(call => call.op === 'stroke' && call.strokeStyle === '#faf4df');
    const fills = withBoundary.calls.filter(call => call.op === 'fill' && call.globalAlpha === .18);
    assert.equal(strokes.length > 0, renderMode !== 'fill', renderMode + ': playgroundBoundary draws lime chalk outline');
    assert.equal(fills.length, renderMode === 'outline' ? 0 : 1, renderMode + ': playgroundBoundary fills group area');
    assert.equal(withBoundary.stackDepth(), 0);
  }
});

test('playground draws a supplied live crowd at its current positions, behind the group names', async () => {
  const { createPlaygroundCrowd, stepPlaygroundCrowd, setPlaygroundObstacles } = await import('../prototype/playground-crowd.mjs');
  const crowd = createPlaygroundCrowd(width, height);
  setPlaygroundObstacles(crowd, scene.icons, { clearance: 22, instant: true });
  const cheeks = ctx => ctx.calls.filter(call => call.op === 'fillRect' && call.fillStyle === '#f28482').map(call => call.args.slice(0, 2).join(','));
  const before = recordingContext(); draw(before, { theme: 'playground', crowd });
  for (let i = 0; i < 60; i++) stepPlaygroundCrowd(crowd, 1 / 30);
  const after = recordingContext(); draw(after, { theme: 'playground', crowd });
  assert.notDeepEqual(cheeks(after), cheeks(before), 'walking students are redrawn where they are now');
  const lastFigure = after.calls.findLastIndex(call => call.op === 'fillRect' && call.fillStyle === '#f28482');
  const label = after.calls.findIndex(call => call.op === 'fillText');
  assert.ok(label > lastFigure, 'names are painted over walking students');
  const still = recordingContext(); draw(still, { theme: 'playground' });
  const again = recordingContext(); draw(again, { theme: 'playground' });
  assert.equal(JSON.stringify(still.calls), JSON.stringify(again.calls), 'without a live crowd the still frame is reproducible');
});

test('gym renders staggered honey wood and muted multicolor masking tape without glow', () => {
  const ctx = recordingContext();
  const multiScene = buildScene([icons[0], { ...icons[1], x: 650 }, { ...icons[1], id: 'c', x: 1000 }], { width, height });
  draw(ctx, { theme: 'gym', scene: multiScene });
  assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#cfa86e'));
  assert.ok(ctx.calls.filter(call => call.op === 'fillRect' && call.args[2] > 150 && call.args[3] <= 44).length > 60, 'individual top-down planks');
  const tape = ctx.calls.filter(call => call.op === 'stroke' && call.lineWidth >= 7 && /^#[0-9a-f]{6}$/.test(call.strokeStyle));
  assert.ok(tape.length >= 8, 'tape is laid in overlapping segments');
  assert.ok(new Set(tape.map(call => call.strokeStyle)).size >= 2, 'groups receive distinct tape colors');
  assert.ok(ctx.calls.every(call => call.shadowBlur === 0));
  assert.ok(!JSON.stringify(ctx.calls).includes('비공개_학생명단'));
  assert.equal(ctx.stackDepth(), 0);
});

test('classroom is an architectural plan with one square desk per icon and restrained grouping', () => {
  const ctx = recordingContext();
  draw(ctx, { theme: 'classroom' });
  assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#f2eee4'));
  assert.ok(ctx.calls.some(call => call.op === 'fillRect' && call.fillStyle === '#34574b'), 'top chalkboard');
  assert.ok(ctx.calls.some(call => call.op === 'arc' && call.args[2] === 82), 'door swing arc');
  const desks = ctx.calls.filter(call => call.op === 'fillRect' && call.fillStyle === '#e3d2b0');
  assert.equal(desks.length, icons.length);
  desks.forEach((desk, index) => {
    assert.equal(desk.args[2], desk.args[3], 'each student desk is square, not a generic group card');
    const item = icons[index];
    assert.ok(desk.args[0] <= item.x && desk.args[1] <= item.y);
    assert.ok(desk.args[0] + desk.args[2] >= item.x + item.w);
    assert.ok(desk.args[1] + desk.args[3] >= item.y + item.h);
  });
  assert.ok(ctx.calls.some(call => call.op === 'setLineDash' && call.args[0].length > 0), 'subtle group mat/border');
  assert.ok(!JSON.stringify(ctx.calls).includes('실제_파일명'));
  const empty = recordingContext();
  draw(empty, { theme: 'classroom', scene: { icons: [], groups: [] } });
  assert.equal(empty.calls.filter(call => call.op === 'fillRect' && call.fillStyle === '#e3d2b0').length, 0);
  assert.equal(ctx.stackDepth(), 0);
});

test('reveal progress draws only the requested boundary fraction and reduced motion stays complete', () => {
  for (const theme of ['chalkboard', 'playground', 'gym', 'classroom']) {
    const calls = progress => {
      const ctx = recordingContext();
      draw(ctx, { theme, progress, settings: { texture: 0, showLabels: true } });
      return ctx.calls;
    };
    const zero = calls(0);
    const empty = recordingContext();
    // Playground students avoid icons (not group outlines), so they stay part of the background.
    draw(empty, { theme, scene: { icons: theme === 'playground' ? scene.icons : [], groups: [] }, settings: { texture: 0 } });
    assert.equal(JSON.stringify(zero), JSON.stringify(empty.calls), `${theme}: zero progress is only the background`);
    const partial = calls(0.35);
    const full = calls(1);
    if (theme !== 'playground') assert.ok(partial.filter(call => call.op === 'lineTo').length < full.filter(call => call.op === 'lineTo').length, `${theme}: partial perimeter`);
    assert.equal(partial.filter(call => call.op === 'fillText').length, 0, 'labels appear after their outline');
    assert.equal(full.filter(call => call.op === 'fillText').length, 1);
    assert.equal(JSON.stringify(calls(5)), JSON.stringify(full), 'progress is clamped');
    assert.equal(JSON.stringify(calls(-1)), JSON.stringify(zero));
    assert.equal(JSON.stringify(calls(NaN)), JSON.stringify(full));
    const reduced = recordingContext();
    draw(reduced, { theme, progress: 0, settings: { texture: 0, motion: false } });
    assert.equal(reduced.calls.filter(call => call.op === 'fillText').length, 1);
  }
});

test('playground caches the dirt once and stamps students from one reusable sprite sheet per frame',async()=>{
 const {createPlaygroundCrowd,stepPlaygroundCrowd,setPlaygroundObstacles}=await import('../prototype/playground-crowd.mjs');
 const previous=globalThis.OffscreenCanvas,surfaces=[],contexts=new WeakMap();
 globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;surfaces.push(this);contexts.set(this,recordingContext());}getContext(){return contexts.get(this);}};
 try{
  const crowd=createPlaygroundCrowd(width,height);setPlaygroundObstacles(crowd,scene.icons,{clearance:22,instant:true});
  const ctx=recordingContext();draw(ctx,{theme:'playground',crowd,settings:{texture:.5}});
  assert.equal(surfaces.length,2,'one dirt surface and one student sprite sheet');
  const counts=surfaces.map(surface=>contexts.get(surface).calls.length);
  const stamps=ctx.calls.filter(call=>call.op==='drawImage'&&call.args.length===9&&call.args[0]!==surfaces[0]);
  assert.equal(stamps.length,crowd.students.filter(s=>!s.hidden).length,'one sprite stamp per visible student');
  assert.ok(stamps.every(call=>call.args[7]<width/8&&call.args[8]<height/8),'small sprites, never full-screen blits per student');
  for(let frame=0;frame<20;frame++){stepPlaygroundCrowd(crowd,1/30);draw(ctx,{theme:'playground',crowd,settings:{texture:.5,waviness:.8,renderMode:'both'}});}
  assert.equal(surfaces.length,2,'walking frames reuse the cached dirt and sprite sheet');
  assert.deepEqual(surfaces.map(surface=>contexts.get(surface).calls.length),counts,'static background is never regenerated per frame');
  assert.equal(ctx.stackDepth(),0);
 }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});

test('static surfaces are cached per context, geometry, theme and texture but not outline settings', () => {
  const previous = globalThis.OffscreenCanvas;
  const surfaces = [];
  const contexts = new WeakMap();
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; surfaces.push(this); contexts.set(this, recordingContext()); }
    getContext(kind) { assert.equal(kind, '2d'); return contexts.get(this); }
  };
  try {
    const ctx = recordingContext();
    const options = { scene: { icons: [], groups: [] }, settings: { texture: 0.5 } };
    draw(ctx, options);
    assert.equal(surfaces.length, 1, 'first draw rasterizes an isolated static surface');
    const firstCount = contexts.get(surfaces[0]).calls.length;
    draw(ctx, options);
    assert.equal(surfaces.length, 1, 'repeat draw reuses the surface');
    assert.equal(contexts.get(surfaces[0]).calls.length, firstCount, 'grain is not regenerated per frame');
    assert.equal(ctx.calls.filter(call => call.op === 'drawImage').length, 2);
    draw(ctx, { ...options, settings: { texture: 0.5, lineWidth: 7, showLabels: false } });
    assert.equal(surfaces.length, 1);
    draw(ctx, { ...options, settings: { texture: 0.25 } });
    draw(ctx, { ...options, width: 1200 });
    draw(ctx, { ...options, theme: 'gym' });
    draw(recordingContext(), options);
    assert.equal(surfaces.length, 5, 'invalidate on texture, size, theme, or a different context');
    draw(ctx, { ...options, width: 32768, height: 32768 });
    const last = surfaces.at(-1);
    assert.ok(last.width <= 4096 && last.height <= 4096 && last.width * last.height <= 8388608);
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});

test('transition opacity fades only the changing group, never the whole wallpaper',()=>{
 const silent=recordingContext(),empty=recordingContext();
 draw(silent,{scene:{...scene,groups:scene.groups.map(group=>({...group,opacity:0}))}});
 draw(empty,{scene:{icons:scene.icons,groups:[]}});
 assert.ok(JSON.stringify(silent.calls)===JSON.stringify(empty.calls),'a zero-opacity group is absent but the material remains');
 const half=recordingContext();draw(half,{scene:{...scene,groups:scene.groups.map(group=>({...group,opacity:.5}))}});
 assert.equal(half.calls.find(call=>call.op==='fillText').globalAlpha,.44);
 assert.equal(half.calls.find(call=>call.op==='stroke'&&call.strokeStyle==='#e2e7cd').globalAlpha,.4);
});

test('outline, fill and both modes actually switch boundary ink and translucent group color',()=>{
 const strokeColors={chalkboard:'#e2e7cd',playground:'#faf4df',gym:'#427c83',classroom:'#879781'};
 for(const theme of Object.keys(strokeColors))for(const renderMode of ['outline','fill','both']){
  const ctx=recordingContext();draw(ctx,{theme,settings:{renderMode,texture:0,showLabels:false}});
  const fills=ctx.calls.filter(call=>call.op==='fill'&&call.globalAlpha===.18);
  const strokes=ctx.calls.filter(call=>call.op==='stroke'&&call.strokeStyle===strokeColors[theme]);
  // Playground groups are shown by the students stepping aside, never by drawn borders.
  assert.equal(fills.length,renderMode==='outline'||theme==='playground'?0:1,theme+' '+renderMode+' fill');
  assert.equal(strokes.length>0,renderMode!=='fill'&&theme!=='playground',theme+' '+renderMode+' outline');
 }
});

test('waviness changes only deterministic boundary geometry, including a zero straight-edge option',()=>{
 const render=waviness=>{const ctx=recordingContext();draw(ctx,{settings:{waviness,texture:0,showLabels:false}});return JSON.stringify(ctx.calls);};
 assert.ok(render(0)!==render(1),'the waviness option must change the real drawn contour');
 assert.ok(render(.7)===render(.7),'no per-frame random boundary jitter');
});

test('roundBoundary smoothly morphs group contours from rectangular/polygonal (0) through intermediate (0.5) to circular/oval (1)',()=>{
 for(const theme of ['chalkboard','gym','classroom']){
  const rect=recordingContext(),half=recordingContext(),circle=recordingContext();
  draw(rect,{theme,settings:{roundBoundary:0,waviness:0,texture:0,showLabels:false}});
  draw(half,{theme,settings:{roundBoundary:.5,waviness:0,texture:0,showLabels:false}});
  draw(circle,{theme,settings:{roundBoundary:1,waviness:0,texture:0,showLabels:false}});
  const rectJson=JSON.stringify(rect.calls),halfJson=JSON.stringify(half.calls),circleJson=JSON.stringify(circle.calls);
  assert.notEqual(rectJson,halfJson,theme+' intermediate roundBoundary must round corners');
  assert.notEqual(halfJson,circleJson,theme+' full roundBoundary must reach full circle/oval');
  assert.notEqual(rectJson,circleJson,theme+' 0 and 1 roundBoundary must differ');
  assert.ok(half.calls.filter(call=>call.op==='lineTo').length>=40,theme+' intermediate roundBoundary samples a smooth rounded contour');
  assert.ok(circle.calls.filter(call=>call.op==='lineTo').length>=40,theme+' full roundBoundary samples a smooth closed circle/ellipse');
 }
});

test('rendering isolates inherited shadows, filters and dash offsets and restores them even on errors', () => {
  const ctx = recordingContext();
  Object.assign(ctx, { shadowColor: '#ff0000', shadowBlur: 25, shadowOffsetX: 40, shadowOffsetY: 12,
    filter: 'blur(10px)', lineDashOffset: 22 });
  const before = { shadowColor: ctx.shadowColor, shadowBlur: ctx.shadowBlur, shadowOffsetX: ctx.shadowOffsetX,
    shadowOffsetY: ctx.shadowOffsetY, filter: ctx.filter, lineDashOffset: ctx.lineDashOffset };
  draw(ctx, { settings: { texture: 0 } });
  assert.ok(ctx.calls.filter(call => ['stroke', 'fill', 'fillRect', 'fillText'].includes(call.op))
    .every(call => call.shadowColor === 'transparent' && call.shadowBlur === 0));
  for (const [key, value] of Object.entries(before)) assert.equal(ctx[key], value, `${key} restored`);
  const failing = recordingContext();
  failing.fillRect = () => { throw new Error('synthetic canvas failure'); };
  assert.throws(() => draw(failing), /synthetic canvas failure/);
  assert.equal(failing.stackDepth(), 0, 'save/restore also balances on a failed background draw');
});
