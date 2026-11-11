import test from 'node:test';
import assert from 'node:assert/strict';
let api = {};
try { api = await import('../prototype/playground-crowd.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

const OLD_FIGURE_HEIGHT = 12.9; // former tiny pupil height in 1440 × 900 design pixels
const icon = (id, x, y, w = 64, h = 76) => ({ id, x, y, w, h });
const center = [icon('center', 680, 400)];
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const zone = (item, clearance) => ({ x: item.x - clearance, y: item.y - clearance, w: item.w + clearance * 2, h: item.h + clearance * 2 });
const bounds = (crowd, student) => api.playgroundStudentBounds(crowd, student);
const visible = crowd => crowd.students.filter(student => !student.hidden);
function intruders(crowd, icons, clearance) {
  return visible(crowd).filter(student => icons.some(item => intersects(bounds(crowd, student), zone(item, clearance))));
}
function run(crowd, seconds, each = () => {}) {
  for (let i = 0; i < Math.round(seconds * 30); i++) { api.stepPlaygroundCrowd(crowd, 1 / 30); each(i); }
}

test('students are about three times larger, deterministic, varied and fully on screen', () => {
  assert.equal(typeof api.createPlaygroundCrowd, 'function');
  const crowd = api.createPlaygroundCrowd(1440, 900);
  assert.ok(crowd.students.length >= 150 && crowd.students.length <= 420, 'a readable crowd, not thousands of specks');
  assert.equal(JSON.stringify(api.createPlaygroundCrowd(1440, 900)), JSON.stringify(crowd));
  assert.equal(new Set(crowd.students.map(s => s.id)).size, crowd.students.length);
  assert.ok(new Set(crowd.students.map(s => s.look)).size >= 12);
  const heights = crowd.students.map(s => bounds(crowd, s).h);
  const average = heights.reduce((a, b) => a + b, 0) / heights.length;
  assert.ok(average >= OLD_FIGURE_HEIGHT * .91 * 2.7 && average <= OLD_FIGURE_HEIGHT * .91 * 3.6, `average figure ${average}`);
  for (const student of crowd.students) {
    const b = bounds(crowd, student);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1440 && b.y + b.h <= 900, 'whole figure inside the viewport');
  }
  const wide = api.createPlaygroundCrowd(1920, 1080);
  assert.equal(wide.students.length, crowd.students.length);
  assert.ok(Math.abs(bounds(wide, wide.students[0]).h - bounds(crowd, crowd.students[0]).h * 1.2) < 1e-9, 'uniform figure scale, never squashed');
  for (const dimensions of [[0, 900], [-1, 900], [NaN, 900], [Infinity, 900], [1440, null]]) assert.equal(api.createPlaygroundCrowd(...dimensions), null);
  assert.ok(api.createPlaygroundCrowd(1e100, 1e100).students.length <= 420);
});

test('students overlap one another instead of standing in a rigid grid', () => {
  const crowd = api.createPlaygroundCrowd(1440, 900);
  const overlaps = list => { let n = 0; const b = list.map(s => bounds(crowd, s)); for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (intersects(b[i], b[j])) n++; return n; };
  assert.ok(overlaps(crowd.students) >= 20, 'initial crowd overlaps');
  const rows = new Set(crowd.students.map(s => Math.round(s.y)));
  assert.ok(rows.size > crowd.students.length * .6, 'no aligned rows');
  api.setPlaygroundObstacles(crowd, [], { clearance: 22, instant: true });
  run(crowd, 20);
  assert.ok(overlaps(visible(crowd)) >= 20, 'walking keeps overlapping; no separation force');
});

test('students walk continuously with stride frames, deterministically and inside the field', () => {
  const a = api.createPlaygroundCrowd(1440, 900), b = api.createPlaygroundCrowd(1440, 900);
  for (const crowd of [a, b]) api.setPlaygroundObstacles(crowd, [], { clearance: 22, instant: true });
  const start = a.students.map(s => ({ x: s.x, y: s.y }));
  const frames = new Set();
  let maxStep = 0;
  run(a, 6, () => {
    for (const s of a.students) frames.add(s.frame);
  });
  run(b, 6);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same steps, same crowd');
  const moved = a.students.filter((s, i) => Math.hypot(s.x - start[i].x, s.y - start[i].y) > 8).length;
  assert.ok(moved >= a.students.length * .5, `only ${moved} students moved`);
  for (const f of [0, 1, 2, 3, 4, 5, 6]) assert.ok(frames.has(f), `walk frame ${f}`);
  const c = api.createPlaygroundCrowd(1440, 900);
  api.setPlaygroundObstacles(c, [], { clearance: 22, instant: true });
  let previous = c.students.map(s => ({ x: s.x, y: s.y }));
  run(c, 10, () => {
    c.students.forEach((s, i) => { maxStep = Math.max(maxStep, Math.hypot(s.x - previous[i].x, s.y - previous[i].y)); });
    for (const s of c.students) { const r = bounds(c, s); assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1440 && r.y + r.h <= 900); }
    previous = c.students.map(s => ({ x: s.x, y: s.y }));
  });
  assert.ok(maxStep > 0 && maxStep < 4, `calm walking, no teleporting (${maxStep}px per frame)`);
  const before = JSON.stringify(c);
  for (const dt of [NaN, -1, Infinity, 0]) api.stepPlaygroundCrowd(c, dt);
  assert.equal(JSON.stringify(c), before, 'invalid or zero time steps do nothing');
});

