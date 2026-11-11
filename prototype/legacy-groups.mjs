// SPDX-License-Identifier: GPL-3.0-or-later
// ClassDesk labels are independent of the original Beach/Meadow WebGL shaders.
import {sanitizeSettings} from './school-layout.mjs';
import {layoutGroupLabels} from './group-labels.mjs';
export function measureLegacyLabels(ctx,options={}) {
  return layoutGroupLabels(ctx,{...options,legacy:true});
}

/** Originals divide icon rectangles by frame DPR. Project only for presentation. */
export function projectLegacyIcons(icons, physical, frame, dpr = 1) {
  const sx=frame.width/physical.width*dpr,sy=frame.height/physical.height*dpr;
  return {t:'icons',vis:true,r:icons.map(icon=>[icon.x*sx,icon.y*sy,(icon.x+icon.w)*sx,(icon.y+icon.h)*sy])};
}

/** Transparent label layer only: never redraw OS icons or inspect their names. */
export function renderLegacyLabels(ctx,{scene,width,height,settings:input={}}) {
  const settings=sanitizeSettings(input),drawn=[];
  if(!settings.showLabels)return drawn;
  ctx.save();
  try {
    ctx.font='600 22px Pretendard, "Malgun Gothic", system-ui, sans-serif';
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.globalAlpha=1;
    ctx.shadowBlur=0;ctx.shadowColor='transparent';
    const opacity=new Map((scene?.groups??[]).map(group=>[group.id,Number.isFinite(group.opacity)?Math.max(0,Math.min(1,group.opacity)):1]));
    for(const label of layoutGroupLabels(ctx,{scene,width,height,settings,legacy:true})) {
      ctx.globalAlpha=opacity.get(label.id)??1;
      if(ctx.globalAlpha<=0)continue;
      const [x,y,w,h]=label.rect;
      ctx.font=label.font;ctx.textBaseline=label.textBaseline;
      ctx.fillStyle='rgba(247,250,239,.93)';ctx.beginPath();ctx.roundRect(x,y,w,h,9);ctx.fill();
      ctx.fillStyle='#294b3c';ctx.fillText(label.text,label.textX,label.textY,label.textMaxWidth);drawn.push(label.text);
    }
  } finally {ctx.restore();}
  return drawn;
}
