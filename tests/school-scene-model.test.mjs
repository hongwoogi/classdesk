import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../prototype/school-layout.mjs';

let api = {};
try { api = await import('../prototype/school-scene-model.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

const view = { width: 2400, height: 1600 };
const icon = (id, x, y = 100, w = 30, h = 30) => ({ id, x, y, w, h });
const raw = (icons, settings = {}) => buildScene(icons, view, { groupGap: 30, padding: 10, ...settings });
const groupAt = (scene, member) => scene.groups.find(group => group.icons.some(item => item.id === member));
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

test('catalog sanitization rejects malformed IDs, polluted objects and non-finite geometry', () => {
  assert.equal(typeof api.sanitizeGroupCatalog, 'function');
  const record = {
    id: 'group-safe', members: ['z', 'a', 'a', '__proto__', null, ''],
    bounds: { x: -10, y: 32760, w: 50, h: 100 }, colorIndex: 4, active: true, recency: 7,
  };
  const malformed = [null, {}, ...['__proto__', 'constructor', 'prototype', '', 'has space', 'bad\nkey', 'x'.repeat(129)].map(id => ({ ...record, id })),
    { ...record, id: 'nan', bounds: { ...record.bounds, x: NaN } },
    { ...record, id: 'infinite', bounds: { ...record.bounds, h: Infinity } },
    { ...record, id: 'negative', bounds: { ...record.bounds, w: -1 } },
    Object.assign(Object.create({ polluted: true }), record),
    JSON.parse('{"id":"group-polluted","__proto__":{},"members":[],"bounds":{"x":1,"y":2,"w":3,"h":4},"colorIndex":0,"active":true}')];
  const input = freeze({ version: 1, nextId: 8, groups: [record, { ...record, colorIndex: 2 }, ...malformed] });
  const clean = api.sanitizeGroupCatalog(input);
  assert.deepEqual(clean, { version: 1, nextId: 8, groups: [{
    id: 'group-safe', members: ['a', 'z'], bounds: { x: 0, y: 32760, w: 40, h: 8 },
    colorIndex: 4, active: true, recency: 7,
  }] });
  assert.deepEqual(api.sanitizeGroupCatalog(JSON.parse(JSON.stringify(clean))), clean);
  for (const bad of [undefined, null, [], 'bad json', { version: 2, groups: [record] }, Object.create({ groups: [record] })]) {
    assert.deepEqual(api.sanitizeGroupCatalog(bad), { version: 1, nextId: 1, groups: [] });
  }
  assert.equal({}.polluted, undefined);
});

test('catalog bounds records at 512 with at most 500 active records taking priority', () => {
  const records = Array.from({ length: 1100 }, (_, i) => ({
    id: `group-${String(i).padStart(4, '0')}`, members: [`member-${i}`],
    bounds: { x: 0, y: 0, w: 20, h: 20 }, colorIndex: -1, active: i >= 550,
    recency: Infinity, ignored: { untrusted: true },
  }));
  const catalog = api.sanitizeGroupCatalog({ version: 1, nextId: Infinity, groups: records });
  assert.equal(catalog.groups.length, 512);
  assert.equal(catalog.groups.filter(group => group.active).length, 500);
  assert.equal(catalog.nextId, 1);
  assert.ok(catalog.groups.some(group => group.id === 'group-0550'));
  assert.ok(!catalog.groups.some(group => group.id === 'group-1050'));
  assert.ok(catalog.groups.every(group => group.colorIndex === 0 && !('recency' in group) && !('ignored' in group)));
  assert.deepEqual(api.sanitizeGroupCatalog(catalog), catalog);
});

test('adding a member preserves a renamed group and unaffected IDs and colors', () => {
  const initial = api.reconcileGroups(raw([icon('b', 100), icon('c', 150), icon('z', 700)]));
  const original = groupAt(initial.scene, 'b');
  const unaffected = groupAt(initial.scene, 'z');
  const names = freeze({ [original.id]: '학급 자료', [unaffected.id]: '행정 업무' });
  const nextRaw = freeze(raw([icon('a', 200), icon('z', 700), icon('c', 150), icon('b', 100)]));
  const next = api.reconcileGroups(nextRaw, freeze(initial.catalog), names);
  const updated = groupAt(next.scene, 'a');
  assert.equal(updated.id, original.id);
  assert.equal(updated.colorIndex, original.colorIndex);
  assert.equal(updated.label, '학급 자료');
  assert.deepEqual(groupAt(next.scene, 'z'), { ...unaffected, label: '행정 업무' });
  assert.deepEqual(next.catalog.groups.find(group => group.id === original.id).members, ['a', 'b', 'c']);
});

test('opaque group identities follow their members when groups exchange exact spatial bounds',()=>{
 const start=api.reconcileGroups(raw([icon('i-a',100),icon('i-b',700)]));
 const left=groupAt(start.scene,'i-a'),right=groupAt(start.scene,'i-b');
 const names=freeze({[left.id]:'학습 자료',[right.id]:'행정 자료'});
 const exchanged=api.reconcileGroups(raw([icon('i-a',700),icon('i-b',100)]),start.catalog,names);
 for(const [member,original] of [['i-a',left],['i-b',right]]){
  const moved=groupAt(exchanged.scene,member);
  assert.equal(moved.id,original.id,member+' must keep its own identity after a position exchange');
  assert.equal(moved.label,names[original.id]);assert.equal(moved.colorIndex,original.colorIndex);
 }
});

test('opaque member majorities retain their own named identities when moving and adding members together',()=>{
 const start=api.reconcileGroups(raw([icon('i-a',100),icon('i-aa',150),icon('i-b',700),icon('i-bb',750)]));
 const a=groupAt(start.scene,'i-a'),b=groupAt(start.scene,'i-b');
 const names=freeze({[a.id]:'학습 자료',[b.id]:'행정 자료'});
 const next=api.reconcileGroups(raw([icon('i-a',700),icon('i-aa',750),icon('i-new-a',800),icon('i-b',100),icon('i-bb',150),icon('i-new-b',200)]),start.catalog,names);
 for(const [member,original] of [['i-a',a],['i-b',b]]){
  const group=groupAt(next.scene,member);assert.equal(group.id,original.id);assert.equal(group.label,names[original.id]);assert.equal(group.colorIndex,original.colorIndex);
 }
});

test('native positional IDs re-enumerated after deletion follow stationary bounds, not membership', () => {
  const start = api.reconcileGroups(raw([icon('native-0', 100), icon('native-1', 150), icon('native-2', 700)]));
  const left = groupAt(start.scene, 'native-0');
  const right = groupAt(start.scene, 'native-2');
  const names = freeze({ [left.id]: '수업', [right.id]: '업무' });
  const next = api.reconcileGroups(raw([icon('native-0', 700), icon('native-2', 100), icon('native-1', 150)]), start.catalog, names);
  assert.equal(groupAt(next.scene, 'native-2').id, left.id);
  assert.equal(groupAt(next.scene, 'native-0').id, right.id);
  assert.equal(groupAt(next.scene, 'native-0').label, '업무');
  const removed = api.reconcileGroups(raw([icon('native-0', 100), icon('native-1', 700)]), next.catalog, names);
  assert.equal(groupAt(removed.scene, 'native-0').id, left.id);
  assert.equal(groupAt(removed.scene, 'native-1').id, right.id);
  assert.equal(groupAt(removed.scene, 'native-1').colorIndex, right.colorIndex);
});

test('far retired positional memberships do not steal names and raw hash collisions get deterministic fresh IDs', () => {
  const start = api.reconcileGroups(raw([icon('native-0', 100)]));
  const old = start.scene.groups[0];
  const names = freeze({ [old.id]: '이전 자료' });
  const retired = api.reconcileGroups(raw([]), start.catalog, names);
  const newcomer = raw([icon('native-0', 1900, 1200)]);
  const next = api.reconcileGroups(newcomer, retired.catalog, names);
  assert.notEqual(next.scene.groups[0].id, old.id);
  assert.notEqual(next.scene.groups[0].label, '이전 자료');
  assert.equal(next.catalog.groups.length, 2);
  assert.equal(next.catalog.groups.find(group => group.id === old.id).active, false);
  assert.ok(next.catalog.nextId > retired.catalog.nextId);
  assert.deepEqual(api.reconcileGroups(newcomer, retired.catalog, names), next);
  assert.equal(JSON.stringify(api.reconcileGroups(newcomer, next.catalog, names).catalog), JSON.stringify(next.catalog));
  assert.deepEqual(names, { [old.id]: '이전 자료' });
});

test('500 current names outrank historical entries and catalog retention favors named inactive groups', () => {
  const previous = { version: 1, nextId: 2, groups: Array.from({ length: 512 }, (_, i) => ({
    id: `old-${String(i).padStart(3, '0')}`, members: [`old-member-${i}`], bounds: { x: 0, y: 0, w: 20, h: 20 }, colorIndex: i % 6, active: false,
  })) };
  const scene = raw(Array.from({ length: 500 }, (_, i) => icon(`item-${String(i).padStart(3, '0')}`, 600 + i % 25 * 60, 300 + Math.floor(i / 25) * 60, 20, 20)), { groupGap: 0 });
  const names = Object.fromEntries([
    ...previous.groups.slice(-12).map(record => [record.id, '이전 이름']),
    ...scene.groups.map((group, i) => [group.id, `현재 ${i}`]),
  ]);
  const before = JSON.stringify(names);
  const start = performance.now();
  const result = api.reconcileGroups(scene, previous, names);
  assert.equal(result.catalog.groups.length, 512);
  assert.equal(result.catalog.groups.filter(group => group.active).length, 500);
  assert.deepEqual(result.catalog.groups.filter(group => !group.active).map(group => group.id), previous.groups.slice(-12).map(group => group.id));
  assert.ok(result.scene.groups.every((group, i) => group.label === `현재 ${i}`));
  for (let i = 0; i < 3; i++) {
    const restored = JSON.parse(JSON.stringify(result.catalog));
    assert.equal(JSON.stringify(api.reconcileGroups(scene, restored, names).catalog), JSON.stringify(result.catalog));
  }
  assert.ok(performance.now() - start < 5000, '500-group reconciliation must remain practical');
  assert.equal(JSON.stringify(names), before);
});

test('removal, input reorder, whole opaque-ID group moves and JSON restoration keep stable names', () => {
  const first = api.reconcileGroups(raw([icon('native-opaque-a', 100), icon('native-opaque-b', 150), icon('steady', 700)]));
  const id = groupAt(first.scene, 'native-opaque-a').id;
  const names = freeze({ [id]: '프로젝트', [groupAt(first.scene, 'steady').id]: '고정 자료' });
  const movedRaw = raw([icon('steady', 700), icon('native-opaque-a', 1900, 1200)]);
  const restored = freeze(JSON.parse(JSON.stringify(first.catalog)));
  const moved = api.reconcileGroups(movedRaw, restored, names);
  assert.equal(groupAt(moved.scene, 'native-opaque-a').id, id);
  assert.equal(groupAt(moved.scene, 'native-opaque-a').label, '프로젝트');
  assert.equal(groupAt(moved.scene, 'native-opaque-a').colorIndex, first.scene.groups[0].colorIndex);
  assert.deepEqual(groupAt(moved.scene, 'steady'), { ...groupAt(first.scene, 'steady'), label: '고정 자료' });
  const reordered = { icons: [...movedRaw.icons].reverse(), groups: [...movedRaw.groups].reverse() };
  assert.equal(JSON.stringify(api.reconcileGroups(reordered, moved.catalog, names).catalog), JSON.stringify(moved.catalog));
  assert.equal(JSON.stringify(api.reconcileGroups(movedRaw, moved.catalog, { ...names, [id]: '새 이름' }).catalog), JSON.stringify(moved.catalog));
});

test('split and merge recover inactive IDs and names with deterministic one-to-one assignments', () => {
  const togetherRaw = raw([icon('a', 100), icon('b', 150), icon('c', 200), icon('d', 250)]);
  const splitRaw = raw([icon('a', 100), icon('b', 150), icon('c', 700), icon('d', 750)]);
  const together = api.reconcileGroups(togetherRaw);
  const original = together.scene.groups[0];
  const split = api.reconcileGroups(splitRaw, together.catalog, { [original.id]: '수업' });
  assert.equal(groupAt(split.scene, 'a').id, original.id);
  assert.equal(new Set(split.scene.groups.map(group => group.id)).size, 2);
  const other = groupAt(split.scene, 'c');
  const names = freeze({ [original.id]: '수업', [other.id]: '행정' });
  const merged = api.reconcileGroups(togetherRaw, split.catalog, names);
  assert.equal(merged.scene.groups[0].id, original.id);
  assert.equal(merged.catalog.groups.find(group => group.id === other.id).active, false);
  const undo = api.reconcileGroups(splitRaw, JSON.parse(JSON.stringify(merged.catalog)), names);
  assert.equal(groupAt(undo.scene, 'a').id, original.id);
  assert.equal(groupAt(undo.scene, 'c').id, other.id);
  assert.equal(groupAt(undo.scene, 'c').label, '행정');
  assert.equal(groupAt(undo.scene, 'c').colorIndex, other.colorIndex);
  assert.deepEqual(api.reconcileGroups(splitRaw, merged.catalog, names), undo);
  assert.equal(JSON.stringify(api.reconcileGroups(splitRaw, undo.catalog, names).catalog), JSON.stringify(undo.catalog));
});

test('identical geometry has no transition and name-only updates are immediate', () => {
  assert.equal(typeof api.createSceneTransition, 'function');
  const from = freeze(api.reconcileGroups(raw([icon('a', 100), icon('b', 700)])).scene);
  const to = freeze({ ...from, groups: from.groups.map(group => ({ ...group, label: '새 이름' })) });
  const unchanged = api.createSceneTransition(from, from);
  assert.equal(unchanged.changed, false);
  assert.strictEqual(unchanged.at(0.5), from);
  const renamed = api.createSceneTransition(from, to);
  assert.equal(renamed.changed, false);
  assert.strictEqual(renamed.at(0), from);
  assert.strictEqual(renamed.at(0.5), to);
  assert.strictEqual(renamed.at(1), to);
});

test('one moving group slides at halfway while every other boundary stays fixed', () => {
  const initial = api.reconcileGroups(raw([icon('a', 100), icon('b', 700)]));
  const from = freeze(initial.scene);
  const id = groupAt(from, 'a').id;
  const to = freeze(api.reconcileGroups(raw([icon('a', 300), icon('b', 700)]), initial.catalog, { [id]: '새 모둠 이름' }).scene);
  const before = JSON.stringify({ from, to });
  const transition = api.createSceneTransition(from, to);
  assert.equal(transition.changed, true);
  assert.strictEqual(transition.at(0), from);
  assert.strictEqual(transition.at(1), to);
  const middle = transition.at(0.5);
  const moved = groupAt(middle, 'a');
  assert.deepEqual(moved.bounds, { ...groupAt(from, 'a').bounds, x: groupAt(from, 'a').bounds.x + 100 });
  assert.deepEqual(moved.hull, groupAt(from, 'a').hull.map(point => ({ ...point, x: point.x + 100 })));
  assert.equal(moved.icons[0].x, 200);
  assert.equal(middle.icons.find(item => item.id === 'a').x, 200);
  assert.equal(moved.label, '새 모둠 이름');
  assert.equal(moved.colorIndex, groupAt(to, 'a').colorIndex);
  assert.deepEqual(groupAt(middle, 'b'), groupAt(to, 'b'));
  assert.deepEqual(transition.at(0.5), middle);
  assert.equal(JSON.stringify({ from, to }), before);
});

test('membership and hull vertex-count changes interpolate finite clipped perimeters', () => {
  const start = api.reconcileGroups(raw([icon('a', 100), icon('steady', 700)]));
  const from = freeze(start.scene);
  const to = freeze(api.reconcileGroups(raw([icon('a', 100), icon('b', 150), icon('c', 100, 150), icon('steady', 700)]), start.catalog).scene);
  assert.notEqual(groupAt(from, 'a').hull.length, groupAt(to, 'a').hull.length);
  const transition = api.createSceneTransition(from, to);
  assert.equal(transition.changed, true);
  for (const t of [0.001, 0.25, 0.5, 0.75, 0.999]) {
    const frame = transition.at(t);
    for (const group of frame.groups) {
      for (const point of group.hull) assert.ok([point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 32768));
      for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(group.bounds[key]));
      for (const item of group.icons) assert.ok(['x', 'y', 'w', 'h'].every(key => Number.isFinite(item[key])));
    }
    assert.deepEqual(groupAt(frame, 'steady'), groupAt(to, 'steady'));
  }
  assert.strictEqual(transition.at(1), to);
});

test('hull orientation and cyclic phase align before sliding instead of twisting', () => {
  const first = api.reconcileGroups(raw([icon('a', 100)]));
  const from = freeze(first.scene);
  const moved = api.reconcileGroups(raw([icon('a', 300)]), first.catalog).scene;
  const reversed = [...moved.groups[0].hull].reverse();
  const rotated = [...reversed.slice(1), reversed[0]];
  const to = freeze({ ...moved, groups: [{ ...moved.groups[0], hull: rotated }] });
  const middle = api.createSceneTransition(from, to).at(0.5);
  const byXY = (a, b) => a.x - b.x || a.y - b.y;
  assert.deepEqual([...middle.groups[0].hull].sort(byXY), from.groups[0].hull.map(point => ({ x: point.x + 100, y: point.y })).sort(byXY));
  assert.strictEqual(api.createSceneTransition(from, to).at(1), to);
});

test('new and deleted groups crossfade locally without hiding unchanged old groups', () => {
  const first = api.reconcileGroups(raw([icon('steady', 100), icon('removed', 700)]));
  const from = freeze(first.scene);
  const to = freeze(api.reconcileGroups(raw([icon('steady', 100), icon('added', 1500)]), first.catalog).scene);
  const transition = api.createSceneTransition(from, to);
  assert.equal(transition.changed, true);
  const frame = transition.at(0.25);
  assert.equal(frame.groups.length, 3);
  assert.equal(groupAt(frame, 'added').opacity, 0.25);
  assert.equal(groupAt(frame, 'removed').opacity, 0.75);
  assert.deepEqual(groupAt(frame, 'steady'), groupAt(to, 'steady'));
  assert.deepEqual(groupAt(frame, 'removed').bounds, groupAt(from, 'removed').bounds);
  assert.deepEqual(groupAt(frame, 'added').hull, groupAt(to, 'added').hull);
  assert.ok(frame.groups.every(group => (group.opacity ?? 1) > 0));
  assert.strictEqual(transition.at(0), from);
  assert.strictEqual(transition.at(1), to);
});

test('native index changes alone do not animate geometry, and mixed edits use spatial icon anchors', () => {
  const first = api.reconcileGroups(raw([icon('native-0', 100), icon('native-1', 150), icon('native-2', 700)]));
  const from = freeze(first.scene);
  const reordered = api.reconcileGroups(raw([icon('native-2', 100), icon('native-1', 150), icon('native-0', 700)]), first.catalog).scene;
  const stable = api.createSceneTransition(from, reordered);
  assert.equal(stable.changed, false);
  assert.strictEqual(stable.at(0.5), reordered);
  const moved = api.reconcileGroups(raw([icon('native-2', 100), icon('native-1', 180), icon('native-0', 700)]), first.catalog).scene;
  const halfway = api.createSceneTransition(from, moved).at(0.5);
  assert.equal(halfway.icons.find(item => item.id === 'native-2').x, 100);
  assert.equal(halfway.icons.find(item => item.id === 'native-1').x, 165);
  assert.equal(halfway.icons.find(item => item.id === 'native-0').x, 700);
  assert.deepEqual(groupAt(halfway, 'native-0'), groupAt(moved, 'native-0'));
});

test('deleted native groups keep their own icon geometry when a surviving icon reuses the index', () => {
  const start = api.reconcileGroups(raw([icon('native-0', 100), icon('native-1', 700)]));
  const from = freeze(start.scene);
  const removedID = groupAt(from, 'native-0').id;
  const to = freeze(api.reconcileGroups(raw([icon('native-0', 700)]), start.catalog).scene);
  const middle = api.createSceneTransition(from, to).at(0.5);
  const removed = middle.groups.find(group => group.id === removedID);
  assert.equal(removed.opacity, 0.5);
  assert.equal(removed.icons[0].x, 100);
  assert.deepEqual(removed.hull, from.groups.find(group => group.id === removedID).hull);
  assert.equal(middle.icons.find(item => item.id === 'native-0').x, 700);
});

test('interruption starts from the currently interpolated geometry and finishes at the exact target', () => {
  const initial = api.reconcileGroups(raw([icon('a', 100), icon('retired', 700)]));
  const second = api.reconcileGroups(raw([icon('a', 200), icon('b', 250), icon('c', 200, 150), icon('new', 1500)]), initial.catalog);
  const current = freeze(api.createSceneTransition(initial.scene, second.scene).at(0.4));
  const target = freeze(api.reconcileGroups(raw([icon('a', 300), icon('b', 350), icon('c', 300, 150), icon('new', 1500)]), second.catalog).scene);
  const transition = api.createSceneTransition(current, target);
  assert.equal(transition.changed, true);
  assert.strictEqual(transition.at(0), current);
  assert.strictEqual(transition.at(1), target);
  const half = transition.at(0.5);
  const old = groupAt(current, 'a'), next = groupAt(target, 'a');
  assert.equal(groupAt(half, 'a').bounds.x, (old.bounds.x + next.bounds.x) / 2);
  assert.equal(groupAt(half, 'new').opacity, 0.7);
  assert.equal(groupAt(half, 'retired').opacity, 0.3);
  assert.ok(half.groups.flatMap(group => group.hull).every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.strictEqual(api.createSceneTransition(half, target).at(1), target);
});

test('duplicate raw membership hashes allocate IDs independently of input group order', () => {
  const scene = raw([icon('a', 100), icon('b', 700)]);
  const colliding = freeze({ ...scene, groups: scene.groups.map(group => ({ ...group, id: 'group-collision' })) });
  const first = api.reconcileGroups(colliding);
  const reversed = api.reconcileGroups({ ...colliding, icons: [...colliding.icons].reverse(), groups: [...colliding.groups].reverse() });
  assert.equal(new Set(first.catalog.groups.map(group => group.id)).size, 2);
  assert.equal(groupAt(first.scene, 'a').id, groupAt(reversed.scene, 'a').id);
  assert.equal(JSON.stringify(first.catalog), JSON.stringify(reversed.catalog));
  assert.equal(JSON.stringify(api.reconcileGroups(colliding, first.catalog).catalog), JSON.stringify(first.catalog));
});

test('transition clamps progress and returns exact endpoints for invalid non-numeric progress', () => {
  const first = api.reconcileGroups(raw([icon('a', 100)]));
  const from = freeze(first.scene);
  const to = freeze(api.reconcileGroups(raw([icon('a', 300)]), first.catalog).scene);
  const transition = api.createSceneTransition(from, to);
  for (const value of [-Infinity, -1, 0, undefined, NaN, '0.5']) assert.strictEqual(transition.at(value), from);
  for (const value of [1, 2, Infinity]) assert.strictEqual(transition.at(value), to);
});

test('raw hash-name overlays cannot leak a different group name after positional IDs change', () => {
  const first = api.reconcileGroups(raw([icon('native-0', 100), icon('native-1', 700)]));
  const leftID = groupAt(first.scene, 'native-0').id, rightID = groupAt(first.scene, 'native-1').id;
  const names = freeze({ [rightID]: '행정 자료' });
  const reordered = raw([icon('native-0', 700), icon('native-1', 100)], { groupNames: names });
  const next = api.reconcileGroups(reordered, first.catalog, names);
  const left = next.scene.groups.find(group => group.id === leftID);
  assert.notEqual(left.label, '행정 자료');
  assert.equal(next.scene.groups.find(group => group.id === rightID).label, '행정 자료');
  const retired = api.reconcileGroups(raw([]), first.catalog, names);
  const far = raw([icon('native-1', 1900, 1200)], { groupNames: names });
  const newcomer = api.reconcileGroups(far, retired.catalog, names);
  assert.notEqual(newcomer.scene.groups[0].id, rightID);
  assert.notEqual(newcomer.scene.groups[0].label, '행정 자료');
});

test('hull correspondence is cached once and degenerate perimeters remain finite', () => {
  const first = api.reconcileGroups(raw([icon('a', 100)]));
  const target = api.reconcileGroups(raw([icon('a', 100), icon('b', 150), icon('c', 100, 150)]), first.catalog).scene;
  let indexReads = 0;
  const tracked = points => new Proxy(points, { get(value, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) indexReads++;
    return Reflect.get(value, key, receiver);
  } });
  const from = { ...first.scene, groups: first.scene.groups.map(group => ({ ...group, hull: tracked(group.hull) })) };
  const to = { ...target, groups: target.groups.map(group => ({ ...group, hull: tracked(group.hull) })) };
  const transition = api.createSceneTransition(from, to);
  const preparedReads = indexReads;
  assert.ok(preparedReads > 0);
  for (let i = 1; i < 100; i++) transition.at(i / 100);
  assert.equal(indexReads, preparedReads, 'at(t) must not resample or inspect endpoint hull vertices again');
  for (const hull of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }]]) {
    const degenerate = { ...first.scene, groups: first.scene.groups.map(group => ({ ...group, hull, bounds: { x: 0, y: 0, w: 0, h: 0 } })) };
    const animation = api.createSceneTransition(degenerate, target);
    for (const t of [0.001, 0.5, 0.999]) {
      assert.ok(animation.at(t).groups.flatMap(group => group.hull).every(point => [point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 32768)));
    }
    assert.strictEqual(animation.at(1), target);
  }
});

test('first reconciliation adopts 0.1 hash IDs and saved names without mutating inputs', () => {
  assert.equal(typeof api.reconcileGroups, 'function');
  const scene = freeze(raw([icon('a', 100), icon('b', 150), icon('c', 700)]));
  const names = freeze({ [scene.groups[0].id]: '  수업 자료\u0000  ', constructor: '위험' });
  const before = JSON.stringify({ scene, names });
  const result = api.reconcileGroups(scene, undefined, names);
  assert.deepEqual(result.scene.groups.map(group => group.id), scene.groups.map(group => group.id));
  assert.equal(result.scene.groups[0].label, '수업 자료');
  assert.equal(result.scene.groups[1].label, scene.groups[1].label);
  assert.deepEqual(result.catalog, {
    version: 1, nextId: 1,
    groups: scene.groups.map(group => ({
      id: group.id, members: group.icons.map(item => item.id).sort(),
      bounds: { ...group.bounds }, colorIndex: group.colorIndex, active: true,
    })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  });
  assert.equal(JSON.stringify({ scene, names }), before);
});
