// SPDX-License-Identifier: GPL-3.0-or-later
// Persistent spatial identities and pure, per-group geometry transitions.
import { sanitizeGroupNames, initialGroupID } from './school-layout.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const LIMIT = 32768;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const plain = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && !Object.keys(value).some(key => forbidden.has(key));
const validID = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) && !forbidden.has(id);
const validMember = id => typeof id === 'string' && id.length > 0 && id.length <= 256
  && !/[\u0000-\u001f\u007f]/.test(id) && !forbidden.has(id);
const membersOf = values => [...new Set(values.filter(validMember))].sort(compare).slice(0, 500);
const paletteIndex = value => Number.isInteger(value) && value >= 0 && value < 6 ? value : 0;

function clippedRect(rect) {
  const x = clamp(rect.x, 0, LIMIT);
  const y = clamp(rect.y, 0, LIMIT);
  return { x, y, w: Math.max(0, clamp(rect.x + rect.w, 0, LIMIT) - x), h: Math.max(0, clamp(rect.y + rect.h, 0, LIMIT) - y) };
}

/** Whitelist persisted fields; never retain objects or keys from storage. */
export function sanitizeGroupCatalog(input) {
  const result = { version: 1, nextId: 1, groups: [] };
  if (!plain(input) || input.version !== 1 || !Array.isArray(input.groups)) return result;
  if (Number.isSafeInteger(input.nextId) && input.nextId > 0) result.nextId = input.nextId;
  const seen = new Set();
  for (const record of input.groups) {
    if (!plain(record) || !validID(record.id) || seen.has(record.id) || !Array.isArray(record.members)
      || !plain(record.bounds) || !['x', 'y', 'w', 'h'].every(key => typeof record.bounds[key] === 'number' && Number.isFinite(record.bounds[key]))
      || record.bounds.w < 0 || record.bounds.h < 0) continue;
    seen.add(record.id);
    const clean = {
      id: record.id, members: membersOf(record.members), bounds: clippedRect(record.bounds),
      colorIndex: paletteIndex(record.colorIndex), active: record.active === true,
    };
    if (Number.isSafeInteger(record.recency) && record.recency >= 0) clean.recency = record.recency;
    result.groups.push(clean);
  }
  const active = result.groups.filter(record => record.active).slice(0, 500);
  const inactive = result.groups.filter(record => !record.active).slice(0, 512 - active.length);
  result.groups = [...active, ...inactive].sort((a, b) => compare(a.id, b.id));
  return result;
}

const positionalID = id => /^native-\d+$/.test(id);
const rectEqual = (a, b) => ['x', 'y', 'w', 'h'].every(key => a[key] === b[key]);

function matchScore(item, record, memberSet) {
  const shared = item.members.reduce((count, id) => count + Number(memberSet.has(id)), 0);
  const largest = Math.max(item.members.length, record.members.length, 1);
  const membership = shared / largest;
  const exactMembers = shared > 0 && shared === item.members.length && shared === record.members.length;
  const a = item.group.bounds, b = record.bounds;
  const distance = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
  const activeBonus = record.active ? 10 : 0;
  const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const spatialTie=overlap/Math.max(1,a.w*a.h+b.w*b.h-overlap)*100+1/(1+distance);
  // Re-enumerated native-N IDs are positional; exact opaque membership is
  // trustworthy and must win even when two groups exchange their old bounds.
  const opaqueShared = item.members.some(id => !positionalID(id) && memberSet.has(id));
  if (exactMembers && opaqueShared) return 12000 + activeBonus;
  // For a split/merge, equal member shares still prefer the stationary fragment.
  if (opaqueShared && membership >= 0.5) return 11000 + membership * 600 + spatialTie + activeBonus;
  if (rectEqual(a, b)) return 10000 + (exactMembers ? 500 : 0) + membership * 100 + activeBonus;
  if (overlap > 0) {
    const union = a.w * a.h + b.w * b.h - overlap;
    return 6000 + overlap / Math.max(1, union) * 600 + membership * 200 + activeBonus;
  }

  const reach = Math.max(48, Math.min(128, Math.hypot(b.w, b.h) * 0.6));
  if (distance <= reach) return 2000 + (1 - distance / reach) * 600 + membership * 200 + activeBonus;
  return shared && record.active ? 1000 + membership * 600 + activeBonus : 0;
}

