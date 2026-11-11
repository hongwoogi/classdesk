// SPDX-License-Identifier: GPL-3.0-or-later
import { SCHOOL_THEME_IDS, sanitizeSettings } from './school-layout.mjs';
import {layoutGroupLabels} from './group-labels.mjs';
import {PLAYGROUND_LOOKS,PLAYGROUND_FRAMES,PLAYGROUND_FIGURE_BOX,PLAYGROUND_FIGURE_SCALE,staticPlaygroundCrowd,paintPlaygroundCrowd,paintPlaygroundFigure,playgroundPaintOrder} from './playground-crowd.mjs';

const W = 1440;
const H = 900;
const FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const opacityOf=group=>Number.isFinite(group?.opacity)?clamp(group.opacity,0,1):1;

// Keep only the current material per target context. Playground needs a clean
// floor and a crowded floor; both share the existing total raster-pixel budget.
const backgroundCache = new WeakMap();

function randomFor(seed) {
  let state = 2166136261;
  for (const ch of String(seed)) state = Math.imul(state ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundedRect(ctx, x, y, w, h, radius = 6) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function gradient(ctx, x1, y1, x2, y2, stops) {
  const fill = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [offset, color] of stops) fill.addColorStop(offset, color);
  return fill;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function grain(ctx, texture, seed, light, dark, count = 6500) {
  if (!texture) return;
  const random = randomFor(seed);
  for (let i = 0; i < Math.floor(count * texture); i++) {
    ctx.fillStyle = i % 3 ? dark : light;
    const size = 0.45 + random() * 1.15;
    ctx.fillRect(random() * W, random() * H, size, size * (0.55 + random()));
  }
}

function chalkboardBackground(ctx, texture) {
  ctx.fillStyle = '#1c4036';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = gradient(ctx, 0, 0, W, H, [[0, '#244c40'], [0.48, '#1c4036'], [1, '#173b32']]);
  ctx.fillRect(0, 0, W, H);
  if (texture) {
    const random = randomFor('eraser-sweeps');
    for (let i = 0; i < 19; i++) {
      ctx.fillStyle = `rgba(213,227,205,${(0.007 + random() * 0.009) * texture})`;
      ctx.beginPath();
      ctx.ellipse(130 + random() * 1180, 90 + random() * 690, 100 + random() * 200,
        12 + random() * 28, (random() - 0.5) * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grain(ctx, texture, 'pine-grain', 'rgba(225,236,207,0.13)', 'rgba(5,23,17,0.12)');
  ctx.fillStyle = gradient(ctx, 0, 0, 14, 12, [[0, '#75573e'], [0.5, '#a57c53'], [1, '#604832']]);
  ctx.fillRect(0, 0, W, 12);
  ctx.fillRect(0, 0, 12, H);
  ctx.fillRect(W - 12, 0, 12, H);
  ctx.strokeStyle = 'rgba(4,22,17,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, W - 26, H - 38);
  ctx.fillStyle = gradient(ctx, 0, H - 25, 0, H, [[0, '#b38a5d'], [0.2, '#c09a6d'], [0.35, '#80603e'], [1, '#59432f']]);
  ctx.fillRect(0, H - 25, W, 25);
  ctx.fillStyle = 'rgba(6,24,17,0.22)';
  ctx.fillRect(13, H - 28, W - 26, 3);
  ctx.fillStyle = '#dadbca';
  roundedRect(ctx, 1118, H - 31, 33, 5, 2);
  ctx.fill();
  ctx.fillStyle = '#d6c6aa';
  roundedRect(ctx, 1160, H - 30, 23, 4, 1.5);
  ctx.fill();
  ctx.fillStyle = '#514d42';
  roundedRect(ctx, 1214, H - 37, 54, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#a58b65';
  roundedRect(ctx, 1215, H - 40, 52, 8, 3);
  ctx.fill();
}

function playgroundBackground(ctx, texture) {
  ctx.fillStyle = '#d7c39c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = gradient(ctx, 0, 0, W, H, [[0, '#dfcca7'], [0.55, '#d7c39c'], [1, '#cbb58b']]);
  ctx.fillRect(0, 0, W, H);
  if (texture) {
    const random = randomFor('dirt-rake');
    ctx.strokeStyle = `rgba(131,106,70,${0.045 * texture})`;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 70; i++) {
      const x = random() * W;
      const y = random() * H;
      line(ctx, x, y, x + 40 + random() * 110, y - 2 + random() * 4);
    }
  }
  grain(ctx, texture, 'ochre-dirt', 'rgba(255,249,223,0.23)', 'rgba(126,99,61,0.18)', 12000);
  ctx.strokeStyle = 'rgba(161,113,88,0.25)';
  ctx.lineWidth = 78;
  roundedRect(ctx, 104, 102, W - 208, H - 204, 292);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,249,228,0.42)';
  for (let i = -2; i <= 2; i++) {
    const inset = i * 16;
    roundedRect(ctx, 104 + inset, 102 + inset, W - 208 - inset * 2, H - 204 - inset * 2, 292 - inset);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,251,229,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(452, 253, 536, 394);
  line(ctx, 720, 253, 720, 647);
  ctx.beginPath();
  ctx.arc(720, 450, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(452, 365, 88, 170);
  ctx.strokeRect(900, 365, 88, 170);
  ctx.strokeStyle = 'rgba(255,251,229,0.34)';
  ctx.lineWidth = 3;
  line(ctx, 58, 450, 141, 450);
  line(ctx, W - 141, 450, W - 58, 450);
}

function gymBackground(ctx, texture) {
  ctx.fillStyle = '#cfa86e';
  ctx.fillRect(0, 0, W, H);
  const random = randomFor('maple-planks');
  for (let row = 0, y = 0; y < H; row++, y += 42) {
    for (let x = -((row % 3) * 112); x < W;) {
      const length = 240 + random() * 130;
      const tone = 63 + random() * 9;
      ctx.fillStyle = gradient(ctx, 0, y, 0, y + 42, [
        [0, `hsl(35, 48%, ${tone + 2}%)`], [0.13, `hsl(35, 47%, ${tone}%)`], [1, `hsl(34, 46%, ${tone - 3}%)`],
      ]);
      ctx.fillRect(x, y, length, 42);
      ctx.strokeStyle = 'rgba(101,67,32,0.19)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x, y, length, 42);
      if (texture) {
        ctx.strokeStyle = `rgba(112,74,33,${0.13 * texture})`;
        ctx.lineWidth = 0.55;
        for (let i = 0; i < 7; i++) {
          const gy = y + 4 + random() * 33;
          const gx = x + random() * 25;
          const extent = length * (0.5 + random() * 0.45);
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.bezierCurveTo(gx + extent * 0.3, gy - 2, gx + extent * 0.6, gy + 2, gx + extent, gy - 1);
          ctx.stroke();
        }
      }
      x += length;
    }
  }
  grain(ctx, texture, 'maple-grain', 'rgba(255,246,214,0.11)', 'rgba(104,65,29,0.08)', 4000);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(249,246,223,0.43)';
  ctx.strokeRect(130, 95, W - 260, H - 190);
  line(ctx, 720, 95, 720, H - 95);
  ctx.beginPath();
  ctx.arc(720, 450, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(130, 320, 180, 260);
  ctx.strokeRect(W - 310, 320, 180, 260);
  for (const [x, start, end] of [[310, -Math.PI / 2, Math.PI / 2], [W - 310, Math.PI / 2, Math.PI * 1.5]]) {
    ctx.beginPath();
    ctx.arc(x, 450, 90, start, end);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(72,100,108,0.17)';
  ctx.lineWidth = 2;
  ctx.strokeRect(280, 174, 880, 552);
  line(ctx, 720, 174, 720, 726);
  line(ctx, 480, 174, 480, 726);
  line(ctx, 960, 174, 960, 726);
  ctx.fillStyle = gradient(ctx, 0, 0, W, H, [[0, 'rgba(255,247,214,0.09)'], [0.6, 'rgba(255,247,214,0)'], [1, 'rgba(90,58,22,0.06)']]);
  ctx.fillRect(0, 0, W, H);
}

function classroomBackground(ctx, texture) {
  ctx.fillStyle = '#f2eee4';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(157,148,124,0.09)';
  ctx.lineWidth = 0.6;
  for (let x = 72; x < W; x += 72) line(ctx, x, 59, x, H - 58);
  for (let y = 58; y < H; y += 72) line(ctx, 48, y, W - 48, y);
  grain(ctx, texture, 'architect-paper', 'rgba(255,255,247,0.3)', 'rgba(126,117,89,0.08)', 5000);
  ctx.fillStyle = gradient(ctx, 48, 0, 430, 0, [[0, 'rgba(255,255,248,0.52)'], [1, 'rgba(255,255,248,0)']]);
  ctx.fillRect(48, 68, 382, H - 136);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#a5a795';
  line(ctx, 48, 58, W - 48, 58);
  line(ctx, 48, 58, 48, H - 58);
  line(ctx, 48, H - 58, W - 48, H - 58);
  line(ctx, W - 48, 58, W - 48, 678);
  line(ctx, W - 48, 770, W - 48, H - 58);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(98,108,94,0.5)';
  line(ctx, 56, 66, W - 56, 66);
  line(ctx, 56, H - 66, W - 56, H - 66);
  // Windows interrupt the west wall with paired glazing and mullions.
  for (const y of [166, 382, 598]) {
    ctx.fillStyle = '#e4eeea';
    ctx.fillRect(41, y, 15, 124);
    ctx.strokeStyle = '#97b0aa';
    ctx.lineWidth = 1;
    ctx.strokeRect(41, y, 15, 124);
    line(ctx, 48, y, 48, y + 124);
    line(ctx, 41, y + 62, 56, y + 62);
  }
  // A top-down chalkboard and a single rectangular teacher's table.
  ctx.fillStyle = '#b1a18a';
  ctx.fillRect(482, 44, 476, 30);
  ctx.fillStyle = '#34574b';
  ctx.fillRect(487, 47, 466, 22);
  ctx.fillStyle = '#c8b99b';
  ctx.fillRect(490, 70, 460, 4);
  ctx.fillStyle = 'rgba(115,103,82,0.09)';
  roundedRect(ctx, 648, 112, 148, 63, 3);
  ctx.fill();
  ctx.fillStyle = '#d7c5a5';
  roundedRect(ctx, 646, 108, 148, 62, 3);
  ctx.fill();
  ctx.strokeStyle = '#9f9075';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  line(ctx, 654, 116, 786, 116);
  roundedRect(ctx, 699, 180, 42, 16, 3);
  ctx.stroke();
  ctx.strokeStyle = '#8a9b8c';
  ctx.lineWidth = 1.3;
  line(ctx, W - 48, 770, W - 130, 770);
  ctx.beginPath();
  ctx.arc(W - 48, 770, 82, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(124,135,119,0.35)';
  line(ctx, 108, H - 31, W - 110, H - 31);
  for (const x of [108, 720, W - 110]) line(ctx, x - 3, H - 35, x + 3, H - 27);
}

const TAPE_COLORS = ['#427c83', '#b68d35', '#b66451', '#557da4', '#6f845b', '#8b6f90'];

function classroomGroup(ctx, group, width, height, settings, progress) {
  if(settings.renderMode!=='fill'){
    traceHull(ctx, group.hull, progress);
    ctx.globalAlpha = 0.42 * progress * opacityOf(group);
    ctx.strokeStyle = '#879781';
    ctx.lineWidth = Math.max(1, settings.lineWidth * 0.5);
    ctx.setLineDash([5, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = progress * opacityOf(group);
  for (const item of group.icons ?? []) {
    const left = clamp(item.x, 0, width);
    const top = clamp(item.y, 0, height);
    const right = clamp(item.x + item.w, 0, width);
    const bottom = clamp(item.y + item.h, 0, height);
    const side = Math.min(Math.max(right - left, bottom - top) + 16, width, height);
    const x = clamp((left + right - side) / 2, 0, width - side);
    const y = clamp((top + bottom - side) / 2, 0, height - side);
    ctx.fillStyle = 'rgba(112,98,67,0.08)';
    ctx.fillRect(x + 2, y + 3, side, side);
    ctx.fillStyle = '#e3d2b0';
    ctx.fillRect(x, y, side, side);
    ctx.strokeStyle = '#ab9672';
    ctx.lineWidth = Math.max(1, settings.lineWidth * 0.45);
    ctx.strokeRect(x + 0.5, y + 0.5, side - 1, side - 1);
    ctx.strokeStyle = 'rgba(174,150,110,0.54)';
    ctx.lineWidth = 0.8;
    line(ctx, x + 5, y + 5, x + side - 5, y + 5);
    // Four small leg markers and an unobtrusive chair establish real furniture.
    ctx.fillStyle = '#a6a18f';
    for (const dx of [3, side - 6]) for (const dy of [3, side - 6]) ctx.fillRect(x + dx, y + dy, 3, 3);
    ctx.strokeStyle = '#aaa892';
    roundedRect(ctx, x + side / 2 - 15, y + side + 4, 30, 10, 2);
    ctx.stroke();
  }
}

function tapeBoundary(ctx, group, settings, progress) {
  const color = TAPE_COLORS[(group.colorIndex ?? 0) % TAPE_COLORS.length];
  const thickness = settings.lineWidth * 2.4 + 2;
  const random = randomFor(`${group.id}:tape`);
  let remaining = perimeter(group.hull) * progress;
  ctx.lineCap = 'butt';
  for (let i = 0; i < group.hull.length; i++) {
    if (remaining <= 0) break;
    const a = group.hull[i];
    const b = group.hull[(i + 1) % group.hull.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const nx = -uy;
    const ny = ux;
    const revealedLength = Math.min(length, remaining);
    const overlap = Math.min(4, revealedLength / 8);
    const start = { x: a.x - ux * overlap, y: a.y - uy * overlap };
    const end = { x: a.x + ux * (revealedLength + overlap), y: a.y + uy * (revealedLength + overlap) };
    remaining -= length;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85 * opacityOf(group);
    ctx.lineWidth = thickness;
    line(ctx, start.x, start.y, end.x, end.y);
    // A torn paper edge at each end, not a luminous/rounded vector tube.
    for (const p of [start, end]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let j = 0; j <= 5; j++) {
        const offset = (j / 5 - 0.5) * thickness;
        const tear = (random() - 0.5) * 3;
        const x = p.x + nx * offset + ux * tear;
        const y = p.y + ny * offset + uy * tear;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(p.x + nx * thickness / 2 - ux * 2, p.y + ny * thickness / 2 - uy * 2);
      ctx.lineTo(p.x - nx * thickness / 2 - ux * 2, p.y - ny * thickness / 2 - uy * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,251,225,0.26)';
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = opacityOf(group);
    line(ctx, start.x + nx * thickness * 0.25, start.y + ny * thickness * 0.25,
      end.x + nx * thickness * 0.25, end.y + ny * thickness * 0.25);
  }
  ctx.globalAlpha = 1;
}

function circularHull(group, width, height) {
  const b = group.bounds;
  if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return group.hull;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = Math.max(12, b.w * 0.54), ry = Math.max(12, b.h * 0.54);
  const count = 48, points = [];
  for (let i = 0; i < count; i++) {
    const t = i / count * Math.PI * 2 - Math.PI * .75;
    points.push({ x: clamp(cx + Math.cos(t) * rx, 0, width), y: clamp(cy + Math.sin(t) * ry, 0, height) });
  }
  return points;
}

function roundedHull(group, width, height, roundBoundary) {
  const r = typeof roundBoundary === 'number' && Number.isFinite(roundBoundary)
    ? clamp(roundBoundary, 0, 1) : roundBoundary ? 1 : 0;
  const base = group.hull;
  if (!r || !base || base.length < 3) return base;
  const circle = circularHull(group, width, height);
  if (r >= 1) return circle;
  const n = base.length, rounded = [];
  for (let i = 0; i < n; i++) {
    const prev = base[(i + n - 1) % n], curr = base[i], next = base[(i + 1) % n];
    const l1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const l2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (!l1 || !l2) { rounded.push(curr); continue; }
    const cut = 0.48 * Math.min(1, r * 1.35) * Math.min(l1, l2);
    const sx = curr.x + (prev.x - curr.x) / l1 * cut, sy = curr.y + (prev.y - curr.y) / l1 * cut;
    const ex = curr.x + (next.x - curr.x) / l2 * cut, ey = curr.y + (next.y - curr.y) / l2 * cut;
    for (let step = 0; step <= 6; step++) {
      const u = step / 6, inv = 1 - u;
      rounded.push({
        x: inv * inv * sx + 2 * inv * u * curr.x + u * u * ex,
        y: inv * inv * sy + 2 * inv * u * curr.y + u * u * ey,
      });
    }
  }
  const m = rounded.length;
  let best = 0, bestDist = Infinity;
  const anchor = circle[0];
  for (let i = 0; i < m; i++) {
    const d = (rounded[i].x - anchor.x) ** 2 + (rounded[i].y - anchor.y) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  const ordered = [];
  for (let i = 0; i < m; i++) ordered.push(rounded[(best + i) % m]);
  const total = perimeter(ordered);
  if (!Number.isFinite(total) || total <= 0) return circle;
  const count = circle.length, result = [];
  let edge = 0, acc = 0;
  let edgeLen = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
  for (let i = 0; i < count; i++) {
    const target = total * i / count;
    while (edge < m - 1 && target > acc + edgeLen) {
      acc += edgeLen; edge++;
      const a = ordered[edge], b = ordered[(edge + 1) % m];
      edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    }
    const a = ordered[edge], b = ordered[(edge + 1) % m];
    const t = edgeLen ? (target - acc) / edgeLen : 0;
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
    result.push({
      x: clamp((1 - r) * px + r * circle[i].x, 0, width),
      y: clamp((1 - r) * py + r * circle[i].y, 0, height),
    });
  }
  return result;
}

function wavyHull(group, width, height, settings) {
  const hull=roundedHull(group,width,height,settings.roundBoundary);
  if(!settings.waviness||hull.length<3)return hull;
  const length=perimeter(hull);
  if(!Number.isFinite(length)||length<=0)return hull;
  const count=Math.min(512,Math.max(16,Math.ceil(length/12)));
  const sampled=[];
  let edge=0,start=0,edgeLength=Math.hypot(hull[1].x-hull[0].x,hull[1].y-hull[0].y);
  for(let i=0;i<count;i++){
    const distance=length*i/count;
    while(edge<hull.length-1&&distance>start+edgeLength){start+=edgeLength;edge++;const a=hull[edge],b=hull[(edge+1)%hull.length];edgeLength=Math.hypot(b.x-a.x,b.y-a.y);}
    const a=hull[edge],b=hull[(edge+1)%hull.length],t=edgeLength?(distance-start)/edgeLength:0;
    sampled.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  const icons=group.icons||[];
  const padding=icons.length?Math.max(0,Math.min(
    Math.min(...icons.map(icon=>icon.x))-group.bounds.x,
    Math.min(...icons.map(icon=>icon.y))-group.bounds.y,
    group.bounds.x+group.bounds.w-Math.max(...icons.map(icon=>icon.x+icon.w)),
    group.bounds.y+group.bounds.h-Math.max(...icons.map(icon=>icon.y+icon.h))
  )):settings.padding;
  const amplitude=Math.min(18,padding*.75,group.bounds.w*.12,group.bounds.h*.12)*settings.waviness;
  const random=randomFor(group.id+':wave'),phase=random()*Math.PI*2,cycles=3+Math.floor(random()*3);
  return sampled.map((point,i)=>{
    const before=sampled[(i+count-1)%count],after=sampled[(i+1)%count];
    const dx=after.x-before.x,dy=after.y-before.y,normal=Math.hypot(dx,dy)||1;
    const offset=amplitude*(.78*Math.sin(i/count*Math.PI*2*cycles+phase)+.22*Math.sin(i/count*Math.PI*2*(cycles+2)+phase*.6));
    return {x:clamp(point.x-dy/normal*offset,0,width),y:clamp(point.y+dx/normal*offset,0,height)};
  });
}

function irregularHull(group, width, height, amount = 0.65, pass = 0) {
  const random = randomFor(`${group.id}:chalk:${pass}`);
  const points = [];
  group.hull.forEach((a, index) => {
    const b = group.hull[(index + 1) % group.hull.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 18));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      points.push({
        x: clamp(a.x + (b.x - a.x) * t + (random() - 0.5) * amount * 2, 0, width),
        y: clamp(a.y + (b.y - a.y) * t + (random() - 0.5) * amount * 2, 0, height),
      });
    }
  });
  return points;
}

function perimeter(points) {
  return points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
}

function revealedPoints(points, progress) {
  if (!points.length || progress <= 0) return [];
  let remaining = perimeter(points) * progress;
  const result = [points[0]];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining >= length) result.push(b);
    else if (length) {
      result.push({ x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length });
      break;
    }
    remaining -= length;
  }
  return result;
}

function traceHull(ctx, points, progress = 1) {
  if (!points.length) return;
  const visible = revealedPoints(points, progress);
  if (!visible.length) return;
  ctx.beginPath();
  ctx.moveTo(visible[0].x, visible[0].y);
  for (const point of visible.slice(1)) ctx.lineTo(point.x, point.y);
  if (progress >= 1) ctx.closePath();
}

function chalkBoundary(ctx, group, width, height, settings, color, progress) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = (pass ? 0.35 : 0.8) * opacityOf(group);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.lineWidth * (pass ? 0.48 : 1);
    traceHull(ctx, irregularHull(group, width, height, pass ? 1.35 : 0.6, pass), progress);
    ctx.stroke();
  }
  if (settings.texture) {
    const random = randomFor(`${group.id}:dust`);
    const points = revealedPoints(irregularHull(group, width, height, 2.3, 3), progress);
    ctx.globalAlpha = 0.22 * settings.texture * opacityOf(group);
    ctx.fillStyle = color;
    for (let i = 0; i < points.length; i += 3) {
      const point = points[i];
      ctx.fillRect(point.x + (random() - 0.5) * 5, point.y + (random() - 0.5) * 5,
        0.5 + random(), 0.5 + random());
    }
  }
  ctx.globalAlpha = 1;
}

function groupLabel(ctx, group, label, dark = false) {
  if (!label) return;
  ctx.font = label.font;
  ctx.textBaseline = label.textBaseline;
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#4b4e43' : '#dce5d0';
  ctx.globalAlpha = 0.88 * opacityOf(group);
  ctx.fillText(label.text, label.textX, label.textY, label.textMaxWidth);
  ctx.globalAlpha = 1;
}

function paintBackground(ctx, theme, width, height, texture) {
  ctx.save();
  try {
    ctx.scale(width / W, height / H);
    if (theme === 'playground') playgroundBackground(ctx, texture);
    else if (theme === 'gym') gymBackground(ctx, texture);
    else if (theme === 'classroom') classroomBackground(ctx, texture);
    else chalkboardBackground(ctx, texture);
  } finally { ctx.restore(); }
}

function createSurface(width, height) {
  // This is intentionally call-time discovery so Node imports need no DOM.
  if (typeof OffscreenCanvas === 'function') {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (context) return { canvas, context };
    } catch { /* Some embedded webviews expose a disabled OffscreenCanvas. */ }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) return { canvas, context };
    } catch { /* Headless callers may only provide the target drawing context. */ }
  }
  return null;
}

function createStudentSpriteSheet(rasterWidth, rasterHeight) {
  const unit = Math.max(1, PLAYGROUND_FIGURE_SCALE * PLAYGROUND_FIGURE_BOX.maxSize * Math.min(rasterWidth / W, rasterHeight / H));
  const cellW = Math.ceil(PLAYGROUND_FIGURE_BOX.width * unit) + 2;
  const cellH = Math.ceil(PLAYGROUND_FIGURE_BOX.height * unit) + 2;
  const surface = createSurface(cellW * PLAYGROUND_FRAMES, cellH * PLAYGROUND_LOOKS);
  if (!surface) return null;
  if ('imageSmoothingEnabled' in surface.context) surface.context.imageSmoothingEnabled = false;
  for (let look = 0; look < PLAYGROUND_LOOKS; look++) for (let frame = 0; frame < PLAYGROUND_FRAMES; frame++) {
    paintPlaygroundFigure(surface.context, frame * cellW + 1 + PLAYGROUND_FIGURE_BOX.left * unit,
      look * cellH + 1 + PLAYGROUND_FIGURE_BOX.top * unit, unit, look, frame);
  }
  return { canvas: surface.canvas, cellW, cellH };
}

function stampPlaygroundCrowd(ctx, crowd, sprites) {
  if (!crowd || !Array.isArray(crowd.students)) return;
  if (!sprites?.canvas) { paintPlaygroundCrowd(ctx, crowd); return; }
  const { canvas, cellW, cellH } = sprites, box = PLAYGROUND_FIGURE_BOX;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
  try {
    for (const s of playgroundPaintOrder(crowd)) {
      const u = crowd.unit * s.size;
      const sx = ((s.frame % PLAYGROUND_FRAMES) + PLAYGROUND_FRAMES) % PLAYGROUND_FRAMES * cellW + 1;
      const sy = ((s.look % PLAYGROUND_LOOKS) + PLAYGROUND_LOOKS) % PLAYGROUND_LOOKS * cellH + 1;
      ctx.drawImage(canvas, sx, sy, cellW - 2, cellH - 2,
        Math.round(s.x - box.left * u), Math.round(s.y - box.top * u), box.width * u, box.height * u);
    }
  } finally {
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = prevSmoothing;
  }
}

function background(ctx, theme, width, height, texture) {
  const matrix = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const ratioX = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
  const ratioY = matrix ? Math.hypot(matrix.c, matrix.d) : 1;
  const desiredWidth = Math.max(1, width * (Number.isFinite(ratioX) ? ratioX : 1));
  const desiredHeight = Math.max(1, height * (Number.isFinite(ratioY) ? ratioY : 1));
  const budget = 8388608;
  const reduction = Math.min(1, 4096 / desiredWidth, 4096 / desiredHeight,
    Math.sqrt(budget / (desiredWidth * desiredHeight)));
  const rasterWidth = Math.max(1, Math.floor(desiredWidth * reduction));
  const rasterHeight = Math.max(1, Math.floor(desiredHeight * reduction));
  const key = `${theme}:${width}:${height}:${rasterWidth}:${rasterHeight}:${texture}`;
  let cached = backgroundCache.get(ctx);
  if (cached?.key !== key) {
    const surface = createSurface(rasterWidth, rasterHeight);
    if (surface) paintBackground(surface.context, theme, rasterWidth, rasterHeight, texture);
    const sprites = theme === 'playground' && surface ? createStudentSpriteSheet(rasterWidth, rasterHeight) : null;
    cached = { key, canvas: surface?.canvas ?? null, sprites };
    backgroundCache.set(ctx, cached);
  }
  if (cached.canvas) ctx.drawImage(cached.canvas, 0, 0, width, height);
  else paintBackground(ctx, theme, width, height, texture);
  return cached;
}

/** Wallpaper only: never renders icon glyphs, filenames or sample fixtures.
 * The caller supplies logical coordinates and controls any reveal scheduling.
 */
export function renderSchoolScene(ctx, { theme = 'chalkboard', width, height, scene = {}, settings: input = {}, progress = 1, crowd = null } = {}) {
  if (!ctx || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const settings = sanitizeSettings(input);
  const reveal = settings.motion && Number.isFinite(progress) ? clamp(progress, 0, 1) : 1;
  const selected = SCHOOL_THEME_IDS.includes(theme) ? theme : 'chalkboard';
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.filter = 'none';
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const material = background(ctx, selected, width, height, settings.texture);
    if (selected === 'playground') {
      const activeCrowd = crowd && crowd.width === width && crowd.height === height
        ? crowd : staticPlaygroundCrowd(width, height, scene.icons ?? [], settings.padding);
      stampPlaygroundCrowd(ctx, activeCrowd, material.sprites);
    }
    const labels = new Map(layoutGroupLabels(ctx, { scene, width, height, settings }).map(label => [label.id, label]));
    const drawBoundary = selected !== 'playground' || settings.playgroundBoundary;
    for (const original of scene.groups ?? []) {
      const group = drawBoundary && original?.hull?.length && original.bounds
        ? { ...original, hull: wavyHull(original, width, height, settings) } : original;
      if (!reveal || !group?.hull?.length || !group.bounds || !opacityOf(group)) continue;
      if (drawBoundary) {
        if (settings.renderMode !== 'outline') {
          traceHull(ctx, group.hull, 1);
          ctx.fillStyle = TAPE_COLORS[(group.colorIndex ?? 0) % TAPE_COLORS.length];
          ctx.globalAlpha = .18 * reveal * opacityOf(group);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (selected === 'gym' && settings.renderMode !== 'fill') tapeBoundary(ctx, group, settings, reveal);
        else if (selected === 'classroom') classroomGroup(ctx, group, width, height, settings, reveal);
        else if (selected !== 'gym' && settings.renderMode !== 'fill')
          chalkBoundary(ctx, group, width, height, settings, selected === 'playground' ? '#faf4df' : '#e2e7cd', reveal);
        ctx.globalAlpha = 1;
      }
      if (settings.showLabels && reveal >= .8) {
        const label = labels.get(group.id);
        if (selected === 'playground' && label) {
          ctx.fillStyle = '#dfcca7'; ctx.globalAlpha = .96 * opacityOf(group);
          roundedRect(ctx, label.rect[0] - 5, label.rect[1] - 4, label.rect[2] + 10, label.rect[3] + 8, 8); ctx.fill(); ctx.globalAlpha = 1;
        }
        groupLabel(ctx, group, label, selected !== 'chalkboard');
      }
    }
  } finally { ctx.restore(); }
}
