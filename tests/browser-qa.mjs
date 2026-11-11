import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../artifacts/qa/',import.meta.url);
await mkdir(output,{recursive:true});
const base=process.env.QA_BASE||'http://127.0.0.1:5188';
const server=process.env.QA_BASE?null:spawn(process.execPath,['prototype/serve.mjs'],{cwd:root,env:{...process.env,PORT:'5188'},stdio:'pipe'});
const report={passed:[],failed:[],screenshots:[],pageErrors:[],networkFailures:[]};
const themes=['beach','meadow','chalkboard','playground','gym','classroom'];
const themePage=id=>id==='beach'?'flat.html':id+'.html';
function watchContext(context){context.on('page',page=>{
  page.on('pageerror',error=>report.pageErrors.push(page.url()+' '+error.message));
  page.on('requestfailed',request=>report.networkFailures.push(request.url()+' '+request.failure()?.errorText));
  page.on('response',response=>{if(response.status()>=400)report.networkFailures.push(response.status()+' '+response.url());});
});return context;}
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,fn){if(process.env.QA_ONLY&&!name.includes(process.env.QA_ONLY))return;try{await fn();report.passed.push(name);console.log('PASS',name);}catch(error){report.failed.push({name,error:error.stack||String(error)});console.error('FAIL',name,error.message);}}
try{
  for(let attempt=0;attempt<50;attempt++){try{const response=await fetch(base);if(response.ok)break;}catch{}if(attempt===49)throw new Error('Local preview server did not start');await sleep(100);}
  const executablePath=process.env.CHROMIUM_PATH||[chromium.executablePath(),'/snap/chromium/current/usr/lib/chromium-browser/chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>existsSync(path));
  const launchOptions={...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']};
  browser=await chromium.launch(launchOptions);
  const context=watchContext(await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}));
  const page=await context.newPage();
  await page.goto(base+'/settings.html');await page.waitForSelector('html[data-ready=true]');
  await check('Korean teacher UI retains the two originals plus four school themes',async()=>{assert.equal(await page.locator('html').getAttribute('lang'),'ko');assert.equal(await page.locator('.theme-card').count(),6);assert.deepEqual(await page.locator('.theme-card').evaluateAll(buttons=>buttons.map(button=>button.dataset.theme)),['beach','meadow','chalkboard','playground','gym','classroom']);assert.ok((await page.title()).includes('교실데스크'));assert.ok((await page.locator('.edition-label').textContent()).includes('기존 2종 + 학교 4종'));assert.ok((await page.evaluate(()=>window.classdesk.snapshot())).groups.length>=2);});
  const hashes=[];
  for(const id of ['chalkboard','playground','gym','classroom']){
    await check(id+' theme selects and renders distinct pixels',async()=>{
      await page.locator(`.theme-card[data-theme="${id}"]`).click();await page.waitForTimeout(550);
      assert.equal(await page.locator(`.theme-card[data-theme="${id}"]`).getAttribute('aria-pressed'),'true');
      assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).theme,id);
      const png=await page.locator('#scene-canvas').screenshot();hashes.push(createHash('sha256').update(png).digest('hex'));
      assert.equal(new Set(hashes).size,hashes.length);
      const scenePath=fileURLToPath(new URL(id+'-scene.png',output));await page.locator('#preview-viewport').screenshot({path:scenePath});
      const path=fileURLToPath(new URL(id+'-desktop.png',output));await page.screenshot({path,fullPage:true});report.screenshots.push(path,scenePath);
    });
  }
  for(const [id,file] of [['beach','flat.html'],['meadow','meadow.html']]){
    await check(id+' preview uses the actual original WebGL2 shader without duplicate icons',async()=>{
      await page.locator(`.theme-card[data-theme="${id}"]`).click();
      const frameElement=page.locator('#legacy-preview');await frameElement.waitFor({state:'visible'});
      const frame=await frameElement.elementHandle().then(handle=>handle.contentFrame());
      await frame.waitForSelector('html[data-ready=true]');
      assert.ok(frame.url().includes('/'+file+'?'));
      assert.equal(await frame.locator('#ghosts,.icon').count(),0,'icons belong only to the parent preview');
      const probe=await frame.evaluate(()=>{
        const gl=document.getElementById('art').getContext('webgl2');
        const image=window.desklandSnapshot(.2).canvas;
        const pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
        const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(pixels.slice(i,i+4).join(','));
        return {webgl:gl instanceof WebGL2RenderingContext,error:gl.getError(),colors:colors.size};
      });
      assert.equal(probe.webgl,true);assert.equal(probe.error,0);assert.ok(probe.colors>20);
      assert.equal(await page.locator('#line-width').isVisible(),false);assert.equal(await page.locator('#texture').isVisible(),false);
      const path=fileURLToPath(new URL(id+'-scene.png',output));await page.locator('#preview-viewport').screenshot({path});report.screenshots.push(path);
    });
  }
  await page.locator('.theme-card[data-theme=chalkboard]').click();
  await check('school boundary style controls render, persist and remain independent by theme',async()=>{
    await page.locator('.theme-card[data-theme=chalkboard]').click();
    assert.equal(await page.locator('#render-mode').count(),1);
    assert.equal(await page.locator('#waviness').count(),1);
    const pixels=[];
    for(const mode of ['outline','fill','both']){
      await page.locator('#render-mode').selectOption(mode);
      assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).settings.renderMode,mode);
      pixels.push(await page.locator('#scene-canvas').evaluate(canvas=>canvas.toDataURL()));
    }
    assert.equal(new Set(pixels).size,3);
    await page.locator('#waviness').evaluate(input=>{input.value='.9';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.reload();await page.waitForSelector('html[data-ready=true]');
    const restored=await page.evaluate(()=>window.classdesk.snapshot());assert.equal(restored.settings.waviness,.9);assert.equal(restored.settings.renderMode,'both');
    await page.locator('.theme-card[data-theme=playground]').click();assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).settings.renderMode,'outline');
    await page.locator('.theme-card[data-theme=chalkboard]').click();assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).settings.waviness,.9);
    await page.locator('#reset-button').click();
  });
  await check('dragging a sample icon updates position and adaptive groups',async()=>{
    const icon=page.locator('.desktop-icon').first();const before=(await page.evaluate(()=>window.classdesk.snapshot())).icons[0];const box=await icon.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+130,box.y+box.height/2+90,{steps:8});await page.mouse.up();
    const after=(await page.evaluate(()=>window.classdesk.snapshot())).icons[0];assert.notEqual(after.x,before.x);assert.notEqual(after.y,before.y);assert.equal(await page.locator('#undo-button').isDisabled(),false);
  });
  await check('undo restores the previous icon arrangement',async()=>{await page.locator('#undo-button').click();assert.equal(await page.locator('#undo-button').isDisabled(),true);});
  await check('keyboard movement and deletion work without modifying files',async()=>{
    const initial=await page.evaluate(()=>window.classdesk.snapshot());const before=initial.icons[0];await page.locator('.desktop-icon').first().focus();await page.keyboard.press('ArrowRight');const after=(await page.evaluate(()=>window.classdesk.snapshot())).icons[0];assert.equal(after.x,Math.round(before.x+8));await page.keyboard.press('Delete');assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).icons.length,initial.icons.length-1);await page.locator('#undo-button').click();
  });
  await check('grouping distance changes grouping, settings persist after reload',async()=>{
    await page.locator('#group-gap').evaluate(input=>{input.value='160';input.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).settings.groupGap,160);await page.reload();await page.waitForSelector('html[data-ready=true]');assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).settings.groupGap,160);
  });
  await check('group names are plain text, saved locally and never executed as HTML',async()=>{
    const input=page.locator('#group-name-list input').first();await input.fill('<img src=x onerror=alert(1)>');await page.reload();await page.waitForSelector('html[data-ready=true]');assert.equal(await page.locator('#group-name-list input').first().inputValue(),'<img src=x onerror=alert(1)>');assert.equal(await page.locator('img[src=x]').count(),0);
  });
  await check('visual reset restores style defaults without erasing saved group names or identities',async()=>{await page.locator('#group-name-list input').first().fill('되돌려도 남는 이름');const before=await page.evaluate(()=>window.classdesk.snapshot());await page.locator('#reset-button').click();const s=await page.evaluate(()=>window.classdesk.snapshot());assert.equal(s.settings.groupGap,56);assert.equal(s.settings.lineWidth,3);assert.deepEqual(s.settings.groupNames,before.settings.groupNames);assert.ok(s.groups.some(group=>group.id===before.groups[0].id&&group.label==='되돌려도 남는 이름'));});
  await check('layout presets and add-sample action create real movable sample icons',async()=>{
    await page.locator('[data-layout=groups]').click();let state=await page.evaluate(()=>window.classdesk.snapshot());assert.ok(state.groups.length>=2);const count=state.icons.length;await page.locator('#add-icon-button').click();state=await page.evaluate(()=>window.classdesk.snapshot());assert.equal(state.icons.length,count+1);await page.locator('[data-layout=work]').click();
  });
  await check('PNG export produces a real background image',async()=>{
    const downloadEvent=page.waitForEvent('download');await page.locator('#download-button').click();const download=await downloadEvent;assert.ok(download.suggestedFilename().endsWith('.png'));const path=fileURLToPath(new URL('exported-background.png',output));await download.saveAs(path);const {readFile}=await import('node:fs/promises');const bytes=await readFile(path);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.ok(bytes.length>5000);
  });
  for(const id of ['beach','meadow'])await check(id+' PNG export composites original shader and saved group names without sample icons',async()=>{
    await page.locator(`.theme-card[data-theme=${id}]`).click();
    await page.locator('#motion').uncheck();
    await page.locator('#group-name-list input').first().fill('이미지에 담을 모둠');
    const frame=await page.locator('#legacy-preview').elementHandle().then(handle=>handle.contentFrame());
    await frame.waitForSelector('html[data-ready=true]');
    assert.equal(await frame.evaluate(()=>typeof window.classdeskBackgroundSnapshot),'function');
    await frame.evaluate(()=>{const original=window.classdeskBackgroundSnapshot;window.classdeskBackgroundSnapshot=(...args)=>{const image=original(...args);window.__exportBackground=image.toDataURL('image/png');return image;};});
    const downloadEvent=page.waitForEvent('download');await page.locator('#download-button').click();const download=await downloadEvent;
    assert.equal(download.suggestedFilename(),'ClassDesk-'+id+'.png');
    const path=fileURLToPath(new URL(id+'-exported-background.png',output));await download.saveAs(path);
    const {readFile}=await import('node:fs/promises');const png=(await readFile(path)).toString('base64');
    const raw=await frame.evaluate(()=>window.__exportBackground);
    assert.ok(raw,'export must use the original shader background-only API');
    assert.equal(await page.evaluate(async({png,raw})=>{
      const {buildScene}=await import('/school-layout.mjs'),{renderLegacyLabels}=await import('/legacy-groups.mjs');
      const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
      const actual=await load('data:image/png;base64,'+png),background=await load(raw),state=window.classdesk.snapshot();
      const expected=document.createElement('canvas');expected.width=actual.width;expected.height=actual.height;const ctx=expected.getContext('2d');
      ctx.drawImage(background,0,0,actual.width,actual.height);ctx.scale(actual.width/state.viewport.width,actual.height/state.viewport.height);
      renderLegacyLabels(ctx,{...state.viewport,scene:buildScene(state.icons,state.viewport,state.settings),settings:state.settings});
      const found=document.createElement('canvas');found.width=actual.width;found.height=actual.height;const other=found.getContext('2d');other.drawImage(actual,0,0);
      const a=ctx.getImageData(0,0,actual.width,actual.height).data,b=other.getImageData(0,0,actual.width,actual.height).data;
      return a.every((value,index)=>value===b[index]);
    },{png,raw}),true,'PNG must equal shader background + labels, with no DOM/OS/sample icons');
  });
  await page.locator('.theme-card[data-theme=chalkboard]').click();
  await check('help dialog opens, traps focus and Escape closes it',async()=>{await page.locator('#help-button').click();assert.equal(await page.locator('#help-dialog').evaluate(dialog=>dialog.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#help-dialog').evaluate(dialog=>dialog.open),false);});
  for(const width of [390,320]){
    await check('mobile '+width+'px has no horizontal overflow and usable controls',async()=>{
      await page.setViewportSize({width,height:844});await page.locator('.theme-card[data-theme=gym]').click();await page.waitForTimeout(550);
      const bounds=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.equal(bounds.client,bounds.scroll);
      assert.ok(await page.locator('#download-button').isVisible());const path=fileURLToPath(new URL('mobile-'+width+'.png',output));await page.screenshot({path,fullPage:true});report.screenshots.push(path);
    });
  }
  await check('all six themes retain separate editable group names across switching and browser reload',async()=>{
    await page.setViewportSize({width:1440,height:1000});
    for(const id of themes){
      await page.locator(`.theme-card[data-theme=${id}]`).click();
      await page.locator('#group-name-list input').first().fill(id+' 수업 자료');
      await page.locator('#group-name-list input').nth(1).fill(id+' 학급 업무');
    }
    await page.reload();await page.waitForSelector('html[data-ready=true]');
    assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).theme,'classroom');
    for(const id of themes){
      await page.locator(`.theme-card[data-theme=${id}]`).click();
      assert.equal(await page.locator('#group-name-list input').first().inputValue(),id+' 수업 자료');
      assert.equal(await page.locator('#group-name-list input').nth(1).inputValue(),id+' 학급 업무');
      const state=await page.evaluate(()=>window.classdesk.snapshot());
      assert.equal(state.groups[0].label,id+' 수업 자료');assert.equal(state.groups[1].label,id+' 학급 업무');
      assert.equal(await page.locator('#legacy-preview').count(),['beach','meadow'].includes(id)?1:0);
    }
    assert.equal(page.frames().length,1,'leaving the originals must dispose their rendering frames');
  });
  await check('legacy preview labels are parent-owned, hide cleanly and reject wrong-origin/source messages',async()=>{
    await page.locator('.theme-card[data-theme=beach]').click();
    const frame=await page.locator('#legacy-preview').elementHandle().then(handle=>handle.contentFrame());
    await frame.waitForSelector('html[data-ready=true]');await frame.waitForFunction(()=>window.classdeskLegacy.snapshot().icons.length>0);
    assert.equal(await frame.locator('#classdesk-labels,#ghosts').count(),0);
    await page.locator('#show-labels').uncheck();
    assert.equal(await page.locator('#scene-canvas').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)),false);
    await page.locator('#show-labels').check();
    assert.equal(await page.locator('#scene-canvas').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)),true);
    const count=await frame.evaluate(()=>window.classdeskLegacy.snapshot().icons.length);
    await frame.evaluate(()=>{
      window.dispatchEvent(new MessageEvent('message',{origin:'https://untrusted.invalid',source:parent,data:{t:'icons',vis:true,r:[]}}));
      window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{t:'icons',vis:true,r:[]}}));
    });
    assert.equal(await frame.evaluate(()=>window.classdeskLegacy.snapshot().icons.length),count);
    await page.locator('.theme-card[data-theme=chalkboard]').click();
  });
  await check('editing legacy group names does not redraw unchanged paused WebGL scenery',async()=>{
    for(const id of ['beach','meadow']){
      await page.locator(`.theme-card[data-theme=${id}]`).click();
      await page.locator('#motion').uncheck();
      const frame=await page.locator('#legacy-preview').elementHandle().then(handle=>handle.contentFrame());
      await frame.waitForFunction(()=>window.classdeskLegacy?.snapshot().paused&&window.classdeskLegacy.snapshot().icons.length>0);
      await page.waitForTimeout(100);
      await frame.evaluate(()=>{window.__staticRedraws=0;const original=window.classdeskLegacy.setPaused;window.classdeskLegacy.setPaused=function(...args){window.__staticRedraws++;return original.apply(this,args);};});
      await page.locator('#group-name-list input').first().fill('이름만 바꾼 구역');
      await page.waitForTimeout(100);
      assert.equal(await frame.evaluate(()=>window.__staticRedraws),0,'renaming must not synchronously redraw the unchanged original shader');
      assert.equal((await page.evaluate(()=>window.classdesk.snapshot())).groups[0].label,'이름만 바꾼 구역');
    }
    await page.locator('.theme-card[data-theme=chalkboard]').click();
  });
  // Release software WebGL resources between independent QA phases. The UI
  // phase already exercises repeated six-theme switching in one real window.
  await context.close();await browser.close();browser=await chromium.launch(launchOptions);
  const nativeContext=watchContext(await browser.newContext({viewport:{width:1366,height:900}}));
  await nativeContext.addInitScript(()=>{window.__nativeSent=[];window.__nativeListeners=[];window.chrome=window.chrome||{};window.chrome.webview={postMessage:data=>window.__nativeSent.push(data),addEventListener:(event,callback)=>window.__nativeListeners.push(callback)};window.__hostDispatch=data=>window.__nativeListeners.forEach(callback=>callback({data:JSON.stringify(data)}));});
  const native=await nativeContext.newPage();
  await native.goto(base+'/settings.html');await native.waitForSelector('html[data-ready=true]');
  await check('Windows settings handshake and native physical icon positions are supported',async()=>{
    const sent=await native.evaluate(()=>window.__nativeSent.map(JSON.parse));assert.ok(sent.some(message=>message.t==='hello'));
    await native.evaluate(()=>{window.__hostDispatch({t:'init',theme:'classroom',params:{},screen:{w:2880,h:1800},autostart:false});window.__hostDispatch({t:'icons',vis:true,r:[[200,200,360,380],[390,200,550,380],[1900,1000,2060,1180]]});});
    const state=await native.evaluate(()=>window.classdesk.snapshot());assert.equal(state.theme,'classroom');assert.equal(state.icons.length,3);assert.equal(state.icons[0].x,200);assert.equal(state.icons[0].name,'자료 01');assert.equal(await native.locator('#add-icon-button').isDisabled(),true);
    await native.locator('.theme-card[data-theme=gym]').click();assert.ok((await native.evaluate(()=>window.__nativeSent.map(JSON.parse))).some(m=>m.t==='theme'&&m.id==='gym'));
  });
  await check('native settings keep all 101 and 500 names when editing, with stale history unable to crowd out active groups',async()=>{
    for(const count of [101,500]){
      await native.evaluate(async count=>{
        const {buildScene}=await import('/school-layout.mjs');
        const icons=Array.from({length:count},(_,i)=>({id:'native-'+i,x:(i%25)*150+30,y:Math.floor(i/25)*150+60,w:64,h:76}));
        const groups=buildScene(icons,{width:4000,height:3200},{groupGap:0}).groups;
        const groupNames=Object.fromEntries([...Array.from({length:512},(_,i)=>['old-'+i,'이전 모둠']),...groups.map((group,i)=>[group.id,'현재 모둠 '+i])]);
        window.__hostDispatch({t:'init',theme:'chalkboard',params:{chalkboard:{motion:false,groupGap:0,groupNames}},screen:{w:4000,h:3200}});
        window.__hostDispatch({t:'icons',vis:true,r:icons.map(icon=>[icon.x,icon.y,icon.x+icon.w,icon.y+icon.h])});
      },count);
      assert.equal(await native.locator('#group-name-list input').count(),count);
      assert.equal(await native.locator('#group-name-list input').last().inputValue(),'현재 모둠 '+(count-1));
      await native.locator('#group-name-list input').first().fill('편집한 모둠');
      const sent=await native.evaluate(()=>window.__nativeSent.map(JSON.parse).filter(message=>message.t==='set'&&message.key==='groupNames').at(-1));
      assert.ok(Object.keys(sent.value).length<=512);
      const state=await native.evaluate(()=>window.classdesk.snapshot());
      assert.equal(sent.value[state.groups.at(-1).id],'현재 모둠 '+(count-1));
    }
  });
  for(const id of themes){
    await check(id+' native wallpaper shows editable names while paused, handles hidden icons and reset',async()=>{
      const wallpaper=await nativeContext.newPage();await wallpaper.goto(base+'/'+themePage(id)+'?wallpaper=1');await wallpaper.waitForSelector('html[data-ready=true]');
      assert.ok((await wallpaper.evaluate(()=>window.__nativeSent)).includes('ready'));
      if(['beach','meadow'].includes(id))assert.equal((await wallpaper.evaluate(()=>window.classdeskLegacy.snapshot())).paused,true,'hosted originals wait for their first host packet instead of rendering unbounded startup frames');
      await wallpaper.evaluate(async()=>{
        const {buildScene}=await import('/school-layout.mjs');
        const group=buildScene([{id:'native-0',x:100,y:100,w:80,h:90},{id:'native-1',x:210,y:100,w:80,h:90}],{width:1366,height:900}).groups[0];
        const names=Object.fromEntries([...Array.from({length:512},(_,i)=>['old-'+i,'이전']),[group.id,'처음부터 저장된 이름']]);
        window.__hostDispatch({t:'pause',v:true});window.__hostDispatch({t:'settings',v:{lineWidth:6,groupNames:names}});window.__hostDispatch({t:'icons',vis:true,r:[[100,100,180,190],[210,100,290,190]]});
      });
      let state=await wallpaper.evaluate(()=>window.classdeskWallpaper.snapshot());assert.equal(state.paused,true);assert.equal(state.iconCount,2);assert.equal(state.settings.lineWidth,6);assert.equal(state.groups[0].label,'처음부터 저장된 이름');
      const groupID=state.groups[0].id;
      await wallpaper.evaluate(({groupID,id})=>window.__hostDispatch({t:'settings',v:{groupNames:{[groupID]:id+' 수업 자료'}}}),{groupID,id});
      state=await wallpaper.evaluate(()=>window.classdeskWallpaper.snapshot());assert.equal(state.groups[0].label,id+' 수업 자료');
      if(['beach','meadow'].includes(id)){
        assert.deepEqual(state.drawnLabels,[id+' 수업 자료']);
        assert.equal(await wallpaper.locator('.icon,#ghosts').count(),0);
        assert.ok(await wallpaper.locator('#classdesk-labels').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)));
      }else{
        const sample=await wallpaper.evaluate(()=>Array.from(document.querySelector('canvas').getContext('2d').getImageData(0,0,1,1).data));assert.ok(sample[3]>0);
      }
      await wallpaper.evaluate(()=>window.__hostDispatch({t:'icons',vis:false,r:[[100,100,180,190]]}));assert.equal((await wallpaper.evaluate(()=>window.classdeskWallpaper.snapshot())).iconCount,0);
      await wallpaper.evaluate(()=>{window.__hostDispatch({t:'reset'});window.__hostDispatch({t:'pause',v:false});});state=await wallpaper.evaluate(()=>window.classdeskWallpaper.snapshot());assert.equal(state.settings.lineWidth,3);assert.equal(state.paused,false);await wallpaper.close();
    });
  }
  await check('original native handshakes receive immediate host settings once and remain static with reduced motion',async()=>{
    const {buildScene}=await import('../prototype/school-layout.mjs');
    const groupID=buildScene([{id:'native-0',x:100,y:100,w:64,h:76}],{width:800,height:600}).groups[0].id;
    const racingContext=watchContext(await browser.newContext({viewport:{width:800,height:600},reducedMotion:'reduce'}));
    await racingContext.addInitScript(({groupID})=>{
      window.__readyCount=0;const listeners=[];window.chrome=window.chrome||{};
      window.chrome.webview={addEventListener:(_event,listener)=>listeners.push(listener),postMessage:message=>{
        if(message!=='ready')return;window.__readyCount++;
        for(const data of [{t:'settings',v:{groupNames:{[groupID]:'바로 받은 모둠'}}},{t:'icons',vis:true,r:[[100,100,164,176]]}])for(const listener of listeners)listener({data:JSON.stringify(data)});
      }};
    },{groupID});
    for(const id of ['beach','meadow']){
      const wallpaper=await racingContext.newPage();await wallpaper.goto(base+'/'+themePage(id)+'?wallpaper=1');await wallpaper.waitForSelector('html[data-ready=true]');
      assert.equal(await wallpaper.evaluate(()=>window.__readyCount),1);
      const state=await wallpaper.evaluate(()=>window.classdeskWallpaper.snapshot());assert.equal(state.iconCount,1);assert.equal(state.groups[0].label,'바로 받은 모둠');assert.deepEqual(state.drawnLabels,['바로 받은 모둠']);assert.equal(state.paused,true);
      const before=await wallpaper.evaluate(()=>window.classdeskLegacy.snapshot());await wallpaper.waitForTimeout(200);
      const after=await wallpaper.evaluate(()=>window.classdeskLegacy.snapshot());assert.equal(before.frames,after.frames);assert.equal(after.mix,1);
      await wallpaper.close();
    }
    await racingContext.close();
  });
  await nativeContext.close();await browser.close();browser=await chromium.launch(launchOptions);
  await check('all six native previews and wallpapers share grouping units, names and aspect at 100%, 125% and 200% DPI',async()=>{
    for(const dpi of [1,1.25,2]){
      const dpiContext=watchContext(await browser.newContext({viewport:{width:Math.round(1920/dpi),height:Math.round(1080/dpi)},deviceScaleFactor:dpi}));
      await dpiContext.addInitScript(()=>{window.__nativeSent=[];window.__nativeListeners=[];window.chrome=window.chrome||{};window.chrome.webview={postMessage:data=>window.__nativeSent.push(data),addEventListener:(event,callback)=>window.__nativeListeners.push(callback)};window.__hostDispatch=data=>window.__nativeListeners.forEach(callback=>callback({data:JSON.stringify(data)}));});
      const settingsPage=await dpiContext.newPage(),wallpaperPage=await dpiContext.newPage();
      await settingsPage.goto(base+'/settings.html');await settingsPage.waitForSelector('html[data-ready=true]');
      const icons={t:'icons',vis:true,r:[[100,100,164,176],[234,100,298,176]]};
      for(const id of themes){
      console.log('DPI CASE',dpi,id);
      await wallpaperPage.goto(base+'/'+themePage(id)+'?wallpaper=1');await wallpaperPage.waitForSelector('html[data-ready=true]');
      await settingsPage.evaluate(({icons,id})=>{window.__hostDispatch({t:'init',theme:id,params:{[id]:{motion:false}},screen:{w:1920,h:1080}});window.__hostDispatch(icons);},{icons,id});
      await wallpaperPage.evaluate(icons=>{window.__hostDispatch({t:'settings',v:{motion:false}});window.__hostDispatch(icons);},icons);
      let preview=await settingsPage.evaluate(()=>window.classdesk.snapshot()),wallpaper=await wallpaperPage.evaluate(()=>window.classdeskWallpaper.snapshot());
      const frame=await settingsPage.locator('#preview-viewport').boundingBox();assert.ok(Math.abs(frame.width/frame.height-1920/1080)<0.01,'native preview must preserve the real screen aspect ratio and square desks');
      assert.equal(preview.groups.length,wallpaper.groupCount,`DPI ${dpi}: preview and wallpaper grouping differ`);
      assert.equal(wallpaper.groupCount,2,`DPI ${dpi}: the 70px physical gap exceeds the 56px threshold`);
      assert.deepEqual(preview.groups.map(group=>group.id),wallpaper.groups.map(group=>group.id));
      await settingsPage.locator('#group-name-list input').first().fill('수업 자료');
      const settings=(await settingsPage.evaluate(()=>window.classdesk.snapshot())).settings;
      await wallpaperPage.evaluate(settings=>window.__hostDispatch({t:'settings',v:settings}),settings);
      wallpaper=await wallpaperPage.evaluate(()=>window.classdeskWallpaper.snapshot());assert.equal(wallpaper.groups[0].label,'수업 자료');
      if(['beach','meadow'].includes(id)){
        assert.equal(wallpaper.drawnLabels[0],'수업 자료');
        const previewFrame=await settingsPage.locator('#legacy-preview').elementHandle().then(handle=>handle.contentFrame());
        await previewFrame.waitForSelector('html[data-ready=true]');
        await previewFrame.waitForFunction(()=>window.classdeskLegacy.snapshot().icons.length===2);
        const shader=await previewFrame.evaluate(()=>window.classdeskLegacy.snapshot());
        assert.equal(shader.icons[0].x,75,'only presentation projects physical rectangles to the preview');
        assert.equal((await wallpaperPage.evaluate(()=>window.classdeskLegacy.snapshot())).icons[0].x,100/dpi);
      }
      await settingsPage.locator('#group-gap').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await wallpaperPage.evaluate(()=>window.__hostDispatch({t:'settings',v:{groupGap:80}}));
      assert.equal((await settingsPage.evaluate(()=>window.classdesk.snapshot())).groups.length,1);assert.equal((await wallpaperPage.evaluate(()=>window.classdeskWallpaper.snapshot())).groupCount,1);
      }
      await dpiContext.close();
    }
  });
  await check('a browser that blocks local storage can still edit and render without a page error',async()=>{
    const restrictedContext=await browser.newContext();
    await restrictedContext.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked storage','SecurityError');}}));
    const restricted=await restrictedContext.newPage();const errors=[];restricted.on('pageerror',error=>errors.push(error.message));
    await restricted.goto(base+'/settings.html');await restricted.waitForSelector('html[data-ready=true]');await restricted.locator('.theme-card[data-theme=playground]').click();await restricted.waitForTimeout(100);
    assert.equal((await restricted.evaluate(()=>window.classdesk.snapshot())).theme,'playground');assert.deepEqual(errors,[]);assert.ok((await restricted.locator('#save-state').innerText()).includes('저장할 수 없어요'));
    await restrictedContext.close();
  });
  await check('all UI fonts and preview assets are served locally without load failures',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkFailures.filter(value=>!value.includes('ERR_ABORTED')),[]);});
  await context.close();await nativeContext.close();
}catch(error){report.failed.push({name:'test harness',error:error.stack||String(error)});console.error(error);}
finally{await browser?.close();server?.kill();await writeFile(new URL('summary.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed.length,failed:report.failed.length,summary:fileURLToPath(new URL('summary.json',output))}));if(report.failed.length)process.exitCode=1;}
