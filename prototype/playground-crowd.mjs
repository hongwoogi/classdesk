// SPDX-License-Identifier: GPL-3.0-or-later
// Pure playground crowd: students wander, overlap one another and step aside for
// desktop icons. No DOM, clock, filenames or raster caches live here; callers own
// animation frames and drawing surfaces. All positions are scene (physical) pixels.
const DESIGN_W = 1440, DESIGN_H = 900;
export const PLAYGROUND_STUDENT_COUNT = 64;
export const PLAYGROUND_LOOKS = 24;
/** 0 standing, 1-6 stride cycle, 7 waving. */
export const PLAYGROUND_FRAMES = 8;
/** Figure units per design pixel: 300% larger pixel-art students. */
export const PLAYGROUND_FIGURE_SCALE = 9;
// Painted extents in figure units around the feet anchor, including a half-unit fringe.
const HALF_W = 4.2, TOP = 10.6, BOTTOM = 1.1;
const MAX_SIZE = 1.05, MIN_SIZE = .85;
const SHIRTS = ['#e76f51', '#4ea8de', '#f4a261', '#52b788', '#9b72cf', '#e56b6f', '#3a6ea5', '#e9c46a'];
const ACCENTS = ['#f4d35e', '#ffffff', '#ff9ebb', '#7bdff2', '#ffe66d', '#a8dadc'];
const SKINS = ['#ffe3c8', '#f9cfa7', '#eec096', '#ffead6'];
const HAIR = ['#2f2421', '#5c3c28', '#7f4f24', '#25262e', '#6f4518', '#3d2b24'];
const HAIR_LIGHT = ['#523f3a', '#84593d', '#a66b38', '#454754', '#96622b', '#5e4339'];
const PANTS = ['#354f6b', '#4a5d4e', '#5a4638', '#48405c'];
const SHOES = ['#d64545', '#3b6ea5', '#4f5d75', '#e07a5f'];
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
  const hairIdx = (index * 7 + 1) % HAIR.length;
  return {
    shirt: SHIRTS[index % SHIRTS.length],
    accent: ACCENTS[(index * 3 + 1) % ACCENTS.length],
    skin: SKINS[Math.floor(index / SHIRTS.length) % SKINS.length],
    hair: HAIR[hairIdx],
    hairLight: HAIR_LIGHT[hairIdx],
    pants: PANTS[(index * 5) % PANTS.length],
    shoe: SHOES[(index * 3) % SHOES.length],
    hairStyle: index % 6,
    outfitStyle: Math.floor(index / 2) % 4,
    ponytail: index % 6 === 1,
  };
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
      speed: (18 + noise(n + 5) * 14) * screenScale(width, height), phase: noise(n + 6),
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
    const speed = s.speed * (s.state === 'yield' ? 3.2 : 1);
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

