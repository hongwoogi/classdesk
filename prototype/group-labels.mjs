// SPDX-License-Identifier: GPL-3.0-or-later
// All rectangles use the scene's physical pixels, never CSS or preview pixels.
export const LABEL_FONT_FAMILY = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const LEGACY_LABEL_FONT_FAMILY = 'Pretendard, "Malgun Gothic", system-ui, sans-serif';
export const LABEL_FONT = `500 16px ${LABEL_FONT_FAMILY}`;
export const LEGACY_LABEL_FONT = `600 22px ${LEGACY_LABEL_FONT_FAMILY}`;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export function labelFontSize(settings = {}, legacy = false) {
  const base = typeof settings?.labelSize === 'number' && Number.isFinite(settings.labelSize)
    ? clamp(Math.round(settings.labelSize),11,28) : 16;
  return legacy ? Math.round(base * 22 / 16) : base;
}
const intersects = (a,b) => a[2] > 0 && a[3] > 0 && b[2] > 0 && b[3] > 0
  && a[0] < b[0]+b[2] && a[0]+a[2] > b[0] && a[1] < b[1]+b[3] && a[1]+a[3] > b[1];

function placePencils(labels,icons,width,height) {
  // Match GroupStateRules.OverlapsIcon, including Explorer's filename cell.
  // Glyph-only grouping must not imply glyph-only input exclusion.
  const cells=icons.filter(icon=>icon&&[icon.x,icon.y,icon.w,icon.h].every(Number.isFinite)&&icon.w>0&&icon.h>0)
    .map(icon=>[icon.x-48,icon.y-4,icon.w+96,icon.h+84]);
  const placed=[];
  const inside=rect=>rect[0]>=0&&rect[1]>=0&&rect[0]+rect[2]<=width&&rect[1]+rect[3]<=height;
  for(const label of labels){
    const original=label.rect,[x,y,w,h]=original;
    const blocked=rect=>cells.find(other=>intersects(rect,other))
      ||labels.find(other=>other!==label&&intersects(rect,other.rect))?.rect
      ||placed.find(other=>intersects(rect,other));
    const middle=y+(h-24)/2,center=x+(w-24)/2;
    const candidates=[[x+w+4,middle],[x-28,middle],[x,y-28],[x,y+h+4],
      [x+w-24,y-28],[x+w-24,y+h+4],[center,y-28],[center,y+h+4]];
    if(!blocked(original))for(const [left,top] of candidates){
      const rect=[left,top,24,24];
      if(inside(rect)&&!blocked(rect)&&!intersects(rect,original)){label.editRect=rect;placed.push(rect);break;}
    }
    if(label.editRect[2])continue;
    // At the desktop's top edge there may be no header room above the first
    // glyph. Move the whole name-and-pencil pair to the nearest free slot,
    // rather than silently removing editing from an ordinary icon column.
    const offset=Math.min(0,(h-24)/2),rowWidth=w+28,rowHeight=Math.max(h,24);
    if(rowWidth>width||rowHeight>height)continue;
    const queue=[],seen=new Set();
    const add=(left,top)=>{
      left=clamp(left,0,width-rowWidth);top=clamp(top,-offset,height-rowHeight-offset);
      const key=left.toFixed(6)+':'+top.toFixed(6);if(seen.has(key))return;
      seen.add(key);queue.push({left,top,distance:(left-x)**2+(top-y)**2});
    };
    add(x,y);
    for(let attempt=0;attempt<24&&queue.length;attempt++){
      queue.sort((a,b)=>a.distance-b.distance);
      const slot=queue.shift(),row=[slot.left,slot.top+offset,rowWidth,rowHeight],obstacle=blocked(row);
      if(!obstacle){
        const dx=slot.left-x,dy=slot.top-y;
        label.rect=[slot.left,slot.top,w,h];label.textX+=dx;label.textY+=dy;
        label.editRect=[slot.left+w+4,slot.top+(h-24)/2,24,24];placed.push(label.editRect);break;
      }
      add(obstacle[0]+obstacle[2]+4,slot.top);
      add(obstacle[0]-rowWidth-4,slot.top);
      add(slot.left,obstacle[1]-rowHeight-4-offset);
      add(slot.left,obstacle[1]+obstacle[3]+4-offset);
    }
  }
  return labels;
}

