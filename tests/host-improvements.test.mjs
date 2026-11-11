import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const host = () => read('host/DesktopHost.cs');
const method = (source, start, end = '\n    }') => {
  const at = source.indexOf(start);
  assert.ok(at >= 0, `missing ${start}`);
  return source.slice(at, source.indexOf(end, at) + end.length);
};

test('bounded JSON serializer and wallpaper receiver fit the largest safe-ID catalog', () => {
  const source = host();
  const serializer = method(source, 'static class Json', '\n}\n');
  assert.match(serializer, /new JavaScriptSerializer\s*\{\s*MaxJsonLength\s*=\s*GroupStateRules\.MaxJsonCharacters\s*\}/);
  assert.match(serializer, /Parse\(string s\).*S\.DeserializeObject\(s\)/);
  assert.match(serializer, /Stringify\(object o\).*S\.Serialize\(o\)/);
  const receiver = source.slice(source.indexOf('class WallpaperForm : Form'), source.indexOf('class IconReader : IDisposable'));
  assert.match(receiver, /msg != null && msg\.Length <= GroupStateRules\.MaxJsonCharacters/);
  const capacity = Number(read('host/GroupState.cs').match(/const int MaxJsonCharacters\s*=\s*(\d+)\s*;/)?.[1]);
  assert.ok(Number.isSafeInteger(capacity) && capacity <= 64 * 1024 * 1024, 'keep a finite explicit character cap');
  // Reuse the same 500 strings across records: unique within each record, no huge fixture file.
  // 128 is stricter than the producer ingress's 100-character bound and covers every SafeId.
  const members = Array.from({ length: 500 }, (_, i) => `i-${i}`.padEnd(128, 'a'));
  const groups = Array.from({ length: 512 }, (_, i) => ({ id: `g-${i}`.padEnd(128, 'b'), members,
    bounds: { x: 100, y: 100, w: 180, h: 200 }, colorIndex: 4, active: i < 500, recency: 9007199254740991 }));
  const packet = { t: 'groupState', theme: 'chalkboard', catalog: { version: 1, nextId: 513, groups }, labels: [] };
  const serialized = JSON.stringify(packet);
  assert.ok(serialized.length > 2 * 1024 * 1024, 'fixture exceeds the previous serializer/receiver cap');
  assert.ok(serialized.length <= capacity, `all 256000 safe-ID memberships fit: ${serialized.length} <= ${capacity}`);
  assert.equal(JSON.parse(serialized).catalog.groups.length, 512);
});

