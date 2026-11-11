import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreWorkspace } from '../prototype/school-state.mjs';
import * as layout from '../prototype/school-layout.mjs';

const defaults = { groupGap:56,padding:22,lineWidth:3,texture:.45,showLabels:true,motion:true };

test('restores all six themes and their independent saved group names without changing the school default', () => {
  assert.equal(restoreWorkspace('{broken', defaults).theme, 'chalkboard');
  assert.equal(restoreWorkspace({theme:'unavailable'}, defaults).theme, 'chalkboard');
  for (const theme of ['beach','meadow','chalkboard','playground','gym','classroom']) {
    const saved=JSON.stringify({theme,params:{[theme]:{groupNames:{'group-test':theme+' 수업 자료'},groupGap:80}}});
    const restored=restoreWorkspace(saved,defaults);
    assert.equal(restored.theme,theme);
    assert.equal(restored.params[theme].groupNames['group-test'],theme+' 수업 자료');
    assert.equal(restored.params[theme].groupGap,80);
    assert.equal(Object.keys(restored.params).length,6);
  }
  const state = restoreWorkspace({theme:'gym',params:{gym:{lineWidth:6}},icons:[{id:'a',name:'수업 자료',type:'folder',x:10,y:20,w:72,h:80}]}, defaults);
  assert.equal(state.theme, 'gym');
  assert.equal(state.params.gym.lineWidth, 6);
  assert.equal(state.params.gym.padding,22);
  assert.equal(state.icons[0].name, '수업 자료');
});

const stateModule = await import('../prototype/school-state.mjs');
test('101 and 500 named groups round-trip without dropping names when another group is edited',()=>{
  for(const count of [101,500]){
    const icons=Array.from({length:count},(_,i)=>({id:'native-'+i,x:(i%25)*150+30,y:Math.floor(i/25)*150+60,w:64,h:76}));
    const groups=layout.buildScene(icons,{width:4000,height:3200},{groupGap:0}).groups;
    const groupNames=Object.fromEntries(groups.map((group,i)=>[group.id,'수업 자료 '+i]));
    const workspace={theme:'beach',icons,params:{beach:{groupGap:0,groupNames}}};
    const restored=restoreWorkspace(JSON.stringify(workspace),defaults);
    assert.equal(Object.keys(restored.params.beach.groupNames).length,count);
    const edited=layout.sanitizeGroupNames({...restored.params.beach.groupNames,[groups[0].id]:'편집한 모둠'},groups.map(group=>group.id));
    assert.equal(edited[groups.at(-1).id],groupNames[groups.at(-1).id]);
    const again=restoreWorkspace(JSON.stringify({...restored,params:{beach:{groupGap:0,groupNames:edited}}}),defaults);
    assert.equal(Object.keys(again.params.beach.groupNames).length,count);
    assert.equal(again.params.beach.groupNames[groups[0].id],'편집한 모둠');
    assert.equal(again.params.beach.groupNames[groups.at(-1).id],groupNames[groups.at(-1).id]);
  }
});

test('active group names outrank stale history at the shared 512-entry cap, preserving safe text limits',()=>{
  const icons=Array.from({length:500},(_,i)=>({id:'native-'+i,x:(i%25)*150+30,y:Math.floor(i/25)*150+60,w:64,h:76}));
  const groups=layout.buildScene(icons,{width:4000,height:3200},{groupGap:0}).groups;
  const groupNames=Object.fromEntries([...Array.from({length:512},(_,i)=>['old-'+i,'이전 모둠']),...groups.map((group,i)=>[group.id,'현재 모둠 '+i])]);
  const restored=restoreWorkspace({theme:'meadow',icons,params:{meadow:{groupGap:0,groupNames}}},defaults);
  assert.equal(Object.keys(restored.params.meadow.groupNames).length,512);
  for(const [i,group] of groups.entries())assert.equal(restored.params.meadow.groupNames[group.id],'현재 모둠 '+i);
  const scene=layout.buildScene(icons,{width:4000,height:3200},{groupGap:0,groupNames});
  assert.equal(scene.groups.at(-1).label,'현재 모둠 499');
  const unsafe=JSON.parse('{"__proto__":"bad","constructor":"bad","prototype":"bad","safe":"  모둠\\u0000  ","long":"'+ '가'.repeat(41)+'"}');
  assert.deepEqual(layout.sanitizeGroupNames(unsafe),{safe:'모둠',long:'가'.repeat(40)});
});

test('group-name sanitization enumerates keys once instead of rescanning every insertion',()=>{
  const input=Object.fromEntries(Array.from({length:512},(_,i)=>['group-'+i,'이름 '+i]));
  const original=Object.keys;let enumerations=0,result;
  Object.keys=function(...args){enumerations++;return original.apply(this,args);};
  try{result=layout.sanitizeGroupNames(input);}finally{Object.keys=original;}
  assert.equal(original(result).length,512);
  assert.ok(enumerations<=2,'sanitization must be linear, not enumerate the growing output 512 times');
});

test('scales native icon rectangles without exposing real filenames and honors icon visibility', () => {
  const {iconsFromHost} = stateModule;
  assert.equal(typeof iconsFromHost,'function');
  const icons = iconsFromHost({t:'icons',vis:true,r:[[200,100,360,300],[-20,0,0,10],['bad',0,20,30],[50,50,30,30]]},{w:2880,h:1800},{width:1440,height:900});
  assert.equal(icons.length,1);
  assert.deepEqual([icons[0].x,icons[0].y,icons[0].w,icons[0].h],[100,50,80,100]);
  assert.equal(icons[0].name,'자료 01');
  assert.deepEqual(iconsFromHost({vis:false,r:[[0,0,100,100]]},{w:1440,h:900},{width:1440,height:900}),[]);
});

test('malformed saved legacy identifiers are ignored rather than coerced',()=>{
  const icons=[{id:'safe',legacyId:{toString:1,valueOf:1},x:10,y:10,w:48,h:48}];
  let restored;
  assert.doesNotThrow(()=>{restored=restoreWorkspace(JSON.stringify({icons}));});
  assert.equal(restored.icons.length,1);
  assert.equal('legacyId' in restored.icons[0],false);
});

test('malformed native messages are ignored and local-storage failures return false instead of crashing', () => {
  assert.equal(typeof stateModule.decodeHostMessage,'function');
  assert.equal(stateModule.decodeHostMessage('{bad'),null);
  assert.equal(stateModule.decodeHostMessage('[1,2]'),null);
  assert.deepEqual(stateModule.decodeHostMessage('{"t":"pause","v":true}'),{t:'pause',v:true});
  const values = new Map();
  const storage = {setItem:(key,value)=>values.set(key,value)};
  assert.equal(stateModule.saveWorkspace(storage,{theme:'gym'}),true);
  assert.equal(JSON.parse(values.get(stateModule.STORAGE_KEY)).theme,'gym');
  assert.equal(stateModule.saveWorkspace({setItem(){throw Error('full');}},{theme:'gym'}),false);
});