test('a newly placed icon makes the students inside walk aside, after which nobody walks into it', () => {
  for (const clearance of [8, 22, 64]) {
    const crowd = api.createPlaygroundCrowd(1440, 900);
    api.setPlaygroundObstacles(crowd, [], { clearance, instant: true });
    run(crowd, 1);
    const inside = intruders(crowd, center, clearance);
    assert.ok(inside.length >= 1, 'fixture needs students where the icon lands');
    api.setPlaygroundObstacles(crowd, center, { clearance, instant: false });
    assert.equal(intruders(crowd, center, clearance).length, inside.length, 'they visibly step aside rather than vanish');
    const positions = inside.map(s => ({ s, x: s.x, y: s.y }));
    run(crowd, .5);
    assert.ok(positions.some(p => Math.hypot(p.s.x - p.x, p.s.y - p.y) > 4), 'students are moving out');
    run(crowd, 3.5);
    assert.deepEqual(intruders(crowd, center, clearance).map(s => s.id), [], `cleared at clearance ${clearance}`);
    run(crowd, 25, () => assert.deepEqual(intruders(crowd, center, clearance).map(s => s.id), [], 'walkers route around the icon'));
  }
});

test('instant placement (paused or first arrival) clears icon areas immediately, including dense desktop columns', () => {
  const column = Array.from({ length: 9 }, (_, i) => icon('col-' + i, 4, 4 + i * 96, 76, 88));
  const group = Array.from({ length: 6 }, (_, i) => icon('grid-' + i, 600 + (i % 3) * 90, 300 + Math.floor(i / 3) * 100));
  for (const icons of [center, column, group, [...column, ...group]]) {
    const crowd = api.createPlaygroundCrowd(1440, 900);
    api.setPlaygroundObstacles(crowd, icons, { clearance: 22, instant: true });
    assert.deepEqual(intruders(crowd, icons, 22).map(s => s.id), []);
    assert.ok(visible(crowd).length >= crowd.students.length * .9, 'students are moved, not deleted');
    run(crowd, 10, () => assert.deepEqual(intruders(crowd, icons, 22).map(s => s.id), []));
  }
  const tight = api.createPlaygroundCrowd(1440, 900);
  api.setPlaygroundObstacles(tight, [icon('all', 0, 0, 1440, 900)], { clearance: 8, instant: true });
  assert.equal(visible(tight).length, 0, 'no room at all hides students instead of overlapping icons');
  run(tight, 3);
  assert.equal(visible(tight).length, 0);
  api.setPlaygroundObstacles(tight, [{ id: 'bad', x: NaN, y: 0, w: 4, h: 4 }, null, icon('off', -500, -500, 10, 10)], { clearance: 8, instant: true });
  run(tight, 3);
  assert.ok(visible(tight).length >= tight.students.length * .9, 'students return once space opens up');
});