/** Pixel-art chibi student, feet at (x, y), `u` pixels per figure unit. Shared by sprites and fallback. */
export function paintPlaygroundFigure(ctx, x, y, u, look, frame) {
  const c = playgroundLook(look);
  const p = u * 0.39;
  const stride = frame >= 1 && frame <= 6 ? [0, 1, 1, 0, -1, -1, 0][frame] : 0;
  const liftL = frame === 1 || frame === 2 ? 1 : 0;
  const liftR = frame === 4 || frame === 5 ? 1 : 0;
  const bob = liftL || liftR ? -0.5 : 0;
  const px = (gx, gy, gw, gh, move = true) => ctx.fillRect(x + gx * p, y + (gy + (move ? bob : 0)) * p, gw * p, gh * p);

  // Pixel ground shadow
  ctx.fillStyle = 'rgba(92,68,38,0.24)';
  px(-5, -0.4, 10, 1.1, false);
  px(-6, -0.1, 12, 0.55, false);

  // Legs, white socks & sneakers (with dark pixel outline)
  const lx = -3.5 + stride * 0.45, rx = 0.5 - stride * 0.45;
  ctx.fillStyle = '#2b211d';
  px(lx - 0.5, -5.2 - liftL, 3.8, 5.2, false);
  px(rx - 0.5, -5.2 - liftR, 3.8, 5.2, false);
  ctx.fillStyle = c.pants;
  px(lx, -5 - liftL, 2.8, 2.4, false);
  px(rx, -5 - liftR, 2.8, 2.4, false);
  ctx.fillStyle = '#f8f5ec';
  px(lx, -2.6 - liftL, 2.8, 1.2, false);
  px(rx, -2.6 - liftR, 2.8, 1.2, false);
  ctx.fillStyle = c.shoe;
  px(lx - 0.2, -1.4 - liftL, 3.1, 1.1, false);
  px(rx - 0.2, -1.4 - liftR, 3.1, 1.1, false);
  ctx.fillStyle = '#f8f5ec';
  px(lx - 0.2, -0.8 - liftL, 1.1, 0.5, false);
  px(rx + 1.8, -0.8 - liftR, 1.1, 0.5, false);

  // Swinging pixel arms (or raised waving right arm on frame 7)
  const armL = -stride * 0.8, armR = frame === 7 ? -4.2 : stride * 0.8;
  ctx.fillStyle = '#2b211d';
  px(-6.8, -10.6 + armL, 2.6, 5.2);
  px(4.2, -10.6 + armR, 2.6, 5.2);
  ctx.fillStyle = c.shirt;
  px(-6.3, -10.1 + armL, 1.8, 2.9);
  px(4.5, -10.1 + armR, 1.8, 2.9);
  ctx.fillStyle = c.skin;
  px(-6.3, -7.2 + armL, 1.8, 1.8);
  px(4.5, (frame === 7 ? -11.6 : -7.2) + armR, 1.8, 1.8);

  // Torso outline & school uniform / tracksuit / cardigan
  ctx.fillStyle = '#2b211d';
  px(-5, -11.4, 10, 6.8);
  ctx.fillStyle = c.shirt;
  px(-4.2, -10.6, 8.4, 5.4);
  if (c.outfitStyle === 0) {
    // Sailor / collar uniform + tie
    ctx.fillStyle = '#f9f6ee';
    px(-3, -10.6, 6, 1.1);
    ctx.fillStyle = c.accent;
    px(-0.6, -9.5, 1.2, 2.4);
  } else if (c.outfitStyle === 1) {
    // Cardigan / vest over white shirt
    ctx.fillStyle = '#f9f6ee';
    px(-1.2, -10.6, 2.4, 3.4);
    ctx.fillStyle = c.accent;
    px(-0.5, -7.1, 1, 1);
  } else if (c.outfitStyle === 2) {
    // Sporty tracksuit chest stripe
    ctx.fillStyle = '#f9f6ee';
    px(-4.2, -8.4, 8.4, 1.1);
    ctx.fillStyle = c.accent;
    px(-2, -10.6, 4, 0.9);
  } else {
    // School backpack straps + collar
    ctx.fillStyle = '#f9f6ee';
    px(-2.2, -10.6, 4.4, 1);
    ctx.fillStyle = c.accent;
    px(-3.8, -10.4, 1.1, 4.6);
    px(2.7, -10.4, 1.1, 4.6);
  }

  // Cute wide chibi head outline & hair back details
  ctx.fillStyle = '#2b211d';
  if (c.hairStyle === 0) {
    // Twin pigtails
    px(-8, -18.5, 2.4, 4.6);
    px(5.6, -18.5, 2.4, 4.6);
  } else if (c.hairStyle === 1) {
    // Side ponytail
    px(5.6, -20.2, 2.4, 4.6);
  }
  px(-5.2, -21.8, 10.4, 1);
  px(-6.2, -20.8, 12.4, 8.6);
  px(-5.2, -12.2, 10.4, 1);

  if (c.hairStyle === 0) {
    ctx.fillStyle = c.hair;
    px(-7.4, -18, 1.6, 3.6);
    px(5.8, -18, 1.6, 3.6);
    ctx.fillStyle = c.accent;
    px(-6.8, -19, 1.6, 1.2);
    px(5.2, -19, 1.6, 1.2);
  } else if (c.hairStyle === 1) {
    ctx.fillStyle = c.hair;
    px(5.8, -19.6, 1.6, 3.6);
    ctx.fillStyle = c.accent;
    px(5, -19.6, 1.2, 1.6);
  }

  // Face skin & ears
  ctx.fillStyle = c.skin;
  px(-6.4, -16.8, 1.2, 2);
  px(5.2, -16.8, 1.2, 2);
  px(-5.2, -19.6, 10.4, 7.2);
  px(-4.2, -12.4, 8.4, 0.9);

  // Rosy pixel blush cheeks, sparkling dark eyes & smile
  ctx.fillStyle = '#f28482';
  px(-4.8, -14.5, 1.9, 1.1);
  px(2.9, -14.5, 1.9, 1.1);
  ctx.fillStyle = '#241915';
  px(-3.8, -16.8, 1.8, 2.1);
  px(2, -16.8, 1.8, 2.1);
  ctx.fillStyle = '#ffffff';
  px(-3.8, -16.8, 0.9, 0.9);
  px(2, -16.8, 0.9, 0.9);
  ctx.fillStyle = '#c97b63';
  px(-0.9, -13.6, 1.8, 0.8);

  // Hair bangs, side locks, shine & hats/accessories
  ctx.fillStyle = c.hair;
  px(-5.4, -21, 10.8, 2.6);
  px(-5.6, -18.8, 1.4, 3.2);
  px(4.2, -18.8, 1.4, 3.2);
  // Parted fringe notch
  ctx.fillStyle = c.skin;
  px(c.hairStyle % 2 ? -1.4 : 0.4, -18.8, 1.1, 0.8);
  // Hair shine highlight
  ctx.fillStyle = c.hairLight;
  px(-3.2, -20.4, 3.2, 0.9);

  if (c.hairStyle === 2) {
    // Bob cut side locks + cute hairclip
    ctx.fillStyle = c.hair;
    px(-5.6, -18.8, 1.5, 5.2);
    px(4.1, -18.8, 1.5, 5.2);
    ctx.fillStyle = c.accent;
    px(2.6, -18.8, 1.8, 0.9);
  } else if (c.hairStyle === 3) {
    // Sporty playground cap
    ctx.fillStyle = c.accent;
    px(-5.4, -21.6, 10.8, 2.4);
    px(0.5, -19.5, 6.2, 1);
    ctx.fillStyle = '#ffffff';
    px(-1.2, -21.1, 2.2, 1);
  } else if (c.hairStyle === 4) {
    // Cute sprout / ahoge hair tuft
    ctx.fillStyle = '#2b211d';
    px(-1.2, -23.4, 2.8, 1.8);
    ctx.fillStyle = c.hair;
    px(-0.7, -22.9, 1.8, 1.4);
  } else if (c.hairStyle === 5) {
    // Cute school beret
    ctx.fillStyle = '#2b211d';
    px(-5.4, -22.8, 10.8, 2.2);
    ctx.fillStyle = c.accent;
    px(-4.8, -22.3, 9.6, 1.7);
    px(-0.6, -23.3, 1.4, 0.8);
  }
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
