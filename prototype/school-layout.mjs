// SPDX-License-Identifier: GPL-3.0-or-later
// Pure logical-coordinate geometry shared by the preview and native wallpaper.
export const SCHOOL_THEME_IDS = Object.freeze(['chalkboard', 'playground', 'gym', 'classroom']);
export const THEME_IDS = Object.freeze(['beach', 'meadow', ...SCHOOL_THEME_IDS]);
export const DEFAULT_SETTINGS = Object.freeze({
  groupGap: 56, padding: 22, lineWidth: 3, texture: 0.45,
  showLabels: true, motion: true, waviness: 0.25, renderMode: 'outline',
  labelSize: 16, roundBoundary: 0, playgroundBoundary: false,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const plainObject = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const MAX_GROUP_NAMES = 512;

/** Keep current groups before historical keys when a saved dictionary is full. */
export function sanitizeGroupNames(input, activeIds = []) {
  const names={};
  if(!plainObject(input))return names;
  const keys=new Set([...activeIds,...Object.keys(input)]);
  let count=0;
  for(const key of keys){
    if(count>=MAX_GROUP_NAMES)break;
    if(['__proto__','constructor','prototype'].includes(key)||!Object.prototype.hasOwnProperty.call(input,key)||typeof input[key]!=='string')continue;
    const clean=Array.from(input[key].replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,40).join('');
    if(clean){names[key]=clean;count++;}
  }
  return names;
}

/** Only finite numbers and actual booleans are accepted; never coerce storage data. */
export function sanitizeSettings(input) {
  const source = plainObject(input) ? input : {};
  const result = { ...DEFAULT_SETTINGS };
  for (const [key, min, max] of [
    ['groupGap', 0, 160], ['padding', 8, 64], ['lineWidth', 1, 12], ['texture', 0, 1], ['waviness', 0, 1], ['labelSize', 11, 28], ['roundBoundary', 0, 1],
  ]) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) {
      result[key] = clamp(source[key], min, max);
    }
  }
  if (typeof source.roundBoundary === 'boolean') result.roundBoundary = source.roundBoundary ? 1 : 0;
  for (const key of ['showLabels', 'motion', 'playgroundBoundary']) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  if (['outline','fill','both'].includes(source.renderMode)) result.renderMode=source.renderMode;
  if (plainObject(source.groupNames)) result.groupNames = sanitizeGroupNames(source.groupNames);
  return result;
}

const compareID = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const edgeDistance = (a, b) => Math.hypot(
  Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
  Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h),
);

function identity(icons) {
  // Length delimiters avoid ambiguities such as ["ab", "c"] vs ["a", "bc"].
  let hash = 2166136261;
  const text = icons.map(item => `${item.id.length}:${item.id}`).join('|');
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return { id: `group-${hash.toString(36)}` };
}

/** Only the first catalog may adopt a saved 0.1 positional-membership name. */
export function initialGroupID(group, names = {}) {
  const named = id => names && typeof names === 'object' && !Array.isArray(names)
    && Object.prototype.hasOwnProperty.call(names,id) && typeof names[id] === 'string' && names[id].trim();
  return !named(group.id) && typeof group.legacyId === 'string' && named(group.legacyId) ? group.legacyId : group.id;
}

