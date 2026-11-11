import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScene} from '../prototype/school-layout.mjs';
let legacy={};
try { legacy=await import('../prototype/legacy-groups.mjs'); } catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
const viewport={width:1920,height:1080};
const icons=[{id:'native-0',x:100,y:100,w:64,h:76,name:'비공개_학급명부.xlsx'},{id:'native-1',x:234,y:100,w:64,h:76}];

test('legacy projection preserves physical grouping while sending original shader rectangles in frame physical pixels',()=>{
  assert.equal(typeof legacy.projectLegacyIcons,'function');
  for(const dpi of [1,1.25,2]) {
    const message=legacy.projectLegacyIcons(icons,viewport,{width:1440,height:810},dpi);
    assert.deepEqual(message,{t:'icons',vis:true,r:[[75*dpi,75*dpi,123*dpi,132*dpi],[175.5*dpi,75*dpi,223.5*dpi,132*dpi]]});
    assert.equal(buildScene(icons,viewport).groups.length,2);
    assert.ok(!JSON.stringify(message).includes('명부'));
  }
});

test('legacy overlay draws only saved group labels, respects visibility and restores Canvas state',()=>{
  assert.equal(typeof legacy.renderLegacyLabels,'function');
  const base=buildScene(icons,viewport),settings={groupNames:{[base.groups[0].id]:'수업 자료'}};
  const scene=buildScene(icons,viewport,settings),calls=[],stack=[];
  const ctx={fillStyle:'red',font:'10px sans-serif',save(){stack.push({fillStyle:this.fillStyle,font:this.font});},restore(){Object.assign(this,stack.pop());},measureText:text=>({width:text.length*12}),beginPath(){},roundRect(){},fill(){},fillText(text,...args){calls.push([text,...args]);}};
  assert.deepEqual(legacy.renderLegacyLabels(ctx,{scene,...viewport,settings}),['수업 자료','2모둠']);
  assert.deepEqual(calls.map(call=>call[0]),['수업 자료','2모둠']);
  assert.ok(!JSON.stringify(calls).includes('명부'));
  assert.equal(ctx.fillStyle,'red');assert.equal(stack.length,0);
  calls.length=0;
  assert.deepEqual(legacy.renderLegacyLabels(ctx,{scene,...viewport,settings:{showLabels:false}}),[]);
  assert.equal(calls.length,0);
});