// These are source contracts for unavailable Win32 integration, not GUI tests.
test('Explorer reads glyph-only rectangles and ignores failed or invalid reads', () => {
  const source = method(host(), 'class IconReader : IDisposable', '\n}\n');
  assert.match(source, /LVIR_ICON\s*=\s*1/);
  assert.match(source, /new Native\.RECT\s*\{\s*Left = LVIR_ICON\s*\}/);
  assert.doesNotMatch(source, /LVIR_BOUNDS/);
  assert.match(source, /SendMessage\(listView, 0x100E[^\n]*== IntPtr.Zero/);
  assert.match(source, /IconGlyph\.IsValid/);
  assert.doesNotMatch(source, /GETITEMTEXT|GETITEMPOSITION|SETITEMPOSITION|GetWindowText|File\.Read/);
});

test('one native icon packet carries parallel stable IDs to wallpaper and settings', () => {
  const source = host();
  const poll = method(source, '    void PollIcons()');
  assert.match(source, /readonly IconIdentityTracker iconIds = new IconIdentityTracker\(\)/);
  assert.match(poll, /iconIds\.Update\(glyphs, visible\)/);
  assert.ok(poll.includes('\\\"ids\\\":'), 'packet includes opaque IDs');
  assert.match(poll, /IconsChanged\(json\)/);
  assert.match(poll, /Post\(json\)/);
  assert.doesNotMatch(poll, /new IconIdentityTracker|\.Clear\(/);
});

test('wallpaper groupState has a separate relay path and only explicit ready handshakes', () => {
  const source = host();
  const wallpaper = source.slice(source.indexOf('class WallpaperForm : Form'), source.indexOf('class IconReader : IDisposable'));
  const receive = wallpaper.slice(wallpaper.indexOf('core.WebMessageReceived +='), wallpaper.indexOf('core.Navigate(PageUrl);'));
  assert.ok(receive.includes('if (msg != "ready")'), 'unknown/groupState messages must not initialize again');
  assert.ok(receive.includes('GroupStateReceived(packet)'), 'relay group state independently');
  assert.ok(receive.indexOf('return;\n                }') < receive.indexOf('SettingsJson()'), 'non-ready path ends before handshake');
  assert.ok(source.includes('form.GroupStateReceived += OnGroupState;'));
  const relay = method(source, '    void OnGroupState(');
  assert.match(relay, /groupState\.Accept\(packet, Settings\.Theme, settings\)/);
  assert.match(relay, /if \(groupState\.CatalogChanged\)/);
  assert.ok(relay.includes('settings["groupCatalog"] = groupState.Catalog;'));
  assert.ok(relay.includes('"t", "groupState", "theme", Settings.Theme, "catalog", groupState.Catalog'));
  assert.doesNotMatch(relay, /SettingsMessage|"init"|PollIcons|Settings\.Save/);
  assert.ok(source.includes('saveDue = DateTime.Now.AddMilliseconds(800)'), 'debounce catalog writes');
  assert.ok(method(source, '    void Exit()').includes('if (saveDue != DateTime.MaxValue) Settings.Save();'), 'flush pending catalog on exit');
});

test('native visual reset keeps group identity and names instead of deleting theme data', () => {
  const source = host();
  assert.ok(source.includes('GroupStateRules.ResetVisual(Settings.For(theme));'));
  assert.ok(!source.includes('Settings.Params.Remove(theme);'));
});

test('desktop editing is a clipped nonactivating child of the icon layer and fails closed', () => {
  const path = join(root, 'host/DesktopGroupEditor.cs');
  assert.ok(existsSync(path), 'missing actual desktop pencil/editor implementation');
  const source = read('host/DesktopGroupEditor.cs');
  for (const token of ['IconReader.FindDesktopParent()', 'GetParent(', 'GetWindowDpiAwarenessContext',
    'SetThreadDpiAwarenessContext', 'AreDpiAwarenessContextsEqual', 'GetAwarenessFromDpiAwarenessContext',
    'Native.WS_CHILD', 'Native.WS_POPUP', 'WS_EX_NOACTIVATE', 'ShowWithoutActivation', 'region.MakeEmpty()',
    'region.Union(button.Bounds)', 'Region = region', 'DesktopEditGeometry.ButtonRect', 'CancelEditor()',
    'FluentEditButton', 'SmoothingMode.AntiAlias',
    'Keys.Enter', 'Keys.Escape', 'Deactivate +=', 'AccessibleName = "구역 이름"', 'WM_IME_STARTCOMPOSITION']) {
    assert.ok(source.includes(token), `native edit contract missing ${token}`);
  }
  assert.doesNotMatch(source, /TopMost\s*=\s*true|HWND_TOPMOST|SetProcessDPIAware|SetProcessDpiAwarenessContext|new SettingsForm/);
  assert.match(source, /if \(!iconsVisible \|\| paused \|\| !hostAvailable\(\)\)/);
  assert.match(source, /if \(parent == IntPtr.Zero/);
  assert.match(source, /if \(scope == null\) return false;/);
  const native = host();
  assert.ok(native.includes('desktopEditor.SetLabels(groupState.Theme, groupState.Labels);'));
  assert.ok(native.includes('form.GroupNameEdited += OnGroupNameEdited;'));
  assert.ok(native.includes('desktopEditor.SetIcons(visible, glyphs, screen);'));
  assert.ok(native.includes('desktopEditor.SetPaused(true);'));
  assert.ok(native.includes('desktopEditor.Dispose();'));
  const edit = method(native, '    void OnGroupNameEdited(');
  assert.match(edit, /groupState\.TryRename/);
  assert.ok(edit.includes('settings["groupNames"] = names;'));
  assert.ok(edit.includes('"t", "settings", "v", Json.Obj("groupNames", names)'));
  assert.ok(edit.includes('"t", "groupNames", "theme", theme, "groupNames", names'));
  assert.doesNotMatch(edit, /groupCatalog|"init"|OpenSettings/);
});

test('settings cannot replace the wallpaper catalog or pass unsafe group-name objects', () => {
  const source = host();
  const setting = source.slice(source.indexOf('            case "set":'), source.indexOf('            case "reset":'));
  assert.ok(setting.includes('key == "groupCatalog"'), 'wallpaper is the only catalog authority');
  assert.ok(setting.includes('GroupStateRules.SanitizeNames'), 'validate names without touching catalog');
  assert.ok(setting.includes('!ThemeAllowed(theme)'));
});

test('desktop child controls are also updated under the matched DPI context', () => {
  const source = read('host/DesktopGroupEditor.cs');
  const refresh = method(source, '    void Refresh()');
  assert.ok(refresh.includes('DesktopDpiScope.Enter(parent)'), 'not only the overlay handle: child buttons must use the parent DPI context');
});

test('invalid Explorer glyphs abort a snapshot rather than rename temporarily missing items', () => {
  const read = method(host(), '    public List<Native.RECT> Read(out bool visible)');
  assert.match(read, /if \(!IconGlyph\.IsValid\(r.Left, r.Top, r.Right, r.Bottom\)\) return null;/);
  assert.doesNotMatch(read, /\) continue;/);
});

test('native host compiles every helper in both SDK and UTF-8 PowerShell paths', () => {
  const project = read('host/ClassDesk.csproj');
  const powershell = read('host/build.ps1');
  assert.ok(project.includes('<Version>'+JSON.parse(read('package.json')).version+'</Version>'));
  assert.ok(project.includes('<LangVersion>5</LangVersion>'));
  for (const file of ['DesktopHost.cs','Themes.cs','IconIdentityTracker.cs','GroupState.cs','DesktopGroupEditor.cs']) {
    assert.ok(project.includes(`<Compile Include="${file}" />`), `SDK omits ${file}`);
    assert.ok(powershell.includes(`$root\\${file}`), `Framework compiler omits ${file}`);
  }
  assert.deepEqual([...readFileSync(join(root,'host/build.ps1')).subarray(0,3)],[0xef,0xbb,0xbf]);
});

const nativeCases = {
  exactBeforeCenter: `
    var tracker=new IconIdentityTracker();
    var large=new IconGlyph(100,100,148,148); var small=new IconGlyph(108,108,140,140);
    string[] before=tracker.Update(new[] {large,small},true);
    string[] after=tracker.Update(new[] {small,large},true);
    Check(after[0]==before[1] && after[1]==before[0],"exact rectangles win before ambiguous equal-center matches");
  `,
  namePriority: `
    var names=D(); for(int i=0;i<512;i++) names["history-"+i]="과거 "+i;
    names["g-1"]=new string('가',45);
    var clean=GroupStateRules.SanitizeNames(names,Catalog(1));
    Check(clean.Count==512 && (string)clean["g-1"]==new string('가',40), "active group names win over bounded history");
    Check(names.Count==513 && ((string)names["g-1"]).Length==45,"sanitization does not mutate source");
    Check(GroupStateRules.SanitizeNames(D("__proto__",D("polluted",true)),null)==null,"pollution payloads are ignored");
    var label=Label("g-1","자료"); label["editRect"]=new object[] {0,0,0,0};
    var state=new GroupStateSession();
    Check(state.Accept(D("t","groupState","theme","chalkboard","catalog",Catalog(1),"labels",new object[] {label}),"chalkboard",D()),"an explicit zero hit area remains a valid label");
    Check(state.Labels.Count==1 && state.Labels[0].HasExplicitEditRect && !state.Labels[0].EditRect.HasValue,"keep label identity and text for noninteractive fallback");
  `,
  hitAreas: `
    var label=new GroupLabel {Id="g-1",Text="자료",Rect=new PhysicalRect(100,100,160,28),EditRect=new PhysicalRect(264,100,24,24)};
    var icons=new List<IconGlyph>(); var occupied=new List<PhysicalRect>();
    PhysicalRect? hit=DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied);
    Check(hit.HasValue && hit.Value.X==264 && hit.Value.Width==24 && hit.Value.Height==24,"only a small pencil, never a whole label/screen hitbox");
    icons.Add(new IconGlyph(264,100,312,148));
    hit=DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied);
    Check(!hit.HasValue || !DesktopEditGeometry.OverlapsIcon(hit.Value,icons[0]),"pencil never steals OS icon or conservative filename-cell clicks");
    label.Rect=new PhysicalRect(-500,-500,100,28); label.EditRect=new PhysicalRect(-40,-40,24,24);
    Check(!DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied).HasValue,"offscreen geometry has no input region");
    label.Rect=new PhysicalRect(100,100,160,28); label.EditRect=new PhysicalRect(0,0,1920,1080); icons.Clear();
    hit=DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied);
    Check(!hit.HasValue,"oversized explicit editRect fails closed instead of moving the pencil into file clicks");
    label.EditRect=null; label.HasExplicitEditRect=true;
    Check(!DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied).HasValue,"explicit zero/invalid editRect suppresses every automatic fallback");
    label.EditRect=new PhysicalRect(264,100,24,24); occupied.Add(new PhysicalRect(0,0,1920,1080));
    Check(!DesktopEditGeometry.ButtonRect(label,1920,1080,icons,occupied).HasValue,"overlapping edit regions fail closed");
  `,
  rename: `
    var state = new GroupStateSession(); var catalog=Catalog(512); var names=D();
    for(int i=1;i<=512;i++) names["g-"+i]="이름 "+i;
    var settings=D("groupNames",names,"groupCatalog",catalog,"threshold",70);
    Check(state.Accept(D("t","groupState","theme","chalkboard","catalog",catalog,"labels",new object[] {Label("g-1","이름 1")}),"chalkboard",settings),"state is ready");
    Dictionary<string,object> merged;
    string emoji=char.ConvertFromUtf32(0x1F4DA); string longName=""; for(int i=0;i<45;i++) longName+=emoji;
    Check(state.TryRename("chalkboard","g-1",longName,settings,out merged), "rename a currently visible group");
    Check(merged.Count==512 && (string)merged["g-1"]==longName.Substring(0,80), "40 Unicode codepoints, not 40 UTF-16 units");
    Check((string)merged["g-512"]=="이름 512" && (string)names["g-1"]=="이름 1", "merge only the target; do not mutate or truncate other names");
    Check(Object.ReferenceEquals(settings["groupCatalog"],catalog) && (int)settings["threshold"]==70, "renaming never overwrites identity or visual parameters");
    settings["groupNames"]=merged;
    Check(!state.TryRename("chalkboard","g-1",longName,settings,out merged), "unchanged names do not save");
    Check(!state.TryRename("gym","g-1","bad",settings,out merged), "reject stale theme edit");
    Check(!state.TryRename("chalkboard","g-512","bad",settings,out merged), "inactive/no-label group cannot be edited");
    Check(!state.TryRename("chalkboard","constructor","bad",settings,out merged), "reject unsafe IDs");
    Check(GroupStateRules.PlainText("  자료\\n모음\\0"+char.ConvertFromUtf32(0x1F4DA)+"\\uD800")=="자료 모음"+emoji, "strip controls/unpaired surrogate, preserve plain Unicode");
    Check(state.TryRename("chalkboard","g-1","   ",settings,out merged) && !merged.ContainsKey("g-1") && merged.Count==511,"empty name clears only the target override");
    state.Clear(); Check(!state.TryRename("chalkboard","g-1","bad",settings,out merged), "navigation/disposal invalidates edit scope");
  `,
  reset: `
    var names = D("g-1","수업 자료","g-2","과제"); var catalog = Catalog(2);
    var settings = D("groupNames",names,"groupCatalog",catalog,"threshold",60,"animate",false);
    GroupStateRules.ResetVisual(settings);
    Check(settings.Count==2 && Object.ReferenceEquals(settings["groupNames"],names) && Object.ReferenceEquals(settings["groupCatalog"],catalog), "visual reset preserves exact names and identity metadata");
  `,
  validation: `
    var state = new GroupStateSession(); var settings = D();
    var packet = D("t","groupState","theme","chalkboard","catalog",Catalog(512),"labels",new object[] { Label("g-1", "자료") });
    Check(state.Accept(packet,"chalkboard",settings), "512 records including 500 active are supported");
    packet["catalog"] = Catalog(513); Check(!state.Accept(packet,"chalkboard",settings), "reject over 512 records");
    var cat = Catalog(501); ((Dictionary<string,object>)((object[])cat["groups"])[500])["active"] = true;
    packet["catalog"] = cat; Check(!state.Accept(packet,"chalkboard",settings), "reject over 500 active groups");
    cat=Catalog(1); cat["nextId"]="2"; packet["catalog"]=cat; Check(!state.Accept(packet,"chalkboard",settings), "numeric strings are not integers");
    cat=Catalog(1); cat["version"]=2; packet["catalog"]=cat; Check(!state.Accept(packet,"chalkboard",settings), "reject unknown schema version");
    cat=Catalog(1); var group=(Dictionary<string,object>)((object[])cat["groups"])[0];
    ((Dictionary<string,object>)group["bounds"])["x"]=double.NaN; packet["catalog"]=cat;
    Check(!state.Accept(packet,"chalkboard",settings), "reject nonfinite geometry");
    ((Dictionary<string,object>)group["bounds"])["x"]=1e20;
    Check(!state.Accept(packet,"chalkboard",settings), "reject huge geometry");
    ((Dictionary<string,object>)group["bounds"])["x"]="100";
    Check(!state.Accept(packet,"chalkboard",settings), "reject nonnumeric geometry");
    cat=Catalog(1); cat["__proto__"]=D("polluted",true); packet["catalog"]=cat;
    Check(!state.Accept(packet,"chalkboard",settings), "reject pollution keys");
    cat=Catalog(2); ((Dictionary<string,object>)((object[])cat["groups"])[1])["id"]="g-1"; packet["catalog"]=cat;
    Check(!state.Accept(packet,"chalkboard",settings), "reject duplicate group IDs");
    cat=Catalog(1); group=(Dictionary<string,object>)((object[])cat["groups"])[0]; group["members"]=new object[] { "constructor" }; packet["catalog"]=cat;
    Check(!state.Accept(packet,"chalkboard",settings), "reject unsafe member IDs");
    cat=Catalog(1); cat["recency"]=12; group=(Dictionary<string,object>)((object[])cat["groups"])[0]; group["lastSeen"]=100;
    packet["catalog"]=cat; Check(state.Accept(packet,"chalkboard",settings), "integer recency extensions survive validation");
    Check((int)state.Catalog["recency"]==12 && (int)((Dictionary<string,object>)((object[])state.Catalog["groups"])[0])["lastSeen"]==100, "preserve bounded recency fields");
    settings["groupCatalog"]=state.Catalog;
    var valid=Label("g-1",new string('가',45)); var bad=Label("g-1","bad"); bad["rect"]=new object[] { "100",0,24,24 };
    packet["labels"]=new object[] { bad,Label("g-999","stale"),valid };
    Check(state.Accept(packet,"chalkboard",settings) && state.Labels.Count==1, "invalid geometry and out-of-catalog labels cannot create edit hit areas");
    Check(state.Labels[0].Text.Length==40 && state.Labels[0].Rect.X==100 && state.Labels[0].EditRect.HasValue, "physical label geometry and 40-codepoint text");
    packet["constructor"]=D(); Check(!state.Accept(packet,"chalkboard",settings), "reject message pollution");
  `,
  catalogMemberLimit: `
    var catalog=Catalog(1); var group=(Dictionary<string,object>)((object[])catalog["groups"])[0];
    var overflow=new object[501]; for(int i=0;i<overflow.Length;i++) overflow[i]="i-"+i;
    group["members"]=overflow;
    Check(GroupStateRules.CleanCatalog(catalog)==null,"reject records above the shared 500-member limit");
    var members=new object[500]; Array.Copy(overflow,members,500);
    catalog=Catalog(512);
    foreach(Dictionary<string,object> record in (object[])catalog["groups"]) record["members"]=members;
    var clean=GroupStateRules.CleanCatalog(catalog);
    Check(clean!=null && ((System.Collections.IList)clean["groups"]).Count==512,"accept the full 512 by 500 bounded catalog");
    int total=0; foreach(Dictionary<string,object> record in (System.Collections.IList)clean["groups"]) total+=((System.Collections.IList)record["members"]).Count;
    Check(total==256000,"the theoretical maximum preserves all 256000 memberships");
    group=(Dictionary<string,object>)((object[])catalog["groups"])[0]; group["members"]=new object[] {"i-1","i-1"};
    Check(GroupStateRules.CleanCatalog(catalog)==null,"duplicate member IDs remain invalid");
    group["members"]=new object[] {1};
    Check(GroupStateRules.CleanCatalog(catalog)==null,"wrong-type member IDs remain invalid");
  `,
  catalogHistory: `
    var catalog=Catalog(34); var groups=(object[])catalog["groups"]; int total=0;
    for(int g=0;g<groups.Length;g++) {
      var group=(Dictionary<string,object>)groups[g]; var members=new object[500];
      for(int m=0;m<members.Length;m++) members[m]="i-"+g+"-"+m;
      group["members"]=members; group["active"]=g==33;
      group["bounds"]=D("x",g*300,"y",100,"w",180,"h",200);
    }
    var clean=GroupStateRules.CleanCatalog(catalog);
    Check(clean!=null,"producer-reachable history with 17000 memberships must not be rejected");
    Check(((System.Collections.IList)clean["groups"]).Count==34,"preserve every historical record");
    int active=0;
    foreach(Dictionary<string,object> group in (System.Collections.IList)clean["groups"]) {
      total+=((System.Collections.IList)group["members"]).Count; if((bool)group["active"]) active++;
    }
    Check(total==17000 && active==1 && GroupStateRules.Same(clean,GroupStateRules.CleanCatalog(clean)),"preserve all 17000 members and one active record idempotently");
    var names=D("g-1","과거 이름","g-34","현재 이름"); var settings=D("groupNames",names);
    var packet=D("t","groupState","theme","chalkboard","catalog",catalog,"labels",new object[] {Label("g-34","현재 이름")});
    var state=new GroupStateSession();
    Check(state.Accept(packet,"chalkboard",settings) && state.CatalogChanged,"history reaches persistence and relay");
    settings["groupCatalog"]=state.Catalog;
    Check(state.Accept(packet,"chalkboard",settings) && !state.CatalogChanged,"duplicate historical catalog must not resave");
    Check(Object.ReferenceEquals(settings["groupNames"],names) && names.Count==2,"history never drops names");
  `,
  catalogRelay: `
    var state = new GroupStateSession(); var settings = D();
    var catalog = Catalog(1);
    var packet = D("t","groupState","theme","chalkboard","catalog",catalog,"labels",new object[] { Label("g-1", "자료") });
    Check(state.Accept(packet, "chalkboard", settings), "accept the authoritative wallpaper group state");
    Check(state.CatalogChanged && state.Labels.Count == 1, "first catalog schedules persistence and native labels");
    settings["groupCatalog"] = state.Catalog;
    Check(state.Accept(packet,"chalkboard",settings) && !state.CatalogChanged, "duplicate catalog must not resave");
    packet["labels"] = new object[] { Label("g-1", "수업 자료") };
    Check(state.Accept(packet,"chalkboard",settings) && !state.CatalogChanged && state.Labels[0].Text == "수업 자료", "labels-only/name updates do not resave identity");
    packet.Remove("catalog");
    Check(state.Accept(packet,"chalkboard",settings) && !state.CatalogChanged, "optional catalog is not rewritten per frame");
    Check(!state.Accept(packet,"gym",settings), "reject stale theme state");
    packet["t"] = "unknown";
    Check(!state.Accept(packet,"chalkboard",settings), "ignore unknown messages");
  `,
  moves: `
    var tracker = new IconIdentityTracker();
    var a = new IconGlyph(0,0,48,48); var b = new IconGlyph(400,0,448,48);
    var anchor = new IconGlyph(900,0,948,48);
    string[] start = tracker.Update(new[] { a,b,anchor }, true);
    string[] single = tracker.Update(new[] { a,new IconGlyph(3000,500,3048,548),anchor }, true);
    Check(single[0] == start[0] && single[1] == start[1] && single[2] == start[2], "a single moved pair keeps its ID even over a long drag");
    tracker = new IconIdentityTracker(); start = tracker.Update(new[] { a,b,anchor }, true);
    string[] nearby = tracker.Update(new[] { new IconGlyph(20,30,68,78),new IconGlyph(420,30,468,78),anchor }, true);
    Check(nearby[0] == start[0] && nearby[1] == start[1], "bounded mutually unambiguous moves keep identity");
    tracker = new IconIdentityTracker(); start = tracker.Update(new[] { a,b }, true);
    string[] far = tracker.Update(new[] { new IconGlyph(3000,0,3048,48),new IconGlyph(4000,0,4048,48) }, true);
    Check(Array.IndexOf(start, far[0]) < 0 && Array.IndexOf(start, far[1]) < 0, "multi-item distant replacements cannot steal old IDs");
    tracker = new IconIdentityTracker(); start = tracker.Update(new[] { a,new IconGlyph(100,0,148,48) }, true);
    string[] ambiguous = tracker.Update(new[] { new IconGlyph(50,10,98,58),new IconGlyph(50,-10,98,38) }, true);
    Check(Array.IndexOf(start, ambiguous[0]) < 0 && Array.IndexOf(start, ambiguous[1]) < 0, "equidistant ambiguous moves get fresh IDs");
  `,
  tracking: `
    var tracker = new IconIdentityTracker();
    var a = new IconGlyph(100,100,148,148); var b = new IconGlyph(300,100,348,148);
    var c = new IconGlyph(500,100,548,148); var added = new IconGlyph(700,100,748,148);
    string[] first = tracker.Update(new[] { a,b,c }, true);
    Check(first.Length == 3 && first[0] != first[1] && first[1] != first[2], "unique opaque IDs");
    Check(first[0].StartsWith("i-") && first[0].Length == 34, "opaque IDs contain no index or shell pointer");
    string[] reordered = tracker.Update(new[] { c,a,b }, true);
    Check(reordered[0] == first[2] && reordered[1] == first[0] && reordered[2] == first[1], "reordering cannot rename icons");
    string[] inserted = tracker.Update(new[] { added,c,a,b }, true);
    Check(inserted[1] == first[2] && inserted[2] == first[0] && inserted[3] == first[1], "insertion cannot rename existing icons");
    Check(Array.IndexOf(first, inserted[0]) < 0, "new item gets a fresh ID");
    string[] deleted = tracker.Update(new[] { b,a }, true);
    Check(deleted[0] == first[1] && deleted[1] == first[0], "deletion cannot rename survivors");
    Check(tracker.Update(new IconGlyph[0], false).Length == 0, "hidden packet has parallel empty IDs");
    string[] shown = tracker.Update(new[] { a,b }, true);
    Check(shown[0] == first[0] && shown[1] == first[1], "hide/show must retain history");
    string[] resized = tracker.Update(new[] { new IconGlyph(96,96,152,152),b }, true);
    Check(resized[0] == first[0], "exact glyph center wins despite a size change");
  `,
  geometry: `
    Check(IconGlyph.IsValid(100, 120, 148, 168), "a physical glyph rectangle is valid");
    Check(!IconGlyph.IsValid(100, 120, 100, 168), "zero width is invalid");
    Check(!IconGlyph.IsValid(100, 120, 148, 110), "reversed bounds are invalid");
    Check(!IconGlyph.IsValid(int.MinValue, 0, int.MaxValue, 48), "overflow/huge bounds are invalid");
    Check(!IconGlyph.IsValid(0, 0, 20000, 48), "a label-sized bogus rectangle is invalid");
  `,
};

let nativeAssembly;
function runNative(context, name) {
  const sdk = process.env.CLASSDESK_DOTNET || join(process.env.DOTNET_ROOT ||
    join(process.env.TMPDIR || '/home/ubuntu/.hermes/cache/scratch', 'classdesk-sdk'), 'dotnet');
  if (!existsSync(sdk)) {
    assert.notEqual(process.env.CLASSDESK_REQUIRE_NATIVE_TESTS, '1', 'the .NET SDK is required for pure C# execution');
    context.skip('pure C# execution requires CLASSDESK_DOTNET or DOTNET_ROOT; source contracts still run');
    return;
  }
  assert.ok(existsSync(join(root, 'host/IconIdentityTracker.cs')), 'missing production glyph/identity helper');
  if (!nativeAssembly) {
    const sources = ['IconIdentityTracker.cs', 'GroupState.cs'].filter(file => existsSync(join(root, 'host', file)));
    const program = `using System; using System.Collections.Generic;\nclass HostTests {\n` +
      `static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }\n` +
      `static Dictionary<string,object> D(params object[] pairs) { var d = new Dictionary<string,object>(); for(int i=0;i<pairs.Length;i+=2) d[(string)pairs[i]]=pairs[i+1]; return d; }\n` +
      `static Dictionary<string,object> Label(string id,string text) { return D("id",id,"text",text,"rect",new object[] {100,120,160,28},"editRect",new object[] {264,120,24,24}); }\n` +
      `static Dictionary<string,object> Catalog(int count) { var groups = new object[count]; for(int i=0;i<count;i++) groups[i]=D("id","g-"+(i+1),"members",new object[] {"i-"+(i+1)},"bounds",D("x",100,"y",100,"w",180,"h",200),"colorIndex",i%5,"active",i<500); return D("version",1,"nextId",count+1,"groups",groups); }\n` +
      `static void Main(string[] args) { switch(args[0]) {\n` + Object.entries(nativeCases).map(([key, body]) =>
        `case "${key}": { ${body} Console.WriteLine("PASS ${key}"); break; }`).join('\n') +
      `default: throw new Exception("unknown case"); } } }`;
    const hash = createHash('sha256').update(program + sources.map(file => read('host/' + file)).join('\n')).digest('hex').slice(0, 16);
    const work = join(root, 'host/lib/pure-tests', hash);
    mkdirSync(work, { recursive: true });
    const project = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType>` +
      `<TargetFramework>net8.0</TargetFramework><LangVersion>5</LangVersion><EnableDefaultItems>false</EnableDefaultItems>` +
      `<NuGetAudit>false</NuGetAudit></PropertyGroup><ItemGroup><Compile Include="Program.cs"/>` +
      sources.map(file => `<Compile Include="${join(root, 'host', file)}"/>`).join('') + `</ItemGroup></Project>`;
    writeFileSync(join(work, 'HostTests.csproj'), project);
    writeFileSync(join(work, 'Program.cs'), program);
    const env = { ...process.env, DOTNET_ROOT: dirname(sdk), DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1', NUGET_PACKAGES: join(root, 'host/lib/nuget') };
    const build = spawnSync(sdk, ['build', 'HostTests.csproj', '--nologo', '--verbosity', 'quiet', '--ignore-failed-sources'],
      { cwd: work, env, encoding: 'utf8', timeout: 120000 });
    assert.equal(build.status, 0, `pure production C# must compile:\n${build.stdout}\n${build.stderr}`);
    nativeAssembly = { sdk, env, dll: join(work, 'bin/Debug/net8.0/HostTests.dll') };
  }
  const { env, dll } = nativeAssembly;
  const run = spawnSync(sdk, [dll, name], { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(run.status, 0, `pure production C# case ${name}:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, new RegExp(`PASS ${name}`));
}

test('exact glyph positions take priority over ambiguous equal centers (real C#)', context => runNative(context, 'exactBeforeCenter'));
test('active names have stable priority and explicit-zero labels retain identity (real C#)', context => runNative(context, 'namePriority'));
test('desktop pencil geometry is clipped, icon-safe and explicit-zero noninteractive (real C#)', context => runNative(context, 'hitAreas'));
test('native name edits merge one scoped ID with safe 40-codepoint plaintext (real C#)', context => runNative(context, 'rename'));
test('visual reset removes only presentation parameters (real C#)', context => runNative(context, 'reset'));
test('catalog and label validation rejects malformed geometry, limits and pollution (real C#)', context => runNative(context, 'validation'));
test('catalog members enforce 500 per record and accept the 256000 total bound (real C#)', context => runNative(context, 'catalogMemberLimit'));
test('producer-reachable 34-record catalog preserves 17000 historical memberships (real C#)', context => runNative(context, 'catalogHistory'));
test('catalog relay accepts current-theme state and deduplicates persistence (real C#)', context => runNative(context, 'catalogRelay'));
test('physical glyph validation rejects empty, reversed and overflowing bounds (real C#)', context => runNative(context, 'geometry'));
test('moves keep IDs only for a single pair or bounded unambiguous nearest matches (real C#)', context => runNative(context, 'moves'));
test('position-only IDs survive reorder, insertion, deletion, size changes and hide/show (real C#)', context => runNative(context, 'tracking'));