function convexHull(points) {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  if (sorted.length < 3) return sorted;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = items => {
    const chain = [];
    for (const point of items) {
      while (chain.length >= 2 && cross(chain.at(-2), chain.at(-1), point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Connected components of rectangle edge distances, not icon centers. */
export function buildScene(icons, viewport, input = {}) {
  const settings = sanitizeSettings(input);
  const width = Number.isFinite(viewport?.width) ? clamp(viewport.width, 0, 32768) : 0;
  const height = Number.isFinite(viewport?.height) ? clamp(viewport.height, 0, 32768) : 0;
  if (!width || !height || !Array.isArray(icons)) return { icons: [], groups: [] };
  const candidates = icons.filter(item => item && typeof item.id === 'string' && item.id.length > 0
    && ['x', 'y', 'w', 'h'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]))
    && item.w >= 0 && item.h >= 0 && item.x <= width && item.y <= height
    && item.x + item.w >= 0 && item.y + item.h >= 0)
    .sort((a, b) => compareID(a, b) || a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h);
  const sorted = candidates.filter((item, i) => i === 0 || item.id !== candidates[i - 1].id);
  const rectangles = sorted.map(item => {
    const x = clamp(item.x, 0, width);
    const y = clamp(item.y, 0, height);
    return { x, y, w: clamp(item.x + item.w, 0, width) - x, h: clamp(item.y + item.h, 0, height) - y };
  });
  const parent = sorted.map((_, i) => i);
  const root = index => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (edgeDistance(rectangles[i], rectangles[j]) <= settings.groupGap) parent[root(j)] = root(i);
    }
  }
  const components = new Map();
  sorted.forEach((item, index) => {
    const key = root(index);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(index);
  });
  const legacyGroups = [];
  const groups = [...components.values()].map((indices, index) => {
    const members = indices.map(i => sorted[i]);
    const rects = indices.map(i => rectangles[i]);
    let padding = settings.padding;
    // Expanding each axis can move a corner sqrt(2)*padding. Keep two distinct
    // components' expansions apart even when users choose very large padding.
    for (const i of indices) {
      for (let j = 0; j < rectangles.length; j++) {
        if (root(i) !== root(j)) {
          padding = Math.min(padding, Math.max(0, edgeDistance(rectangles[i], rectangles[j]) / (2 * Math.SQRT2) - 0.25));
        }
      }
    }
    const hull = convexHull(rects.flatMap(rect => {
      const x = clamp(rect.x - padding, 0, width);
      const y = clamp(rect.y - padding, 0, height);
      const right = clamp(rect.x + rect.w + padding, 0, width);
      const bottom = clamp(rect.y + rect.h + padding, 0, height);
      return [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }];
    }));
    const x = Math.min(...hull.map(point => point.x));
    const y = Math.min(...hull.map(point => point.y));
    const right = Math.max(...hull.map(point => point.x));
    const bottom = Math.max(...hull.map(point => point.y));
    const stable = identity(members);
    const group = {
      ...stable, colorIndex: index % 6, icons: members, bounds: { x, y, w: right - x, h: bottom - y },
      hull,
      label: settings.groupNames?.[stable.id] ?? `${index + 1}모둠`,
    };
    const aliases=members.map(icon=>icon.legacyId??icon.id);
    if(aliases.every(id=>typeof id==='string'&&/^native-\d{1,3}$/.test(id)&&Number(id.slice(7))<500)&&new Set(aliases).size===aliases.length){
      const legacyMembers=aliases.map(id=>({id})).sort(compareID);
      group.legacyId=identity(legacyMembers).id;
      legacyGroups.push({group,key:legacyMembers[0].id});
    }
    return group;
  });
  legacyGroups.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).forEach(({group},index)=>{group.legacyColorIndex=index%6;});
  const names=sanitizeGroupNames(input?.groupNames,groups.map(group=>group.id));
  groups.forEach((group,index)=>{group.label=names[group.id]??`${index+1}모둠`;});
  return { icons: sorted, groups };
}

/** Preview-only fixtures. The renderer deliberately never reads names or types. */
export function generateSampleIcons(layout = 'work', viewport = { width: 1440, height: 900 }) {
  const width = Number.isFinite(viewport?.width) ? clamp(viewport.width, 0, 32768) : 1440;
  const height = Number.isFinite(viewport?.height) ? clamp(viewport.height, 0, 32768) : 900;
  if (!width || !height) return [];
  const scale = Math.min(width / 1440, height / 900, 1.6);
  const documents = [
    ['주간 수업계획', 'doc'], ['국어 활동지', 'doc'], ['수학 평가표', 'sheet'], ['수업 자료', 'folder'],
    ['학급 명부', 'sheet'], ['출석부', 'sheet'], ['가정통신문', 'doc'], ['학부모 상담', 'folder'],
    ['모둠 활동', 'folder'], ['프로젝트 안내', 'doc'], ['발표 자료', 'slides'],
    ['학교 행사', 'folder'], ['체험학습 계획', 'doc'], ['업무 체크리스트', 'sheet'],
  ];
  const centers = layout === 'groups'
    ? [[0.20, 0.32], [0.50, 0.32], [0.80, 0.32], [0.50, 0.73]]
    : layout === 'scattered'
      ? [[0.17, 0.27], [0.52, 0.39], [0.82, 0.25], [0.76, 0.74]]
      : [[0.19, 0.32], [0.49, 0.32], [0.79, 0.32], [0.49, 0.73]];
  const result = [];
  let index = 0;
  centers.forEach(([cx, cy], group) => {
    const count = group < 2 ? 4 : 3;
    for (let n = 0; n < count; n++, index++) {
      const dx = (n % 2 - 0.5) * (layout === 'groups' ? 88 : 100) * scale;
      const dy = (Math.floor(n / 2) - 0.5) * 108 * scale;
      const jitterX = layout === 'scattered' ? (n % 2 ? 7 : -7) * scale : 0;
      const jitterY = layout === 'scattered' ? (n % 2 ? 9 : -9) * scale : 0;
      const w = 64 * scale;
      const h = 76 * scale;
      result.push({
        id: `sample-${String(index + 1).padStart(2, '0')}`,
        x: clamp(cx * width + dx + jitterX - w / 2, 0, width - w),
        y: clamp(cy * height + dy + jitterY - h / 2, 0, height - h),
        w, h, name: documents[index][0], type: documents[index][1],
      });
    }
  });
  return result;
}
