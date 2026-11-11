import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const host = () => read('host/DesktopHost.cs');

test('ClassDesk has an independent profile, process, startup and window identity', () => {
  const source = host();
  for (const name of ['Exit', 'Menu', 'Settings', 'Singleton']) {
    assert.ok(source.includes(`"ClassDeskHost_${name}"`), `missing ClassDesk ${name} identity`);
  }
  assert.match(source, /RunName\s*=\s*"ClassDesk"/);
  assert.match(source, /GetEnvironmentVariable\("CLASSDESK_PROFILE_DIR"\)/);
  assert.match(source, /SpecialFolder\.LocalApplicationData\),\s*"ClassDesk"\)/);
  assert.match(source, /"ClassDesk\.lnk"/);
  assert.match(source, /GetProcessesByName\("ClassDesk"\)/);
  assert.match(source, /Text\s*=\s*"ClassDeskWindow"/);
  assert.match(source, /tray\.Text\s*=\s*"교실데스크/);
  assert.match(source, /AccessibleName\s*=\s*"교실데스크/);
  assert.doesNotMatch(source, /"[^"\r\n]*(?:Deskland|HabitatWallpaper)[^"\r\n]*"/);
  assert.doesNotMatch(source, /Rename\.Migrate\(/, 'never import another product’s profile');
});

test('the Korean teacher host starts and recovers with the chalkboard theme', () => {
  const source = host();
  assert.ok(/public static string Theme\s*=\s*"chalkboard"/.test(source), 'default theme must be chalkboard');
  assert.ok(/if \(!ThemeAllowed\(Settings\.Theme\)\) Settings\.Theme = "chalkboard";/.test(source), 'invalid theme must recover to chalkboard');
  assert.ok(!/ThemeAllowed\("(?:beach|meadow)"\)/.test(source), 'upstream themes cannot be fallbacks');
});

test('Korean is the native default and every host message has a Korean translation', () => {
  const source = host();
  assert.ok(/public static string Lang\s*=\s*"ko"/.test(source), 'native language must default to Korean');
  assert.ok(/Supported\s*=\s*\{[^}]*"ko"/.test(source), 'Korean must be supported');
  assert.ok(existsSync(new URL('prototype/i18n/ko.json', root)), 'missing Korean message catalog');
  const ko = JSON.parse(read('prototype/i18n/ko.json'));
  assert.equal(ko.name, '한국어');
  const keys = [...new Set([...source.matchAll(/I18n\.T\("([^"]+)"/g)].map(match => match[1]))];
  for (const key of keys) {
    assert.equal(typeof ko.host[key], 'string', `missing native translation ${key}`);
    assert.match(ko.host[key], /[가-힣]/, `not Korean: ${key}`);
    const upstream = JSON.parse(read('prototype/i18n/en.json')).host[key];
    assert.deepEqual([...ko.host[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(),
      [...upstream.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), `placeholder mismatch: ${key}`);
  }
  assert.doesNotMatch(JSON.stringify(ko), /Deskland|beach|沙滩/);
});

test('the executable build uses an original ClassDesk icon and ClassDesk product metadata', () => {
  const ownPath = new URL('host/ClassDesk.ico', root);
  assert.ok(existsSync(ownPath), 'missing original ClassDesk icon');
  const own = readFileSync(ownPath);
  assert.equal(own.readUInt32LE(0), 0x00010000, 'must be a real Windows icon');
  assert.ok(own.readUInt16LE(4) >= 4, 'ship multiple icon resolutions');
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  // Fingerprint of the upstream trademark icon; no copy is needed in source packages.
  assert.notEqual(hash(own), 'eaa4b308d2ac37d26edebfbce4e0664c9463084ec1911b5b953728622996ce1a',
    'upstream trademark icon must not be reused');
  const script = read('host/build.ps1');
  assert.ok(script.includes('ClassDesk.exe'), 'build output must be ClassDesk.exe');
  assert.ok(script.includes('ClassDesk.ico'), 'build must embed the original icon');
  assert.ok(script.includes('AssemblyTitle("교실데스크 · ClassDesk")'), 'native product title must be Korean');
  assert.ok(script.includes('AssemblyProduct("ClassDesk")'), 'product identity must be independent');
  assert.ok(!/DesklandPreview\.ico|Deskland\.exe|Assembly(?:Title|Product)\("Deskland/.test(script));
  assert.ok(read('host/app.manifest').includes('name="ClassDesk.app"'));
  assert.ok(host().includes('"ClassDesk.ico"'), 'tray icon must use the derivative icon');
  assert.ok(host().includes('Derived from Deskland'), 'source attribution must survive rebranding');
});

test('the cross-platform compiler targets a genuine x64 .NET Framework Windows host', () => {
  assert.ok(existsSync(new URL('host/ClassDesk.csproj', root)), 'missing reproducible compiler project');
  const project = read('host/ClassDesk.csproj');
  for (const item of ['<TargetFramework>net48</TargetFramework>', '<OutputType>WinExe</OutputType>',
    '<PlatformTarget>x64</PlatformTarget>', '<AssemblyName>ClassDesk</AssemblyName>',
    '<ApplicationIcon>ClassDesk.ico</ApplicationIcon>', '<ApplicationManifest>app.manifest</ApplicationManifest>',
    'Microsoft.NETFramework.ReferenceAssemblies.net48', 'Microsoft.Web.WebView2', '1.0.4191.47',
    'lib/net462/Microsoft.Web.WebView2.Core.dll', 'lib/net462/Microsoft.Web.WebView2.WinForms.dll',
    'runtimes/win-x64/native/WebView2Loader.dll']) {
    assert.ok(project.includes(item), `compiler contract missing ${item}`);
  }
  assert.ok(!/DesklandPreview|<AssemblyName>Deskland/.test(project));
  assert.ok(project.includes('<EnableDefaultItems>false</EnableDefaultItems>'),
    'cached WebView2 .winmd must not shadow the explicit net462 Core.dll reference');
});

test('the installer ships six usable themes under independent Korean install identity', () => {
  const nsi = read('tools/installer.nsi');
  assert.ok(nsi.includes('Name "교실데스크 · ClassDesk"'), 'installer must display the derivative name');
  for (const token of ['Programs\\ClassDesk', 'Software\\ClassDesk\\Installer',
    'Uninstall\\ClassDesk', 'ClassDesk.exe', 'ClassDesk.ico', 'MUI_LANGUAGE "Korean"']) {
    assert.ok(nsi.includes(token), `installer identity missing ${token}`);
  }
  assert.ok(!/DesklandPreview|Deskland Preview|Deskland\.exe|DesklandPreview\.ico/.test(nsi));
  const builder = read('tools/build-installer.ps1');
  for (const id of ['flat', 'meadow', 'chalkboard', 'playground', 'gym', 'classroom']) {
    assert.ok(builder.includes(`${id}.html`), `installer omits ${id}`);
  }
  for (const file of ['Themes.cs', 'ClassDesk.csproj', 'ClassDesk.ico', 'ko.json', 'ClassDesk-source.zip']) {
    assert.ok(builder.includes(file), `corresponding source or runtime missing ${file}`);
  }
  assert.ok(!/Deskland-Preview|beach,meadow|Deskland\.exe|DesklandPreview\.ico/.test(builder));
  assert.ok(builder.includes('school-renderer.mjs') && builder.includes('school-layout.mjs'));
  assert.ok(builder.includes('school-app.mjs'), 'installer must ship the settings controller');
  assert.ok(builder.includes('school-wallpaper.mjs'), 'installer must ship the controller imported by all four wallpaper pages');
});

test('host and installer versions agree with the ClassDesk app version', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.equal(JSON.parse(read('tools/version.json')).version, version);
  assert.equal(read('host/ClassDesk.csproj').match(/<Version>([^<]+)<\/Version>/)?.[1], version);
});

test('reviewed glyph polling changes preserve untouched native attachment, DPI, pause and restoration routines', () => {
  const source = host().replaceAll('\r\n', '\n');
  const reference = [
    // 0.2: LVIR_ICON, validated full snapshots and reusable desktop-parent lookup.
    // Actual identity/validation behavior is exercised in host-improvements.test.mjs.
    ['class IconReader : IDisposable', '\n}\n', 'd514ff3a34b9e3186ca54926958e0c7d132350a9e2fb3ce4688cffbd086a7038'],
    ['static class Native', '\n}\n', '71b7c64f80a239daffb14b77c70290622424c2d9d07f3aed53c80b936bb47727'],
    ['    bool AttachToDesktop()', '\n    }\n', '63ae58f17f8a337817ef2a4151188d8eddbe2eb6ff7ce16edaab7f3f866c2234'],
    ['    void EnsureZOrder()', '\n    }\n', '8072ebe465c78494a02a95b9522521d2fc8b29e2efdba8881e829d3e9ae9a49c'],
    ['    void PollIcons()', '\n    }\n', '3b3d2a48551fb4c164406e3901b99fdd0c4c44a4e60fb2cb4c2ac9de346b2d24'],
    ['    void PollForeground()', '\n    }\n', '2bc9e1ea09fb9fd5c2486868e1470ad32051c8a490f83fff161f299f49962a3e'],
    ['    public void Shutdown()', '\n    }\n', '34eec785e7ee541c16eb50a4d98c4a2fe538a36dc683676aa8e795337eed9420'],
  ];
  for (const [signature, ending, expected] of reference) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing ${signature.trim()}`);
    const end = source.indexOf(ending, start);
    const actual = createHash('sha256').update(source.slice(start, end + ending.length)).digest('hex');
    assert.equal(actual, expected, `unreviewed Win32 behavior change: ${signature.trim()}`);
  }
  assert.ok(source.includes('iconTimer.Interval = 400;'));
  assert.ok(source.includes('SetProcessDpiAwarenessContext(new IntPtr(-4))'));
  assert.ok(source.includes('@"..\\..\\prototype"'), 'portable ZIP must retain the host/bin to prototype relationship');
  assert.ok(source.includes('"?wallpaper=1"'));
});

test('the derivative uses and documents its own Ctrl+Alt+K tray shortcut', () => {
  assert.ok(host().includes('Native.MOD_NOREPEAT, Keys.K)'), 'register independent Ctrl+Alt+K shortcut');
  assert.ok(!host().includes('Ctrl+Alt+H'), 'no upstream shortcut advertised');
  assert.ok(JSON.parse(read('prototype/i18n/ko.json')).host.welcomeHotkey.includes('Ctrl+Alt+K'));
  const docs = read('host/README.md');
  for (const token of ['Ctrl+Alt+K', 'ClassDesk.exe', 'CLASSDESK_PROFILE_DIR', 'GPL-3.0', 'Deskland', '교실데스크']) {
    assert.ok(docs.includes(token), `host guide missing ${token}`);
  }
});

test('Windows PowerShell reads Korean build metadata without ANSI corruption', () => {
  for (const path of ['host/build.ps1', 'tools/build-installer.ps1']) {
    assert.deepEqual([...readFileSync(new URL(path, root)).subarray(0, 3)], [0xef, 0xbb, 0xbf],
      `${path} must have a UTF-8 BOM for Windows PowerShell 5.1`);
  }
});

test('both build paths redistribute the WebView2 dependency license', () => {
  assert.ok(read('host/build.ps1').includes("Entry = 'LICENSE.txt'; Name = 'WebView2-LICENSE.txt'"));
  assert.ok(read('host/ClassDesk.csproj').includes('Link="WebView2-LICENSE.txt"'));
});

test('native settings relay preserves value types with a separate safe group-name boundary', () => {
  const source = host();
  assert.ok(source.includes('Settings.For(theme)[key] = m["value"];'));
  assert.ok(source.includes('"v", Json.Obj(key, m["value"])'));
  assert.ok(source.includes('"params", Params'));
  assert.ok(source.includes('"v", Settings.For(Settings.Theme)'));
  assert.ok(source.includes('GroupStateRules.SanitizeNames'), 'group names remain objects with safe Unicode values');
  assert.ok(source.includes('settings["groupNames"] = names;'), 'desktop edits merge a single name without clearing identity');
});

test('compiled artifacts are real x64 Windows GUI PE/CLR output with derivative branding', context => {
  const path = new URL('host/bin/ClassDesk.exe', root);
  if (!existsSync(path)) {
    assert.notEqual(process.env.CLASSDESK_REQUIRE_BUILD, '1', 'native compilation must run before artifact verification');
    context.skip('compile the Windows host to enable PE/CLR artifact checks');
    return;
  }
  const exe = readFileSync(path);
  assert.equal(exe.toString('ascii', 0, 2), 'MZ');
  const pe = exe.readUInt32LE(0x3c);
  assert.equal(exe.toString('ascii', pe, pe + 4), 'PE\0\0');
  assert.equal(exe.readUInt16LE(pe + 4), 0x8664, 'must target x86-64 Windows');
  const optional = pe + 24;
  assert.equal(exe.readUInt16LE(optional), 0x20b, 'must be PE32+');
  assert.equal(exe.readUInt16LE(optional + 68), 2, 'must use the Windows GUI subsystem');
  assert.ok(exe.readUInt32LE(optional + 112 + 14 * 8) > 0, 'must contain CLR metadata');
  assert.ok(exe.includes(Buffer.from('교실데스크 · ClassDesk', 'utf16le')), 'Korean version-resource title must survive compilation');
  assert.ok(!exe.includes(Buffer.from('Deskland Preview', 'utf16le')));
  for (const name of ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll',
    'ClassDesk.ico', 'WebView2-LICENSE.txt']) {
    assert.ok(existsSync(new URL('host/bin/' + name, root)), `runtime output missing ${name}`);
  }
  assert.deepEqual(readFileSync(new URL('host/bin/ClassDesk.ico', root)), readFileSync(new URL('host/ClassDesk.ico', root)));
});
