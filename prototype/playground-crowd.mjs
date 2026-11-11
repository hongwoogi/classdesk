// SPDX-License-Identifier: GPL-3.0-or-later
// Pure playground crowd: students wander, overlap one another and step aside for
// desktop icons. No DOM, clock, filenames or raster caches live here; callers own
// animation frames and drawing surfaces. All positions are scene (physical) pixels.
const DESIGN_W = 1440, DESIGN_H = 900;
export const PLAYGROUND_STUDENT_COUNT = 300;
export const PLAYGROUND_LOOKS = 24;
/** 0 standing, 1-6 stride cycle, 7 waving. */
export const PLAYGROUND_FRAMES = 8;
/** Figure units per design pixel: three times the former tiny pupils. */
export const PLAYGROUND_FIGURE_SCALE = 3;
// Painted extents in figure units around the feet anchor, including a half-unit fringe.
const HALF_W = 4.2, TOP = 11.9, BOTTOM = 1.4;
const MAX_SIZE = 1.05, MIN_SIZE = .85;
const SHIRTS = ['#c57c72', '#648f88', '#738ca6', '#c7ab68', '#b88b83', '#879d90'];
const SKINS = ['#e3bfa3', '#bf9377', '#997058', '#d0aa8c'];
const HAIR = ['#34332f', '#44382f', '#343b3b'];
const PANTS = ['#56616a', '#4f5a52', '#5d5767'];
const TAU = Math.PI * 2;
const extent = n => typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(32768, n) : 0;
const finiteRect = r => r && ['x', 'y', 'w', 'h'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k])) && r.w >= 0 && r.h >= 0;
function noise(n) {
  let a = Math.imul(n ^ 0x7feb352d, 0x846ca68b);
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  return ((a ^ (a >>> 15)) >>> 0) / 4294967296;
}
/** Serializable PRNG state so equal step sequences give equal crowds. */
function random(crowd) {
  crowd.seed = (crowd.seed + 0x6d2b79f5) >>> 0;
  let t = crowd.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function playgroundLook(look) {
  const index = ((Math.floor(look) % PLAYGROUND_LOOKS) + PLAYGROUND_LOOKS) % PLAYGROUND_LOOKS;
  return { shirt: SHIRTS[index % SHIRTS.length], skin: SKINS[Math.floor(index / SHIRTS.length) % SKINS.length],
    hair: HAIR[(index * 7 + 1) % HAIR.length], pants: PANTS[(index * 5) % PANTS.length], ponytail: index % 4 === 1 };
}

/** Feet-anchored bounding box of the whole painted figure. */
export function playgroundStudentBounds(crowd, student) {
  const u = crowd.unit * student.size;
  return { x: student.x - HALF_W * u, y: student.y - TOP * u, w: HALF_W * 2 * u, h: (TOP + BOTTOM) * u };
}

// ---------------------------------------------------------------- obstacles

/** Anchor-space forbidden rectangles: a feet point inside one would put the
 * figure (largest size) within `clearance` of an icon. Bucketed for queries. */
function buildField(width, height, unit, icons, clearance) {
  const u = unit * MAX_SIZE, c = Math.max(0, Number.isFinite(clearance) ? clearance : 0);
  const area = { l: HALF_W * u, t: TOP * u, r: width - HALF_W * u, b: height - BOTTOM * u };
  const rects = [];
  for (const icon of (Array.isArray(icons) ? icons : []).slice(0, 2000)) {
    if (!finiteRect(icon)) continue;
    const rect = { l: icon.x - c - HALF_W * u, t: icon.y - c - BOTTOM * u, r: icon.x + icon.w + c + HALF_W * u, b: icon.y + icon.h + c + TOP * u };
    if (rect.r <= area.l || rect.l >= area.r || rect.b <= area.t || rect.t >= area.b) continue;
    rects.push(rect);
  }
  const cell = Math.max(32, Math.ceil(Math.max(width, height) / 48));
  const cols = Math.ceil(width / cell) + 1, rows = Math.ceil(height / cell) + 1, buckets = new Map();
  const cx = x => Math.max(0, Math.min(cols - 1, Math.floor(x / cell))), cy = y => Math.max(0, Math.min(rows - 1, Math.floor(y / cell)));
  rects.forEach((rect, index) => {
    for (let y = cy(rect.t); y <= cy(rect.b); y++) for (let x = cx(rect.l); x <= cx(rect.r); x++) {
      const key = y * cols + x;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    }
  });
  return { area, rects, cell, cols, rows, buckets, cx, cy };
}
const inside = (rect, x, y) => x > rect.l && x < rect.r && y > rect.t && y < rect.b;
function rectAt(field, x, y) {
  for (const index of field.buckets.get(field.cy(y) * field.cols + field.cx(x)) ?? []) if (inside(field.rects[index], x, y)) return field.rects[index];
  return null;
}
const inArea = (field, x, y) => x >= field.area.l && x <= field.area.r && y >= field.area.t && y <= field.area.b;
const isFree = (field, x, y) => inArea(field, x, y) && !rectAt(field, x, y);
function segmentClear(field, x0, y0, x1, y1) {
  const seen = new Set();
  for (let y = field.cy(Math.min(y0, y1)); y <= field.cy(Math.max(y0, y1)); y++) for (let x = field.cx(Math.min(x0, x1)); x <= field.cx(Math.max(x0, x1)); x++) {
    for (const index of field.buckets.get(y * field.cols + x) ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      const r = field.rects[index];
      let lo = 0, hi = 1, hit = true;
      for (const [start, delta, min, max] of [[x0, x1 - x0, r.l, r.r], [y0, y1 - y0, r.t, r.b]]) {
        if (Math.abs(delta) < 1e-12) { if (start <= min || start >= max) { hit = false; break; } continue; }
        const a = (min - start) / delta, b = (max - start) / delta;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
        if (hi - lo <= 1e-9) { hit = false; break; }
      }
      if (hit) return false;
    }
  }
  return true;
}
const clampToArea = (field, x, y) => ({ x: Math.max(field.area.l, Math.min(field.area.r, x)), y: Math.max(field.area.t, Math.min(field.area.b, y)) });
/** Nearest free point: hop across the edges of overlapping icon zones, then a bounded ring search. */
function escapePoint(field, x, y) {
  if (field.area.l > field.area.r || field.area.t > field.area.b) return null;
  if (isFree(field, x, y)) return { x, y };
  const queue = [clampToArea(field, x, y)], seen = new Set();
  for (let step = 0; step < 96 && queue.length; step++) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (Math.hypot(queue[i].x - x, queue[i].y - y) < Math.hypot(queue[best].x - x, queue[best].y - y)) best = i;
    const p = queue.splice(best, 1)[0], key = Math.round(p.x * 4) + ':' + Math.round(p.y * 4);
    if (seen.has(key)) continue;
    seen.add(key);
    const rect = inArea(field, p.x, p.y) ? rectAt(field, p.x, p.y) : null;
    if (!rect && inArea(field, p.x, p.y)) return p;
    if (!rect) continue;
    for (const q of [[rect.l - .5, p.y], [rect.r + .5, p.y], [p.x, rect.t - .5], [p.x, rect.b + .5]]) queue.push(clampToArea(field, q[0], q[1]));
  }
  const span = Math.max(field.area.r - field.area.l, field.area.b - field.area.t), stepSize = Math.max(8, span / 64);
  for (let radius = stepSize; radius <= span * 1.5; radius += stepSize) {
    const count = Math.min(64, Math.max(12, Math.ceil(radius * TAU / stepSize)));
    for (let i = 0; i < count; i++) {
      const px = x + Math.cos(i / count * TAU) * radius, py = y + Math.sin(i / count * TAU) * radius;
      if (isFree(field, px, py)) return { x: px, y: py };
    }
  }
  return null;
}