/** Measure only; native Windows owns drawing and hit-testing the edit buttons.
 * textMaxWidth is the same optional Canvas fillText limit used by the painter.
 * With no safe edit location, retain the label for the native tray fallback.
 */
export function layoutGroupLabels(ctx,{scene,width,height,settings={},legacy=false}={}) {
  if (!ctx || settings?.showLabels === false || scene?.visible === false
    || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  ctx.save();
  try {
    const fontSize = labelFontSize(settings,legacy);
    ctx.font = legacy ? `600 ${fontSize}px ${LEGACY_LABEL_FONT_FAMILY}` : `500 ${fontSize}px ${LABEL_FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = legacy ? 'middle' : 'alphabetic';
    const result = [];
    for (const group of Array.isArray(scene?.groups) ? scene.groups : []) {
      if (result.length >= 500) break;
      if (typeof group?.id !== 'string' || typeof group.label !== 'string'
        || !Number.isFinite(group.bounds?.x) || !Number.isFinite(group.bounds?.y)) continue;
      const text = Array.from(group.label.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,40).join('');
      if (!text) continue;
      const metrics = ctx.measureText(text);
      const textWidth = Number.isFinite(metrics.width) ? Math.max(0,metrics.width) : text.length*fontSize;
      let rect,textX,textY,textMaxWidth;
      if (legacy) {
        const marginX = width > 16 ? 8 : 0, marginY = height > 8 ? 4 : 0;
        const w = Math.min(width-marginX*2,Math.max(60,textWidth+26));
        const h = Math.min(Math.max(28,Math.round(fontSize*1.55)),height-marginY*2);
        const x = clamp(group.bounds.x,marginX,width-w-marginX);
        const y = clamp(group.bounds.y-h-7,marginY,height-h-marginY);
        const inset = Math.min(13,w/2);
        rect = [x,y,w,h]; textX = x+inset; textY = y+h/2;
        textMaxWidth = Math.max(Number.EPSILON,w-inset*2);
      } else {
        const marginX = width > 36 ? 18 : 0;
        textMaxWidth = Math.min(textWidth,width-marginX*2);
        const scale = textWidth ? textMaxWidth/textWidth : 1;
        textX = clamp(group.bounds.x+6,marginX,width-textMaxWidth-marginX);
        const lowY = Math.min(Math.max(32,fontSize+16),height);
        const roundness = typeof settings?.roundBoundary === 'number' && Number.isFinite(settings.roundBoundary)
          ? clamp(settings.roundBoundary,0,1) : settings?.roundBoundary ? 1 : 0;
        const topOffset = 12 + Math.round(roundness * (2 + Math.min(20,(group.bounds.h || 0) * 0.05)));
        textY = clamp(group.bounds.y-topOffset,lowY,Math.max(lowY,height-Math.max(34,fontSize+18)));
        const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? Math.max(0,metrics.actualBoundingBoxAscent) : Math.round(fontSize*.78);
        const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? Math.max(0,metrics.actualBoundingBoxDescent) : Math.round(fontSize*.22);
        const left = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0;
        const right = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : textWidth;
        const x = clamp(textX-left*scale,0,width), y = clamp(textY-ascent,0,height);
        rect = [x,y,Math.max(0,clamp(textX+right*scale,0,width)-x),Math.max(0,clamp(textY+descent,0,height)-y)];
      }
      result.push({id:group.id,text,rect,editRect:[0,0,0,0],textX,textY,textMaxWidth,font:ctx.font,textBaseline:ctx.textBaseline});
    }
    return placePencils(result,scene?.icons ?? [],width,height);
  } finally { ctx.restore(); }
}
