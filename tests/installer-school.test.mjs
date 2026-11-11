import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');

test('Linux installer plan ships the real host, six backgrounds and the paired GPL source',()=>{
 const run=spawnSync(python,['tools/build-installer-linux.py','--plan-only'],{cwd:root,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const plan=JSON.parse(run.stdout);
 assert.match(plan.output,/ClassDesk-\d+\.\d+\.\d+-win-x64-Setup\.exe$/);
 for(const file of ['host/bin/ClassDesk.exe','ClassDesk-source.zip','prototype/flat.html','prototype/meadow.html','prototype/chalkboard.html','prototype/playground.html','prototype/gym.html','prototype/classroom.html'])assert.ok(plan.files.includes(file),'installer omits '+file);
 assert.equal(plan.files.length,new Set(plan.files).size);
 assert.ok(plan.file_lines.some(line=>line.includes('SetOutPath "$INSTDIR\\host\\bin"')));
 assert.ok(plan.delete_lines.includes('Delete "$INSTDIR\\ClassDesk-source.zip"'));
});

test('release includes a compiled Windows GUI NSIS installer with embedded real host and GPL source',context=>{
 const version=JSON.parse(readFileSync(new URL('tools/version.json',root),'utf8')).version;
 const file=new URL(`dist/ClassDesk-${version}-win-x64-Setup.exe`,root);
 if(!existsSync(file)){
  assert.notEqual(process.env.CLASSDESK_REQUIRE_INSTALLER,'1','compile the real Setup.exe before release');
  context.skip('compile installer to enable PE/embedded-payload verification');return;
 }
 const exe=readFileSync(file);assert.equal(exe.toString('ascii',0,2),'MZ');
 const pe=exe.readUInt32LE(0x3c);assert.equal(exe.toString('ascii',pe,pe+4),'PE\0\0');
 assert.equal(exe.readUInt16LE(pe+24+68),2,'installer must be Windows GUI');
 const manifest=JSON.parse(readFileSync(new URL(file.href+'.manifest.json'),'utf8'));
 assert.equal(manifest.signature.publisher,'Microsoft Corporation');
 assert.equal(manifest.signature.status,'verified');
 for(const name of ['host/bin/ClassDesk.exe','ClassDesk-source.zip'])assert.ok(manifest.files.some(item=>item.path===name),'embedded manifest omits '+name);
 assert.ok(exe.byteLength>1000000,'must include real application payload');
 if(process.env.CLASSDESK_REQUIRE_INSTALLER==='1'){
  const hash=data=>createHash('sha256').update(data).digest('hex');
  assert.equal(hash(exe),manifest.sha256,'installer digest must match');
  const temporary=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'classdesk-nsis-test-'));
  try{
   const extract=spawnSync(process.env.CLASSDESK_7ZIP||'7z',['x','-y','-o'+temporary,fileURLToPath(file)],{encoding:'utf8'});
   assert.equal(extract.status,0,extract.stdout+extract.stderr);
   for(const entry of manifest.files){
    const current=entry.path==='ClassDesk-source.zip'?new URL(`dist/ClassDesk-${version}-source.zip`,root):new URL(entry.path,root);
    assert.equal(hash(readFileSync(current)),entry.sha256,'rebuild installer after changing '+entry.path);
    assert.equal(hash(readFileSync(join(temporary,entry.path))),entry.sha256,'compiled NSIS payload differs for '+entry.path);
   }
  }finally{rmSync(temporary,{recursive:true,force:true});}
 }
});

test('uninstall removes only this installation’s startup entries and checks the required Framework',()=>{
 const host=readFileSync(new URL('host/DesktopHost.cs',root),'utf8');
 const nsi=readFileSync(new URL('tools/installer.nsi',root),'utf8');
 assert.ok(host.includes('args[0] == "--uninstall-cleanup"'),'native cleanup command is required');
 assert.ok(host.includes('public static int RemoveInstalledAutoStart()'));
 const cleanup=host.slice(host.indexOf('public static int RemoveInstalledAutoStart()'),host.indexOf('    static bool CreateAutoStartShortcut()'));
 assert.ok(cleanup.includes('if (InstallProfile.Isolated) return 0;'));
 assert.ok(cleanup.includes('if (AutoStartShortcutEnabled()) File.Delete(AutoStartShortcutPath);'),'do not delete a portable/other installation’s startup link');
 assert.ok(nsi.includes('--uninstall-cleanup'));
 assert.ok(nsi.includes('528040')&&nsi.includes('NDP\\v4\\Full'),'installer must detect .NET Framework 4.8');
 const runtime=nsi.slice(nsi.indexOf('Function CheckRuntime'),nsi.indexOf('FunctionEnd',nsi.indexOf('Function CheckRuntime')));
 const fallbacks=[...runtime.matchAll(/\$\{If\} \$0 == ""([\s\S]*?)\$\{EndIf\}/g)];
 assert.equal(fallbacks.length,2);
 for(const branch of fallbacks)assert.match(branch[1],/\$\{OrIf\} \$0 == "0\.0\.0\.0"/,'an empty machine Runtime placeholder must not hide a valid user Runtime');
});
