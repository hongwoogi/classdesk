import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {sanitizeSettings} from '../prototype/school-layout.mjs';
import {restoreWorkspace} from '../prototype/school-state.mjs';
const root=new URL('../',import.meta.url);

test('every slider endpoint agrees with live renderer validation and stored preferences',async()=>{
  const registry=JSON.parse(await readFile(new URL('prototype/themes.json',root),'utf8'));
  for(const theme of registry.themes)for(const group of theme.groups)for(const param of group.params){
    for(const value of [param.min,param.max]){
      assert.equal(sanitizeSettings({[param.key]:value})[param.key],value,`${theme.id} ${param.key} ${value}`);
      assert.equal(restoreWorkspace({params:{[theme.id]:{[param.key]:value}}}).params[theme.id][param.key],value);
    }
    assert.equal(sanitizeSettings({[param.key]:param.max+1000})[param.key],param.max);
    assert.equal(sanitizeSettings({[param.key]:param.min-1000})[param.key],param.min);
  }
});

test('retains exactly two original WebGL themes alongside four free school wallpaper pages',async()=>{
  const registry=JSON.parse(await readFile(new URL('prototype/themes.json',root),'utf8'));
  assert.deepEqual(registry.themes.map(t=>t.id),['beach','meadow','chalkboard','playground','gym','classroom']);
  for(const theme of registry.themes){
    assert.equal(theme.status,'ready');assert.equal(theme.product,'free');
    await access(new URL('prototype/'+theme.page,root));
    const page=await readFile(new URL('prototype/'+theme.page,root),'utf8');
    if(['beach','meadow'].includes(theme.id)) {
      assert.equal(theme.page,theme.id==='beach'?'flat.html':'meadow.html');
      assert.ok(page.includes("getContext('webgl2'"),'must retain the actual original shader renderer');
    } else assert.ok(page.includes('school-wallpaper.mjs'));
    assert.ok(page.includes('lang="ko"'));
  }
});

test('the Korean settings UI contains a real canvas, theme selectors, visible preview disclaimer and accessible controls',async()=>{
  const html=await readFile(new URL('prototype/settings.html',root),'utf8');
  assert.ok(html.includes('교실데스크'));assert.ok(html.includes('lang="ko"'));
  assert.ok(html.includes('id="scene-canvas"'));assert.ok(html.includes('id="theme-list"'));
  assert.ok(html.includes('브라우저 미리보기'));assert.ok(html.includes('실제 바탕화면'));
  assert.ok(html.includes('id="settings-form"'));assert.ok(html.includes('id="help-dialog"'));
  assert.ok(html.includes('school-app.mjs'));
});

test('in-app help lists six themes and prefers the real Windows installer with portable as an alternative',async()=>{
  const html=await readFile(new URL('prototype/settings.html',root),'utf8');
  assert.ok(html.includes('해변, 초원, 칠판, 운동장, 체육관, 교실'));
  assert.ok(html.includes('ClassDesk-0.1.0-win-x64-Setup.exe'));
  assert.ok(html.includes('설치 없이')&&html.includes('포터블'));
});
