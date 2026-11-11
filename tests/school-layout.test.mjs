import test from 'node:test';
import assert from 'node:assert/strict';

const layoutURL = new URL('../prototype/school-layout.mjs', import.meta.url);
let api;
try { api = await import(layoutURL); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  api = {};
}
const viewport = { width: 1440, height: 900 };
const icon = (id, x, y, w = 64, h = 76) => ({ id, x, y, w, h });

test('settings retain the two original themes plus four school themes and exact safe defaults', () => {
  assert.deepEqual(api.THEME_IDS, ['beach', 'meadow', 'chalkboard', 'playground', 'gym', 'classroom']);
  assert.deepEqual(api.SCHOOL_THEME_IDS, ['chalkboard', 'playground', 'gym', 'classroom']);
  assert.deepEqual(api.DEFAULT_SETTINGS, {
    groupGap: 56, padding: 22, lineWidth: 3, texture: 0.45,
    showLabels: true, motion: true, waviness: 0.25, renderMode: 'outline',
    labelSize: 16, roundBoundary: 0, playgroundBoundary: false,
  });
  assert.equal(typeof api.sanitizeSettings, 'function');
  assert.deepEqual(api.sanitizeSettings(), api.DEFAULT_SETTINGS);
  assert.deepEqual(api.sanitizeSettings(null), api.DEFAULT_SETTINGS);
  assert.deepEqual(api.sanitizeSettings({
    groupGap: -10, padding: Infinity, lineWidth: 100, texture: -1,
    showLabels: false, motion: 'yes', ignored: 42,
  }), {
    groupGap: 0, padding: 22, lineWidth: 12, texture: 0,
    showLabels: false, motion: true, waviness: 0.25, renderMode: 'outline',
    labelSize: 16, roundBoundary: 0, playgroundBoundary: false,
  });
  const names = JSON.parse('{"safe":"  우리 반  ","long":"12345678901234567890123456789012345678901234567890","__proto__":"bad","constructor":"bad","prototype":"bad","number":123}');
  const settings = api.sanitizeSettings({ groupNames: names });
  assert.deepEqual(settings.groupNames, { safe: '우리 반', long: '1234567890123456789012345678901234567890' });
  assert.equal(Object.getPrototypeOf(settings.groupNames), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('groups use rectangle edge distance, Euclidean corners, and transitive connectivity', () => {
  assert.equal(typeof api.buildScene, 'function');
  const a = icon('a', 100, 100, 20, 20);
  const b = icon('b', 150, 100, 20, 20);
  const c = icon('c', 200, 100, 20, 20);
  const far = icon('far', 600, 400);
  const scene = api.buildScene([c, far, a, b], viewport, { groupGap: 30, padding: 10 });
  assert.deepEqual(scene.icons, [a, b, c, far]);
  assert.deepEqual(scene.groups.map(group => group.icons.map(item => item.id)), [['a', 'b', 'c'], ['far']]);
  assert.strictEqual(scene.groups[0].icons[0], a);
  assert.deepEqual(scene.groups.map(group => group.label), ['1모둠', '2모둠']);
  assert.deepEqual(scene.groups[0].bounds, { x: 90, y: 90, w: 140, h: 40 });
  assert.ok(scene.groups[0].hull.length >= 4);
  assert.ok(Number.isInteger(scene.groups[0].colorIndex));
  assert.equal(api.buildScene([a, b], viewport, { groupGap: 29.999 }).groups.length, 2);
  assert.equal(api.buildScene([a, icon('touch', 120, 100)], viewport, { groupGap: 0 }).groups.length, 1);
  const diagonal = [icon('a', 0, 0, 10, 10), icon('b', 13, 14, 10, 10)];
  assert.equal(api.buildScene(diagonal, viewport, { groupGap: 5 }).groups.length, 1);
  assert.equal(api.buildScene(diagonal, viewport, { groupGap: 4.999 }).groups.length, 2);
});

test('clips geometry without mutating input and rejects malformed rectangles deterministically', () => {
  const edge = Object.freeze(icon('edge', -20, -10, 50, 40));
  const point = Object.freeze(icon('point', 100, 100, 0, 0));
  const huge = Object.freeze(icon('huge', 1300, 800, 1e100, 1e100));
  const items = [edge, point, huge, null, {}, icon('', 1, 1), icon('nan', NaN, 0),
    icon('infinite', 0, 0, Infinity, 2), icon('negative', 0, 0, -1, 20),
    icon('outside', 2000, 2000), icon('string', '10', 0), icon('bad-height', 0, 0, 10, -2)];
  const scene = api.buildScene(Object.freeze(items), viewport, { padding: 22, groupGap: 0 });
  assert.deepEqual(scene.icons.map(item => item.id), ['edge', 'huge', 'point']);
  assert.strictEqual(scene.icons[0], edge);
  for (const group of scene.groups) {
    for (const p of group.hull) {
      assert.ok(Number.isFinite(p.x) && p.x >= 0 && p.x <= viewport.width);
      assert.ok(Number.isFinite(p.y) && p.y >= 0 && p.y <= viewport.height);
    }
    assert.ok(group.bounds.w >= 0 && group.bounds.h >= 0);
  }
  assert.deepEqual(api.buildScene(null, viewport), { icons: [], groups: [] });
  assert.deepEqual(api.buildScene([], null), { icons: [], groups: [] });
  assert.deepEqual(api.buildScene([edge], { width: NaN, height: -1 }), { icons: [], groups: [] });
  const duplicate = [icon('same', 300, 300), icon('same', 200, 200), icon('other', 800, 500)];
  assert.equal(api.buildScene(duplicate, viewport).icons.length, 2);
  assert.deepEqual(api.buildScene(duplicate, viewport), api.buildScene([...duplicate].reverse(), viewport));
});

test('padded hulls follow member corners without swallowing nearby separate groups', () => {
  const lShape = [icon('a', 100, 100, 30, 30), icon('b', 150, 100, 30, 30), icon('c', 100, 150, 30, 30)];
  const scene = api.buildScene(lShape, viewport, { groupGap: 20, padding: 10 });
  assert.equal(scene.groups.length, 1);
  assert.ok(scene.groups[0].hull.length > 4, 'an L-shaped component must not become a generic bounding card');
  assert.deepEqual(scene.groups[0].bounds, { x: 90, y: 90, w: 100, h: 100 });
  const closeButSeparate = api.buildScene([icon('a', 100, 100, 20, 20), icon('b', 130, 100, 20, 20)], viewport,
    { groupGap: 0, padding: 100 });
  assert.equal(closeButSeparate.groups.length, 2);
  const [left, right] = closeButSeparate.groups;
  assert.ok(left.bounds.x + left.bounds.w < right.bounds.x, 'large padding must not visually join components');
  assert.deepEqual(api.buildScene([...lShape].reverse(), viewport, { groupGap: 20, padding: 10 }), scene);
  const renamed = api.buildScene(lShape, viewport, { groupNames: { [scene.groups[0].id]: '프로젝트 모둠' } });
  assert.equal(renamed.groups[0].label, '프로젝트 모둠');
  const moved = api.buildScene(lShape.map(item => ({ ...item, x: item.x + 3 })), viewport, { groupGap: 20 });
  assert.equal(moved.groups[0].id, scene.groups[0].id);
  assert.equal(moved.groups[0].colorIndex, scene.groups[0].colorIndex);
});

test('teacher samples provide responsive, deterministic separated document clusters', () => {
  assert.equal(typeof api.generateSampleIcons, 'function');
  for (const layout of ['work', 'groups', 'scattered']) {
    const icons = api.generateSampleIcons(layout, viewport);
    assert.ok(icons.length >= 12 && icons.length <= 16);
    assert.equal(new Set(icons.map(item => item.id)).size, icons.length);
    assert.ok(icons.every(item => /[가-힣]/.test(item.name) && typeof item.type === 'string'));
    assert.deepEqual(icons, api.generateSampleIcons(layout, viewport));
    const scene = api.buildScene(icons, viewport);
    assert.equal(scene.icons.length, icons.length);
    assert.ok(scene.groups.length >= 3 && scene.groups.length <= 4, `${layout}: 3–4 clusters`);
    for (const view of [viewport, { width: 390, height: 700 }, { width: 2560, height: 1440 }]) {
      for (const item of api.generateSampleIcons(layout, view)) {
        assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= view.width && item.y + item.h <= view.height);
      }
    }
  }
  assert.notDeepEqual(api.generateSampleIcons('work'), api.generateSampleIcons('groups'));
  assert.notDeepEqual(api.generateSampleIcons('work'), api.generateSampleIcons('scattered'));
  assert.deepEqual(api.generateSampleIcons('unknown'), api.generateSampleIcons('work'));
  assert.deepEqual(api.generateSampleIcons('work', { width: 0, height: 0 }), []);
  const many = Array.from({ length: 500 }, (_, i) => icon(`item-${String(i).padStart(3, '0')}`, (i % 25) * 50 + 2, Math.floor(i / 25) * 40 + 2, 20, 20));
  const scene = api.buildScene(many, viewport, { groupGap: 18 });
  assert.equal(scene.icons.length, 500);
  assert.equal(scene.groups.length, 500);
  assert.deepEqual(api.buildScene([...many].reverse(), viewport, { groupGap: 18 }), scene);
});

test('separate sample groups get distinct accessible tape palette slots before colors repeat', () => {
  const scene = api.buildScene(api.generateSampleIcons(), viewport);
  assert.equal(new Set(scene.groups.map(group => group.colorIndex)).size, scene.groups.length);
  assert.ok(scene.groups.every(group => group.colorIndex >= 0 && group.colorIndex < 6));
  const rearranged = api.buildScene([...scene.icons].reverse(), viewport);
  assert.deepEqual(rearranged.groups.map(group => group.colorIndex), scene.groups.map(group => group.colorIndex));
});
