#!/usr/bin/env python3
"""Build a portable ClassDesk ZIP and the exact corresponding GPL source ZIP.

Uses explicit allowlists: no credentials, upstream trademark icon, package caches,
node_modules, or unrelated original-theme assets can enter a release.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOCS = ['LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md', 'docs/QA.md']
PROTOTYPE = ['playground-crowd.mjs', 'school-scene-model.mjs', 'group-labels.mjs', 'legacy-labels.mjs', 'legacy-groups.mjs', 'flat.html', 'meadow.html', 'beach-palms.js', 'meadow-boy.js', 'meadow-cat.js', 'share.js', 'settings.html', 'themes.json', 'chalkboard.html', 'playground.html', 'gym.html', 'classroom.html', 'school-app.mjs', 'school-layout.mjs', 'school-renderer.mjs', 'school-state.mjs', 'school-wallpaper.mjs', 'school-ui.css', 'assets/classdesk.svg', 'i18n/ko.json', 'i18n/en.json', 'i18n/zh-CN.json']
RUNTIME_BIN = ['ClassDesk.exe', 'ClassDesk.ico', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'WebView2-LICENSE.txt']
SOURCE_HOST = ['DesktopGroupEditor.cs', 'GroupState.cs', 'IconIdentityTracker.cs', 'DesktopHost.cs', 'Themes.cs', 'ClassDesk.csproj', 'ClassDesk.ico', 'app.manifest', 'build.ps1', 'README.md', 'inspect.ps1']
SOURCE_TOOLS = ['build-installer-linux.py', 'version.json', 'build-installer.ps1', 'installer.nsi', 'generate-icon.py', 'package-portable.py']


def manifests():
    fonts = [p.relative_to(ROOT).as_posix() for p in sorted((ROOT/'prototype/assets/fonts').glob('*')) if p.is_file()]
    runtime = DOCS + ['prototype/'+name for name in PROTOTYPE] + fonts + ['host/bin/'+name for name in RUNTIME_BIN]
    config = 'host/bin/ClassDesk.exe.config'
    if (ROOT/config).is_file():
        runtime.append(config)
    source = DOCS + ['.gitattributes', '.gitignore', 'AGENTS.md', '.interface-design/system.md', 'package.json', 'package-lock.json', 'prototype/serve.mjs']
    source += ['prototype/'+name for name in PROTOTYPE] + fonts
    source += ['host/'+name for name in SOURCE_HOST] + ['tools/'+name for name in SOURCE_TOOLS]
    source += [p.relative_to(ROOT).as_posix() for p in sorted((ROOT/'tests').glob('*.mjs'))]
    return {'runtime': sorted(set(runtime)), 'source': sorted(set(source))}


def add_bytes(archive, name, data):
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-only', action='store_true')
    args = parser.parse_args()
    manifest = manifests()
    if args.manifest_only:
        print(json.dumps(manifest, ensure_ascii=False))
        return
    version = json.loads((ROOT/'package.json').read_text())['version']
    prefix = 'ClassDesk-'+version
    for name in set(manifest['runtime'] + manifest['source']):
        if not (ROOT/name).is_file():
            raise SystemExit('Missing release dependency: '+name)
    exe = (ROOT/'host/bin/ClassDesk.exe').read_bytes()
    if not exe.startswith(b'MZ') or len(exe) < 10000:
        raise SystemExit('Build the real Windows host before packaging.')
    out = ROOT/'dist'
    out.mkdir(exist_ok=True)
    source_zip = out/(prefix+'-source.zip')
    with zipfile.ZipFile(source_zip, 'w') as archive:
        for name in manifest['source']:
            add_bytes(archive,prefix+'/'+name,(ROOT/name).read_bytes())
    windows_zip = out/(prefix+'-windows-x64.zip')
    with zipfile.ZipFile(windows_zip,'w') as archive:
        for name in manifest['runtime']:
            add_bytes(archive,prefix+'/'+name,(ROOT/name).read_bytes())
        add_bytes(archive,prefix+'/ClassDesk-source.zip',source_zip.read_bytes())
        add_bytes(archive,prefix+'/Start ClassDesk.cmd',b'@echo off\r\nstart "" "%~dp0host\\bin\\ClassDesk.exe"\r\n')
        qa = ROOT/'artifacts/qa/summary.json'
        if qa.is_file():
            result = json.loads(qa.read_text())
            if result.get('failed'):
                raise SystemExit('Browser QA has failures; refuse to ship.')
            add_bytes(archive,prefix+'/docs/browser-qa-summary.json',json.dumps({'passed':result['passed'],'failed':result['failed'],'pageErrors':result['pageErrors'],'networkFailures':result['networkFailures']},ensure_ascii=False,indent=2).encode())
    output=[]
    for path in [windows_zip,source_zip]:
        with zipfile.ZipFile(path) as archive:
            if archive.testzip() is not None:
                raise SystemExit('ZIP verification failed: '+str(path))
            count=len(archive.namelist())
        blob=path.read_bytes()
        output.append({'path':str(path),'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'entries':count})
    checksums=out/(prefix+'-SHA256SUMS.txt')
    checksums.write_text(''.join(item['sha256']+'  '+Path(item['path']).name+'\n' for item in output),encoding='utf-8')
    print(json.dumps({'artifacts':output,'checksums':str(checksums),'runtime_dependencies':len(manifest['runtime']),'source_files':len(manifest['source'])},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