/** Reconcile a buildScene() result without modifying it or the name dictionary. */
export function reconcileGroups(rawScene, previousCatalog, names = {}) {
  const previous = sanitizeGroupCatalog(previousCatalog);
  const source = Array.isArray(rawScene?.groups) ? rawScene.groups.slice(0, 500) : [];
  const current = source.map((group, index) => {
    const members = membersOf(group.icons.map(icon => icon.id));
    return { group, index, members, key: JSON.stringify([group.id, members, group.bounds.x, group.bounds.y, group.bounds.w, group.bounds.h]) };
  });
  const edges = [];
  for (const record of previous.groups) {
    const memberSet = new Set(record.members);
    for (const item of current) {
      const score = matchScore(item, record, memberSet);
      if (score > 0) edges.push({ item, record, score });
    }
  }
  edges.sort((a, b) => b.score - a.score || compare(a.record.id, b.record.id) || compare(a.item.key, b.item.key));
  const assignments = new Map();
  const used = new Set();
  for (const { item, record } of edges) {
    if (!assignments.has(item.index) && !used.has(record.id)) {
      assignments.set(item.index, record);
      used.add(record.id);
    }
  }
  // Keep retired IDs reserved: a reused raw membership hash is not an identity.
  const reserved = new Set(previous.groups.map(record => record.id));
  const ids = [];
  let nextId = previous.nextId;
  for (const item of [...current].sort((a, b) => compare(a.key, b.key))) {
    const existing = assignments.get(item.index);
    if (existing) { ids[item.index] = existing.id; continue; }
    const initial = previous.groups.length ? item.group.id : initialGroupID(item.group,names);
    const base = validID(initial) ? initial : 'group';
    let id = base;
    while (reserved.has(id)) {
      id = `${base.slice(0, 108)}-${nextId}`;
      nextId = nextId === Number.MAX_SAFE_INTEGER ? 1 : nextId + 1;
    }
    ids[item.index] = id;
    reserved.add(id);
  }
  const safeNames = sanitizeGroupNames(names, ids);
  const rawNames = sanitizeGroupNames(names, source.map(group => group.id));
  const records = [];
  const groups = current.map((item, index) => {
    const record = assignments.get(item.index);
    const migratedColor = !previous.groups.length && ids[index] === item.group.legacyId ? item.group.legacyColorIndex : undefined;
    const group = { ...item.group, id: ids[index], colorIndex: record?.colorIndex ?? migratedColor ?? item.group.colorIndex };
    // buildScene may already contain a legacy hash-name overlay. Once the
    // hash belongs to a different identity, never inherit that other name.
    const staleOverlay = group.id !== item.group.id && rawNames[item.group.id] === item.group.label;
    group.label = safeNames[group.id] ?? (staleOverlay ? `${index + 1}모둠` : group.label) ?? `${index + 1}모둠`;
    records.push({ id: group.id, members: item.members, bounds: { ...group.bounds }, colorIndex: group.colorIndex, active: true });
    return group;
  });
  const inactive = previous.groups.filter(record => !used.has(record.id))
    .sort((a, b) => Number(Boolean(safeNames[b.id])) - Number(Boolean(safeNames[a.id])) || compare(a.id, b.id))
    .slice(0, 512 - records.length);
  for (const record of inactive) records.push({ ...record, active: false });
  records.sort((a, b) => compare(a.id, b.id));
  return { scene: { ...rawScene, icons: rawScene?.icons ?? [], groups }, catalog: { version: 1, nextId, groups: records } };
}

const mix = (a, b, t) => a + (b - a) * t;
const pointEqual = (a, b) => a.x === b.x && a.y === b.y;
const hullEqual = (a, b) => a.length === b.length && a.every((point, index) => pointEqual(point, b[index]));
const interpolateRect = (a, b, t) => clippedRect({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });

const rectKey = icon => `${icon.x},${icon.y},${icon.w},${icon.h}`;