// ---------------------------------------------------------------- crowd

function screenScale(width, height) { return Math.min(width / DESIGN_W, height / DESIGN_H); }
/** Alternate deterministic spots for a student whose home is covered. */
function alternate(field, index, k) {
  const a = field.area;
  return { x: a.l + noise(index * 97 + k * 13 + 5) * (a.r - a.l), y: a.t + noise(index * 97 + k * 13 + 6) * (a.b - a.t) };
}
function settleStatic(crowd, student) {
  const field = crowd.field;
  let spot = null;
  for (let k = 0; k < 16 && !spot; k++) {
    const p = k ? alternate(field, student.index, k) : { x: student.homeX, y: student.homeY };
    if (isFree(field, p.x, p.y)) spot = p;
  }
  spot ??= escapePoint(field, student.homeX, student.homeY);
  student.hidden = !spot;
  if (spot) { student.x = spot.x; student.y = spot.y; }
}

/** Deterministic crowd laid out on a jittered (never aligned) field. */
export function createPlaygroundCrowd(width = DESIGN_W, height = DESIGN_H) {
  width = extent(width); height = extent(height);
  if (!width || !height) return null;
  const unit = PLAYGROUND_FIGURE_SCALE * screenScale(width, height);
  const field = buildField(width, height, unit, [], 0), a = field.area;
  const aspect = (a.r - a.l) / Math.max(1e-9, a.b - a.t);
  const cols = Math.max(1, Math.round(Math.sqrt(PLAYGROUND_STUDENT_COUNT * aspect))), rows = Math.ceil(PLAYGROUND_STUDENT_COUNT / cols);
  const students = [];
  for (let index = 0; index < PLAYGROUND_STUDENT_COUNT; index++) {
    const col = index % cols, row = Math.floor(index / cols), n = index * 11;
    const homeX = a.l + (col + .5 + (noise(n + 1) - .5) * 1.25) / cols * (a.r - a.l);
    const homeY = a.t + (row + .5 + (noise(n + 2) - .5) * 1.25) / rows * (a.b - a.t);
    const x = Math.max(a.l, Math.min(a.r, homeX)), y = Math.max(a.t, Math.min(a.b, homeY));
    const roll = noise(n + 7);
    students.push({ id: `pupil-${index}`, index, homeX: x, homeY: y, x, y,
      size: MIN_SIZE + noise(n + 3) * (MAX_SIZE - MIN_SIZE), look: Math.floor(noise(n + 4) * PLAYGROUND_LOOKS),
      speed: (14 + noise(n + 5) * 14) * screenScale(width, height), phase: noise(n + 6),
      // A lively still frame: most stand, some are mid-stride, a few wave.
      frame: roll < .14 ? 7 : roll < .45 ? 1 + Math.floor(noise(n + 8) * 6) : 0,
      state: 'wait', wait: noise(n + 9) * 3, tx: x, ty: y, wave: roll < .14, hidden: false });
  }
  return { width, height, unit, seed: 0x5eed1e55, clearance: 0, field, students };
}

