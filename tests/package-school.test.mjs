import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);

test('the v0.3 playground release metadata agrees between native host, installer, npm and dependency lock',async()=>{
 const packageInfo=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 const installer=JSON.parse(await readFile(new URL('tools/version.json',root),'utf8'));
 const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
 assert.equal(packageInfo.version,'0.3.0');
 assert.equal(installer.version,packageInfo.version);
 assert.equal(lock.version,packageInfo.version);
 assert.equal(lock.packages[''].version,packageInfo.version);
 const native=await readFile(new URL('host/ClassDesk.csproj',root),'utf8');
 assert.ok(native.includes('<Version>'+packageInfo.version+'</Version>'),'native host version differs');
});

test('Windows installer common lists include the new shared modules and native editor sources',async()=>{
 const script=await readFile(new URL('tools/build-installer.ps1',root),'utf8');
 for(const module of ['school-scene-model.mjs','group-labels.mjs'])assert.ok(script.includes("'"+module+"'"),'installer omits '+module);
 for(const module of ['IconIdentityTracker.cs','GroupState.cs','DesktopGroupEditor.cs'])assert.ok(script.includes('host\\'+module),'source omits '+module);
});

test('dense playground student module ships in both runtime and corresponding source',async()=>{
 const result=spawnSync(process.env.PYTHON||'python3',['tools/package-portable.py','--manifest-only'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(result.stdout),file='prototype/playground-crowd.mjs';
 assert.ok(manifest.runtime.includes(file),'crowd runtime dependency omitted');
 assert.ok(manifest.source.includes(file),'crowd corresponding source omitted');
 const windows=await readFile(new URL('tools/build-installer.ps1',root),'utf8');
 assert.ok(windows.includes("'playground-crowd.mjs'"),'Windows installer omits crowd dependency');
});

test('portable release manifest includes all native and wallpaper dependencies but no upstream trademark icon or private files',async()=>{
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(python,['tools/package-portable.py','--manifest-only'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(result.stdout);
  for(const file of ['prototype/school-scene-model.mjs','prototype/group-labels.mjs']){
    assert.ok(manifest.runtime.includes(file),'runtime omits 0.2 shared module '+file);
    assert.ok(manifest.source.includes(file),'source omits 0.2 shared module '+file);
  }
  for(const file of ['host/IconIdentityTracker.cs','host/GroupState.cs','host/DesktopGroupEditor.cs'])assert.ok(manifest.source.includes(file),'source omits 0.2 native source '+file);
  for(const file of ['prototype/legacy-labels.mjs','prototype/legacy-groups.mjs','prototype/flat.html','prototype/meadow.html','prototype/beach-palms.js','prototype/meadow-boy.js','prototype/meadow-cat.js','prototype/share.js','host/bin/ClassDesk.exe','host/bin/WebView2Loader.dll','prototype/school-wallpaper.mjs','prototype/school-layout.mjs','prototype/school-renderer.mjs','prototype/school-state.mjs','prototype/school-app.mjs','prototype/assets/fonts/Pretendard-LICENSE.txt','prototype/assets/fonts/MaterialSymbols-LICENSE.txt','LICENSE','NOTICE','docs/QA.md'])assert.ok(manifest.runtime.includes(file),'runtime omits '+file);
  for(const file of ['tools/build-installer-linux.py','host/DesktopHost.cs','host/Themes.cs','host/ClassDesk.csproj','host/build.ps1','tools/package-portable.py','tests/browser-qa.mjs','prototype/school-wallpaper.mjs','package-lock.json','LICENSE'])assert.ok(manifest.source.includes(file),'source omits '+file);
  for(const name of [...manifest.runtime,...manifest.source]){
    assert.ok(!name.includes('..')&&!name.startsWith('/'));
    assert.ok(!/DesklandPreview\.ico|\.env|\.git\/|node_modules\//.test(name));
    if(name.startsWith('host/bin/')&&!existsSync(new URL(name,root))&&process.env.CLASSDESK_REQUIRE_BUILD!=='1')continue;
    await access(new URL(name,root));
  }
  const html=await readFile(new URL('prototype/settings.html',root),'utf8');
  for(const match of html.matchAll(/(?:href|src)="((?:school-|assets\/)[^"?#]+)/g))assert.ok(manifest.runtime.includes('prototype/'+match[1]),'runtime omits UI asset '+match[1]);
});