function sameIcons(a, b) {
  if (a.length !== b.length) return false;
  // Icon IDs are not geometry. Explorer may re-enumerate all native-N IDs
  // without moving a single rectangle; that must not start an animation.
  const counts = new Map();
  const key = icon => `${rectKey(icon)},${opacityOf(icon)}`;
  for (const icon of a) counts.set(key(icon), (counts.get(key(icon)) ?? 0) + 1);
  return b.every(icon => {
    const count = counts.get(key(icon)) ?? 0;
    if (!count) return false;
    counts.set(key(icon), count - 1);
    return true;
  });
}

function iconCorrespondence(fromScene, toScene) {
  const old = new Map(fromScene.icons.map(icon => [icon.id, icon]));
  const currentIDs = new Set(toScene.icons.map(icon => icon.id));
  const used = new Set(), pairs = new Map(), anchors = new Map();
  const pair = (to, from) => { pairs.set(to.id, from); used.add(from.id); };
  for (const from of [...fromScene.icons].sort((a, b) => compare(a.id, b.id))) if (positionalID(from.id)) {
    const key = rectKey(from);
    if (!anchors.has(key)) anchors.set(key, []);
    anchors.get(key).push(from);
  }
  // Opaque native IDs are trustworthy; positional IDs first follow unchanged
  // rectangles, then fall back to membership for genuinely moved icons.
  for (const to of toScene.icons) if (!positionalID(to.id) && old.has(to.id)) pair(to, old.get(to.id));
  for (const to of toScene.icons) if (positionalID(to.id)) {
    const candidates = anchors.get(rectKey(to)) ?? [];
    const from = candidates.find(icon => icon.id === to.id && !used.has(icon.id)) ?? candidates.find(icon => !used.has(icon.id));
    if (from) pair(to, from);
  }
  for (const to of toScene.icons) if (!pairs.has(to.id) && old.has(to.id) && !used.has(to.id)) pair(to, old.get(to.id));
  const plans = toScene.icons.map(to => ({ from: pairs.get(to.id), to }));
  const deletedIDs = new Set();
  for (const from of fromScene.icons) if (!used.has(from.id) && !currentIDs.has(from.id)) {
    plans.push({ from, to: null });
    deletedIDs.add(from.id);
  }
  return { plans, deletedIDs };
}

function normalizedHull(hull, bounds) {
  let points = [];
  for (const point of hull) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    const clean = { x: clamp(point.x, 0, LIMIT), y: clamp(point.y, 0, LIMIT) };
    if (!points.length || !pointEqual(points.at(-1), clean)) points.push(clean);
  }
  if (points.length > 1 && pointEqual(points[0], points.at(-1))) points.pop();
  if (!points.length) {
    const { x, y, w, h } = clippedRect(bounds);
    points = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }
  const area = points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (area < 0) points.reverse();
  let first = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[first].x || points[i].x === points[first].x && points[i].y < points[first].y) first = i;
  }
  return [...points.slice(first), ...points.slice(0, first)];
}

function bestRotation(a, b) {
  const center = points => points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
  const ca = center(a), cb = center(b);
  let best = 0, bestCost = Infinity;
  for (let shift = 0; shift < b.length; shift++) {
    let cost = 0;
    for (let i = 0; i < a.length; i++) {
      const to = b[(i + shift) % b.length];
      cost += (a[i].x - ca.x - to.x + cb.x) ** 2 + (a[i].y - ca.y - to.y + cb.y) ** 2;
    }
    if (cost < bestCost) { best = shift; bestCost = cost; }
  }
  return best;
}

function perimeter(points) {
  const lengths = [0];
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    lengths.push(lengths.at(-1) + Math.hypot(next.x - points[i].x, next.y - points[i].y));
  }
  const total = lengths.at(-1);
  return {
    fractions: total ? lengths.slice(0, -1).map(length => length / total) : [0],
    sample(fraction) {
      if (!total) return { ...points[0] };
      const distance = ((fraction % 1 + 1) % 1) * total;
      let lo = 0, hi = points.length;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (lengths[mid] <= distance) lo = mid; else hi = mid;
      }
      const amount = lengths[lo + 1] - lengths[lo];
      const t = amount ? (distance - lengths[lo]) / amount : 0;
      const a = points[lo], b = points[(lo + 1) % points.length];
      return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
    },
  };
}

/** Prepare correspondence once; include both polygons' corner breakpoints.
 * Unlike uniform samples alone this preserves every endpoint corner, avoiding
 * a one-frame shape jump when vertex counts differ or animation is interrupted.
 */
