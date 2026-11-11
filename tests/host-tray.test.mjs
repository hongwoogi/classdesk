import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../host/DesktopHost.cs',import.meta.url),'utf8');
const wallpaper=source.slice(source.indexOf('class WallpaperForm : Form'),source.indexOf('class IconReader'));
const settings=source.slice(source.indexOf('class SettingsForm : Form'),source.indexOf('class WallpaperForm : Form'));

test('the background wallpaper explicitly excludes Alt+Tab before its desktop attachment',()=>{
 assert.match(wallpaper,/override CreateParams CreateParams/);
 assert.ok(/cp\.ExStyle\s*=.*WS_EX_TOOLWINDOW.*WS_EX_NOACTIVATE.*~WS_EX_APPWINDOW/.test(wallpaper),'background window uses tool/no-activate styles and clears app-window style');
 assert.ok(/WS_EX_TOOLWINDOW = 0x00000080/.test(wallpaper));
 assert.ok(/WS_EX_APPWINDOW = 0x00040000/.test(wallpaper));
 assert.ok(/WS_EX_NOACTIVATE = 0x08000000/.test(wallpaper));
 assert.match(wallpaper,/override bool ShowWithoutActivation\s*\{\s*get\s*\{\s*return true;/);
 assert.match(wallpaper,/ShowInTaskbar = false/);
});

test('minimizing settings keeps it in the taskbar instead of hiding/closing the window, and left-clicking tray opens settings',()=>{
 assert.doesNotMatch(settings,/WindowState == FormWindowState\.Minimized\)\s*Hide\(\)/,'minimizing or Win+D must not hide settings from the taskbar');
 assert.match(settings,/ShowInTaskbar = true/,'only a deliberately open settings window remains a normal task');
 assert.match(source,/e\.Button == MouseButtons\.Left\)\s*OpenSettings\(\)/,'left-click tray opens settings directly instead of popping exit menu under cursor');
 assert.match(source,/if \(settingsWin\.WindowState == FormWindowState\.Minimized\) settingsWin\.WindowState = FormWindowState\.Normal/);
 assert.match(source,/settingsWin\.BringToFront\(\)/);
});
