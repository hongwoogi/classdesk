import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,THEME_IDS,sanitizeSettings} from '../prototype/school-layout.mjs';
import {restoreWorkspace} from '../prototype/school-state.mjs';

test('waviness is a bounded saved visual setting with an explicit old-version default',()=>{
 assert.equal(DEFAULT_SETTINGS.waviness,.25);
 assert.equal(sanitizeSettings({waviness:.77}).waviness,.77);
 assert.equal(sanitizeSettings({waviness:-1}).waviness,0);
 assert.equal(sanitizeSettings({waviness:10}).waviness,1);
 assert.equal(sanitizeSettings({waviness:NaN}).waviness,.25);
 for(const theme of THEME_IDS){
  const state=restoreWorkspace({theme,params:{[theme]:{waviness:.77}}});
  assert.equal(state.params[theme].waviness,.77);
  assert.equal(restoreWorkspace(JSON.stringify(state)).params[theme].waviness,.77);
 }
});

test('outline, fill and both styles are validated and survive independent theme storage',()=>{
 assert.equal(DEFAULT_SETTINGS.renderMode,'outline');
 for(const mode of ['outline','fill','both']){
  assert.equal(sanitizeSettings({renderMode:mode}).renderMode,mode);
  const state=restoreWorkspace({theme:'gym',params:{gym:{renderMode:mode}}});
  assert.equal(restoreWorkspace(JSON.stringify(state)).params.gym.renderMode,mode);
 }
 for(const mode of ['invalid',null,{},'FILL'])assert.equal(sanitizeSettings({renderMode:mode}).renderMode,'outline');
});

test('labelSize and roundBoundary slider are validated and survive independent theme storage',()=>{
 assert.equal(DEFAULT_SETTINGS.labelSize,16);
 assert.equal(DEFAULT_SETTINGS.roundBoundary,0);
 assert.equal(sanitizeSettings({labelSize:24}).labelSize,24);
 assert.equal(sanitizeSettings({labelSize:4}).labelSize,11);
 assert.equal(sanitizeSettings({labelSize:99}).labelSize,28);
 assert.equal(sanitizeSettings({labelSize:NaN}).labelSize,16);
 assert.equal(sanitizeSettings({roundBoundary:.65}).roundBoundary,.65);
 assert.equal(sanitizeSettings({roundBoundary:-1}).roundBoundary,0);
 assert.equal(sanitizeSettings({roundBoundary:5}).roundBoundary,1);
 assert.equal(sanitizeSettings({roundBoundary:true}).roundBoundary,1);
 assert.equal(sanitizeSettings({roundBoundary:false}).roundBoundary,0);
 assert.equal(sanitizeSettings({roundBoundary:'yes'}).roundBoundary,0);
 for(const theme of THEME_IDS){
  const state=restoreWorkspace({theme,params:{[theme]:{labelSize:22,roundBoundary:.65}}});
  assert.equal(state.params[theme].labelSize,22);
  assert.equal(state.params[theme].roundBoundary,.65);
  const roundTripped=restoreWorkspace(JSON.stringify(state));
  assert.equal(roundTripped.params[theme].labelSize,22);
  assert.equal(roundTripped.params[theme].roundBoundary,.65);
 }
});

test('playgroundBoundary option is off by default, validated as a boolean, and survives workspace storage',()=>{
 assert.equal(DEFAULT_SETTINGS.playgroundBoundary,false);
 assert.equal(sanitizeSettings({playgroundBoundary:true}).playgroundBoundary,true);
 assert.equal(sanitizeSettings({playgroundBoundary:false}).playgroundBoundary,false);
 assert.equal(sanitizeSettings({playgroundBoundary:'yes'}).playgroundBoundary,false);
 const state=restoreWorkspace({theme:'playground',params:{playground:{playgroundBoundary:true}}});
 assert.equal(state.params.playground.playgroundBoundary,true);
 assert.equal(restoreWorkspace(JSON.stringify(state)).params.playground.playgroundBoundary,true);
});