/** Replace the icon obstacles. `instant` (first arrival, paused, reduced motion)
 * moves covered students at once; otherwise they hurry out on foot. */
export function setPlaygroundObstacles(crowd, icons, { clearance = 22, instant = false } = {}) {
  if (!crowd) return crowd;
  crowd.clearance = Number.isFinite(clearance) ? Math.max(0, clearance) : 0;
  crowd.field = buildField(crowd.width, crowd.height, crowd.unit, icons, crowd.clearance);
  for (const s of crowd.students) {
    if (s.hidden) { s.wait = 0; continue; }
    if (!isFree(crowd.field, s.x, s.y)) {
      const exit = escapePoint(crowd.field, s.x, s.y);
      if (!exit) { s.hidden = true; s.state = 'wait'; s.wait = 1; continue; }
      if (instant) { s.x = exit.x; s.y = exit.y; s.state = 'wait'; s.wait = random(crowd) * 1.5; s.frame = 0; }
      else { s.state = 'yield'; s.tx = exit.x; s.ty = exit.y; s.wave = false; }
    } else if (s.state === 'walk' && !segmentClear(crowd.field, s.x, s.y, s.tx, s.ty)) {
      s.state = 'wait'; s.wait = .15 + random(crowd) * .5; s.frame = 0;
    } else if (s.state === 'yield') { s.state = 'wait'; s.wait = .2 + random(crowd) * .6; }
  }
  return crowd;
}

/** Still frame used when motion is off: a pure function of the icons. */
export function staticPlaygroundCrowd(width, height, icons = [], clearance = 22) {
  const crowd = createPlaygroundCrowd(width, height);
  if (!crowd) return null;
  crowd.clearance = Number.isFinite(clearance) ? Math.max(0, clearance) : 0;
  crowd.field = buildField(crowd.width, crowd.height, crowd.unit, icons, crowd.clearance);
  for (const student of crowd.students) settleStatic(crowd, student);
  return crowd;
}

function pickTarget(crowd, s) {
  const field = crowd.field, scale = screenScale(crowd.width, crowd.height);
  for (let attempt = 0; attempt < 8; attempt++) {
    let x, y;
    // A gentle pull home keeps the crowd evenly spread over hours of wandering.
    if (random(crowd) < .35) { const r = random(crowd) * 70 * scale, t = random(crowd) * TAU; x = s.homeX + Math.cos(t) * r; y = s.homeY + Math.sin(t) * r; }
    else { const r = (40 + random(crowd) * 150) * scale, t = random(crowd) * TAU; x = s.x + Math.cos(t) * r; y = s.y + Math.sin(t) * r * .8; }
    if (isFree(field, x, y) && segmentClear(field, s.x, s.y, x, y)) { s.tx = x; s.ty = y; s.state = 'walk'; s.wave = false; return; }
  }
  s.wait = .4 + random(crowd) * .8;
}