test('static crowd is a pure function of icons: unrelated students stay, displaced ones return exactly', () => {
  assert.equal(typeof api.staticPlaygroundCrowd, 'function');
  const empty = api.staticPlaygroundCrowd(1440, 900, [], 22);
  const placed = api.staticPlaygroundCrowd(1440, 900, center, 22);
  assert.equal(JSON.stringify(api.staticPlaygroundCrowd(1440, 900, center, 22)), JSON.stringify(placed));
  assert.deepEqual(intruders(placed, center, 22).map(s => s.id), []);
  const displaced = new Set(intruders(empty, center, 22).map(s => s.id));
  assert.ok(displaced.size >= 1);
  empty.students.forEach((s, i) => {
    if (Math.hypot(placed.students[i].x - s.x, placed.students[i].y - s.y) < 1e-9) return;
    const maxBox = api.playgroundStudentBounds(empty, { ...s, size: 1.05 });
    assert.ok(center.some(item => intersects(maxBox, zone(item, 22))), 'unrelated students never reshuffle');
  });
  assert.ok(new Set(placed.students.map(s => s.frame)).size >= 3, 'a lively still frame: standing, mid-stride and waving');
  const moved = api.staticPlaygroundCrowd(1440, 900, [icon('center', 1100, 400)], 22);
  const back = api.staticPlaygroundCrowd(1440, 900, center, 22);
  assert.equal(JSON.stringify(back), JSON.stringify(placed));
  assert.notEqual(JSON.stringify(moved), JSON.stringify(placed));
  const many = Array.from({ length: 500 }, (_, i) => icon('perf-' + i, 40 + (i % 25) * 150, 40 + Math.floor(i / 25) * 100, 32, 32));
  const started = performance.now();
  const big = api.staticPlaygroundCrowd(3840, 2160, many, 8);
  assert.ok(performance.now() - started < 400, 'bounded settling cost');
  assert.deepEqual(intruders(big, many, 8).map(s => s.id), []);
});

function recorder(limit) {
  let depth = 0, ops = 0, saves = 0, paints = 0;
  const within = (x, y) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    if (limit) assert.ok(x >= limit.x - 1e-8 && y >= limit.y - 1e-8 && x <= limit.x + limit.w + 1e-8 && y <= limit.y + limit.h + 1e-8, `paint ${x},${y} outside ${JSON.stringify(limit)}`);
  };
  return {
    save() { depth++; saves++; }, restore() { depth--; },
    beginPath() { ops++; }, fill() { ops++; paints++; }, closePath() { ops++; },
    moveTo(x, y) { ops++; within(x, y); }, lineTo(x, y) { ops++; within(x, y); },
    fillRect(x, y, w, h) { ops++; paints++; within(x, y); within(x + w, y + h); },
    ellipse(x, y, rx, ry) { ops++; within(x - rx, y - ry); within(x + rx, y + ry); },
    stats() { return { depth, ops, saves, paints }; },
  };
}

test('every look and stride frame paints entirely inside the student bounds, without per-student saves', () => {
  assert.equal(typeof api.paintPlaygroundFigure, 'function');
  for (const [w, h] of [[1440, 900], [2880, 1800], [1920, 1080]]) {
    const crowd = api.createPlaygroundCrowd(w, h);
    for (let look = 0; look < api.PLAYGROUND_LOOKS; look++) for (let frame = 0; frame < api.PLAYGROUND_FRAMES; frame++) {
      const student = { ...crowd.students[look], look, frame };
      const b = bounds(crowd, student), u = crowd.unit * student.size * .5;
      const ctx = recorder({ x: b.x + u, y: b.y + u, w: b.w - 2 * u, h: b.h - 2 * u });
      api.paintPlaygroundFigure(ctx, student.x, student.y, crowd.unit * student.size, look, frame);
      assert.equal(ctx.stats().depth, 0);
      assert.ok(ctx.stats().paints >= 10, 'shadow, legs, shoes, arms, sleeves, shirt, head and hair');
    }
  }
  const crowd = api.createPlaygroundCrowd(1440, 900);
  const ctx = recorder(); api.paintPlaygroundCrowd(ctx, crowd);
  assert.ok(ctx.stats().saves <= 2, 'not one transform/save per student');
  assert.equal(ctx.stats().depth, 0);
  const broken = recorder(); broken.fillRect = () => { throw Error('canvas failure'); };
  assert.throws(() => api.paintPlaygroundCrowd(broken, crowd), /canvas failure/);
  assert.equal(broken.stats().depth, 0);
});
