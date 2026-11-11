import test from 'node:test';
import assert from 'node:assert/strict';
import {iconsFromHost} from '../prototype/school-state.mjs';
const screen={width:1920,height:1080};
const r=[[100,100,148,148],[300,100,348,148]];

test('native opaque glyph identifiers survive host list insertion and reordering',()=>{
 const first=iconsFromHost({t:'icons',r,ids:['icon-7','icon-9']},screen,screen);
 assert.deepEqual(first.map(icon=>icon.id),['icon-7','icon-9']);
 const reordered=iconsFromHost({t:'icons',r:[r[1],r[0]],ids:['icon-9','icon-7']},screen,screen);
 assert.deepEqual(reordered.map(icon=>icon.id),['icon-9','icon-7']);
 assert.equal(first[0].x,reordered[1].x);
});

test('untrusted duplicate or malformed identifiers cannot collapse valid native icons',()=>{
 for(const ids of [['same','same'],['__proto__','constructor'],['a'.repeat(101),{}],['native-1','native-1']]){
  const icons=iconsFromHost({r,ids},screen,screen);
  assert.equal(icons.length,2);
  assert.equal(new Set(icons.map(icon=>icon.id)).size,2);
  assert.ok(icons.every(icon=>!['__proto__','constructor'].includes(icon.id)));
 }
 assert.deepEqual(iconsFromHost({r},screen,screen).map(icon=>icon.id),['native-0','native-1']);
});