/** Advance the crowd by `dt` seconds (clamped so a sleeping tab cannot teleport anyone). */
export function stepPlaygroundCrowd(crowd, dt) {
  if (!crowd || !Number.isFinite(dt) || dt <= 0) return crowd;
  dt = Math.min(dt, .1);
  const field = crowd.field, stride = 7 * crowd.unit;
  for (const s of crowd.students) {
    if (s.hidden) {
      s.wait -= dt;
      if (s.wait > 0) continue;
      settleStatic(crowd, s);
      if (s.hidden) { s.wait = 1.5; continue; }
      s.state = 'wait'; s.wait = random(crowd) * 2; s.frame = 0;
      continue;
    }
    if (s.state === 'wait') {
      s.wait -= dt;
      s.frame = s.wave ? 7 : 0;
      if (s.wait <= 0) pickTarget(crowd, s);
      if (s.state !== 'walk') continue;
    }
    const speed = s.speed * (s.state === 'yield' ? 2.4 : 1);
    const dx = s.tx - s.x, dy = s.ty - s.y, distance = Math.hypot(dx, dy), travel = Math.min(distance, speed * dt);
    if (distance > 1e-9) { s.x += dx / distance * travel; s.y += dy / distance * travel; }
    s.phase = (s.phase + travel / stride) % 1;
    s.frame = 1 + Math.floor(s.phase * 6) % 6;
    if (distance - travel <= 1e-6) {
      s.x = s.tx; s.y = s.ty;
      s.wave = s.state === 'walk' && random(crowd) < .12;
      s.wait = s.state === 'yield' ? .3 + random(crowd) * .9 : .5 + random(crowd) * 3.5;
      s.state = 'wait'; s.frame = s.wave ? 7 : 0;
    }
  }
  return crowd;
}

// ---------------------------------------------------------------- painting

/** Vector figure, feet at (x, y), `u` pixels per figure unit. Shared by sprites and fallback. */
export function paintPlaygroundFigure(ctx, x, y, u, look, frame) {
  const colors = playgroundLook(look);
  const walking = frame >= 1 && frame <= 6, t = walking ? (frame - 1) / 6 * TAU : 0;
  const swing = walking ? Math.sin(t) : 0, bob = walking ? -Math.abs(Math.cos(t)) * .3 : 0;
  const liftL = Math.max(0, swing) * .5, liftR = Math.max(0, -swing) * .5;
  const rect = (rx, ry, w, h) => ctx.fillRect(x + rx * u, y + ry * u, w * u, h * u);
  const oval = (ox, oy, rx, ry) => { ctx.beginPath(); ctx.ellipse(x + ox * u, y + oy * u, rx * u, ry * u, 0, 0, TAU); ctx.fill(); };
  ctx.fillStyle = 'rgba(112,86,52,0.3)'; oval(.3, .05, 3.3, .8);
  ctx.fillStyle = colors.pants; rect(-1.65 + swing * .6, -3.1, 1.3, 3 - liftL); rect(.35 - swing * .6, -3.1, 1.3, 3 - liftR);
  ctx.fillStyle = '#3e4445'; rect(-2 + swing * .6, -.55 - liftL, 1.85, .9); rect(.2 - swing * .6, -.55 - liftR, 1.85, .9);
  ctx.fillStyle = colors.skin;
  rect(-3.6, (frame === 7 ? -8.4 : -5.7 + swing * .7) + bob, 1.2, 3); rect(2.4, -5.7 - swing * .7 + bob, 1.2, 3);
  ctx.fillStyle = colors.shirt; rect(-3.3, -6.85 + bob, 1.5, 1.8); rect(1.8, -6.85 + bob, 1.5, 1.8);
  ctx.beginPath();
  ctx.moveTo(x - 1.8 * u, y + (-7 + bob) * u); ctx.lineTo(x + 1.8 * u, y + (-7 + bob) * u);
  ctx.lineTo(x + 2.1 * u, y + (-2.4 + bob) * u); ctx.lineTo(x - 2.1 * u, y + (-2.4 + bob) * u); ctx.fill();
  ctx.fillStyle = colors.skin; oval(0, -8.5 + bob, 2.12, 2.35);
  ctx.fillStyle = colors.hair; oval(0, -9.75 + bob, 2.18, 1.2);
  if (colors.ponytail) oval(2, -9.4 + bob, .8, 1.1);
}

/** Painter's order: students further down the field overlap those behind them. */
export function playgroundPaintOrder(crowd) {
  return (crowd?.students ?? []).filter(s => !s.hidden).sort((a, b) => a.y - b.y || a.index - b.index);
}

/** Vector fallback when no sprite surface exists. Ground belongs to the caller. */
export function paintPlaygroundCrowd(ctx, crowd) {
  if (!crowd || !Array.isArray(crowd.students)) return;
  ctx.save();
  try {
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.filter = 'none';
    for (const s of playgroundPaintOrder(crowd)) paintPlaygroundFigure(ctx, s.x, s.y, crowd.unit * s.size, s.look, s.frame);
  } finally { ctx.restore(); }
}

/** Sprite cell geometry in figure units for callers that pre-render frames. */
export const PLAYGROUND_FIGURE_BOX = Object.freeze({ left: HALF_W, top: TOP, width: HALF_W * 2, height: TOP + BOTTOM, maxSize: MAX_SIZE });