function alignedHulls(a, b) {
  if (a.length === b.length) {
    const shift = bestRotation(a, b);
    return [a, b.map((_, index) => b[(index + shift) % b.length])];
  }
  const pa = perimeter(a), pb = perimeter(b);
  const count = clamp(Math.max(a.length, b.length) * 2, 16, 128);
  const samplesA = Array.from({ length: count }, (_, i) => pa.sample(i / count));
  const samplesB = Array.from({ length: count }, (_, i) => pb.sample(i / count));
  const phase = bestRotation(samplesA, samplesB) / count;
  const fractions = [...new Set([0, ...pa.fractions, ...pb.fractions.map(t => (t - phase + 1) % 1)])].sort((a, b) => a - b);
  return [fractions.map(t => pa.sample(t)), fractions.map(t => pb.sample(t + phase))];
}

const opacityOf = value => Number.isFinite(value?.opacity) ? clamp(value.opacity, 0, 1) : 1;

/** Endpoints are the original scenes, including when a transition is interrupted.
 * The caller draws each returned boundary fully (progress=1); only individual
 * geometry/opacity changes here, never a scene-wide line-reveal animation.
 */
export function createSceneTransition(fromScene, toScene) {
  const oldGroups = new Map(fromScene.groups.map(group => [group.id, group]));
  const newGroups = new Map(toScene.groups.map(group => [group.id, group]));
  const { plans: iconPlans, deletedIDs } = iconCorrespondence(fromScene, toScene);
  const plans = toScene.groups.map(group => {
    const from = oldGroups.get(group.id);
    const toHull = normalizedHull(group.hull, group.bounds);
    const fromHull = from ? normalizedHull(from.hull, from.bounds) : toHull;
    const fixed = from && rectEqual(from.bounds, group.bounds) && hullEqual(fromHull, toHull)
      && sameIcons(from.icons, group.icons) && opacityOf(from) === opacityOf(group);
    const [a, b] = fixed ? [fromHull, toHull] : alignedHulls(fromHull, toHull);
    const iconIDs = group.icons.map(icon => icon.id);
    if (from) for (const icon of from.icons) if (deletedIDs.has(icon.id)) iconIDs.push(icon.id);
    return { from, to: group, fixed, a, b, iconIDs };
  });
  for (const from of fromScene.groups) if (!newGroups.has(from.id)) {
    plans.push({ from, to: null, fixed: false, iconIDs: from.icons.map(icon => icon.id) });
  }
  const changed = plans.some(plan => !plan.fixed) || !sameIcons(fromScene.icons, toScene.icons);
  return { changed, at(t) {
    if (typeof t !== 'number' || Number.isNaN(t)) t = 0;
    if (t <= 0) return fromScene;
    if (t >= 1 || !changed) return toScene;
    const icons = iconPlans.map(({ from, to }) => {
      if (from && to && rectEqual(from, to) && opacityOf(from) === opacityOf(to)) return to;
      return { ...(to ?? from), ...interpolateRect(from ?? to, to ?? from, t),
        opacity: mix(from ? opacityOf(from) : 0, to ? opacityOf(to) : 0, t) };
    });
    const iconMap = new Map(icons.map(icon => [icon.id, icon]));
    const groups = plans.map(plan => {
      if (plan.fixed) return plan.to;
      const opacity = mix(plan.from ? opacityOf(plan.from) : 0, plan.to ? opacityOf(plan.to) : 0, t);
      // A retired group's native-N index may already identify a different live
      // icon. Keep its fading desks at their own old rectangles, not the new ID.
      const icons = plan.to ? plan.iconIDs.map(id => iconMap.get(id)) : plan.from.icons;
      const style = plan.to ?? plan.from;
      if (!plan.from || !plan.to) return { ...style, opacity, icons };
      return { ...style, opacity,
        bounds: interpolateRect(plan.from.bounds, plan.to.bounds, t),
        hull: plan.b.map((point, index) => ({ x: clamp(mix(plan.a[index].x, point.x, t), 0, LIMIT), y: clamp(mix(plan.a[index].y, point.y, t), 0, LIMIT) })),
        icons,
      };
    });
    return { ...toScene, icons, groups };
  } };
}
