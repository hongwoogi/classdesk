#!/usr/bin/env python3
"""Cross-build the same per-user Windows NSIS installer on Linux.

Uses the portable release's explicit payload/source manifest. Never executes the
Windows bootstrapper or application on the build machine.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('classdesk_portable', ROOT/'tools/package-portable.py')
assert spec is not None and spec.loader is not None
portable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portable)


def plan():
    version = json.loads((ROOT/'tools/version.json').read_text(encoding='utf-8'))['version']
    files = sorted(set(portable.manifests()['runtime'] + ['ClassDesk-source.zip']))
    file_lines, delete_lines, directories = [], [], set()
    for name in files:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or any(c in name for c in '$"\r\n\\'):
            raise ValueError('Unsafe package path: '+name)
        parent = path.parent
        target = '$INSTDIR' + (('\\'+str(parent).replace('/', '\\')) if str(parent) != '.' else '')
        file_lines += ['SetOutPath "'+target+'"', 'File "${PAYLOAD}/'+name+'"']
        delete_lines.append('Delete "$INSTDIR\\'+name.replace('/', '\\')+'"')
        while str(parent) != '.':
            directories.add(str(parent))
            parent = parent.parent
    delete_lines += ['RMDir "$INSTDIR\\'+name.replace('/', '\\')+'"' for name in sorted(directories, key=lambda p:(-p.count('/'),p))]
    return {'version':version, 'output':str(ROOT/'dist'/('ClassDesk-'+version+'-win-x64-Setup.exe')),
            'files':files, 'file_lines':file_lines, 'delete_lines':delete_lines}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan-only', action='store_true')
    parser.add_argument('--makensis', default=shutil.which('makensis'))
    parser.add_argument('--osslsigncode', default=shutil.which('osslsigncode'))
    parser.add_argument('--bootstrapper', type=Path)
    parser.add_argument('--ca-file', type=Path, default=Path('/etc/ssl/certs/ca-certificates.crt'))
    args = parser.parse_args()
    release = plan()
    if args.plan_only:
        print(json.dumps(release, ensure_ascii=False, indent=2))
        return
    if not args.makensis or not args.osslsigncode or not args.bootstrapper:
        parser.error('building requires makensis, osslsigncode and --bootstrapper (the official Microsoft executable)')
    bootstrapper = args.bootstrapper.resolve()
    checked = subprocess.run([args.osslsigncode, 'verify', '-index', '0', '-CAfile', str(args.ca_file), '-in', str(bootstrapper)], text=True, capture_output=True, timeout=90)
    if checked.returncode or 'O=Microsoft Corporation/CN=Microsoft Corporation' not in checked.stdout or 'Signature verification: ok' not in checked.stdout:
        raise SystemExit('Microsoft bootstrapper signature verification failed:\n'+checked.stdout+checked.stderr)
    subprocess.run([sys.executable, str(ROOT/'tools/package-portable.py')], check=True)
    prefix = 'ClassDesk-'+release['version']
    source_zip = ROOT/'dist'/(prefix+'-source.zip')
    with tempfile.TemporaryDirectory(prefix='classdesk-nsis-', dir=os.environ.get('TMPDIR')) as directory:
        stage = Path(directory)
        payload = stage/'payload'
        for name in release['files']:
            target = payload/name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_zip if name == 'ClassDesk-source.zip' else ROOT/name, target)
        file_list, delete_list = stage/'files.nsh', stage/'delete.nsh'
        file_list.write_text('\n'.join(release['file_lines'])+'\n', encoding='utf-8-sig')
        delete_list.write_text('\n'.join(release['delete_lines'])+'\n', encoding='utf-8-sig')
        defines = {'VERSION':release['version'], 'PAYLOAD':str(payload), 'OUTPUT':release['output'],
                   'BOOTSTRAPPER':str(bootstrapper), 'FILE_LIST':str(file_list), 'DELETE_LIST':str(delete_list)}
        if any(any(c in value for c in '$"\r\n') for value in defines.values()):
            raise SystemExit('Unsupported NSIS macro path character')
        subprocess.run([args.makensis, '-V3'] + ['-D'+key+'='+value for key,value in defines.items()] + [str(ROOT/'tools/installer.nsi')], check=True)
        output = Path(release['output'])
        data = output.read_bytes()
        if data[:2] != b'MZ':
            raise SystemExit('Compiler did not produce a Windows executable')
        digest = hashlib.sha256(data).hexdigest()
        manifest = {'installer':output.name, 'sha256':digest, 'bytes':len(data), 'installer_signed':False,
                    'signature':{'publisher':'Microsoft Corporation', 'status':'verified',
                                 'scope':'embedded WebView2 bootstrapper, primary signature, current build time',
                                 'bootstrapper_sha256':hashlib.sha256(bootstrapper.read_bytes()).hexdigest()},
                    'files':[{'path':name, 'sha256':hashlib.sha256((payload/name).read_bytes()).hexdigest()} for name in release['files']]}
        Path(str(output)+'.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        Path(str(output)+'.sha256').write_text(digest+'  '+output.name+'\n', encoding='utf-8')
        Path(str(output)+'.bootstrapper-verification.txt').write_text(checked.stdout+checked.stderr, encoding='utf-8')
        print(json.dumps({'installer':str(output), 'bytes':len(data), 'sha256':digest, 'payload_files':len(release['files'])}, indent=2))


if __name__ == '__main__':
    main()
