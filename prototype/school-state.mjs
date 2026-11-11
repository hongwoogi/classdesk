// ClassDesk preferences are local to this device; no filenames leave the app.
export const STORAGE_KEY = 'classdesk.workspace.v1';
import {DEFAULT_SETTINGS,THEME_IDS,buildScene,sanitizeGroupNames,initialGroupID} from './school-layout.mjs';
import {sanitizeGroupCatalog} from './school-scene-model.mjs';
const safeNumber = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);

export function restoreWorkspace(raw, defaults = {}) {
  let data = raw;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch { data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const params = {};
  for (const theme of THEME_IDS) {
    params[theme] = {...DEFAULT_SETTINGS,...defaults};
    const values = data.params && own(data.params,theme) && data.params[theme];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    for (const [key, min, max] of [['groupGap',0,160],['padding',8,64],['lineWidth',1,12],['texture',0,1],['waviness',0,1],['labelSize',11,28],['roundBoundary',0,1]]) {
      if (own(values,key)) params[theme][key] = safeNumber(values[key],min,max,params[theme][key]);
    }
    if (typeof values.roundBoundary === 'boolean') params[theme].roundBoundary = values.roundBoundary ? 1 : 0;
    for (const key of ['showLabels','motion','playgroundBoundary']) if (typeof values[key] === 'boolean') params[theme][key] = values[key];
    if (['outline','fill','both'].includes(values.renderMode)) params[theme].renderMode=values.renderMode;
    if(own(values,'groupCatalog'))params[theme].groupCatalog=sanitizeGroupCatalog(values.groupCatalog);

  }
  const seen = new Set();
  const icons = [];
  if (Array.isArray(data.icons)) for (const icon of data.icons.slice(0,500)) {
    if (!icon || typeof icon !== 'object' || typeof icon.id !== 'string' || !icon.id || seen.has(icon.id)) continue;
    if (!['x','y','w','h'].every(k => Number.isFinite(icon[k])) || icon.w <= 0 || icon.h <= 0) continue;
    seen.add(icon.id);
    icons.push({id:icon.id.slice(0,100),...(typeof icon.legacyId==='string'&&/^native-\d{1,3}$/.test(icon.legacyId)&&Number(icon.legacyId.slice(7))<500?{legacyId:icon.legacyId}:{}),name:typeof icon.name === 'string' ? icon.name.slice(0,60) : '자료',type:['folder','document','sheet','slides','pdf'].includes(icon.type) ? icon.type : 'document',x:safeNumber(icon.x,0,10000,0),y:safeNumber(icon.y,0,10000,0),w:safeNumber(icon.w,20,300,72),h:safeNumber(icon.h,20,300,80)});
  }
  for(const theme of THEME_IDS){
    const names=data.params&&own(data.params,theme)&&data.params[theme]?.groupNames;
    if(names&&typeof names==='object'&&!Array.isArray(names)){
      // Coordinates are already clipped on native ingress; a broad viewport keeps
      // restoration independent of the presentation size and preserves membership.
      const active=params[theme].groupCatalog?.groups.length?params[theme].groupCatalog.groups.filter(group=>group.active).map(group=>group.id):buildScene(icons,{width:32768,height:32768},params[theme]).groups.map(group=>initialGroupID(group,names));
      params[theme].groupNames=sanitizeGroupNames(names,active);
    }
  }
  return {version:1,theme:THEME_IDS.includes(data.theme) ? data.theme : 'chalkboard',params,layout:['work','groups','scattered'].includes(data.layout) ? data.layout : 'work',icons};
}

export function iconsFromHost(message, screen, viewport = {width:1440,height:900}) {
  if (!message || message.vis === false || !Array.isArray(message.r)) return [];
  const screenW = screen?.w ?? screen?.width;
  const screenH = screen?.h ?? screen?.height;
  if (![screenW,screenH,viewport.width,viewport.height].every(n => Number.isFinite(n) && n > 0)) return [];
  const seen=new Set();
  return message.r.slice(0,500).flatMap((rect,index) => {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) return [];
    const [l,t,r,b] = rect;
    if (r <= l || b <= t || r <= 0 || b <= 0 || l >= screenW || t >= screenH) return [];
    const supplied=Array.isArray(message.ids)?message.ids[index]:null;
    let id=typeof supplied==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(supplied)&&!['__proto__','prototype','constructor'].includes(supplied)&&!seen.has(supplied)?supplied:'native-'+index;
    for(let suffix=1;seen.has(id);suffix++)id='native-'+index+'-'+suffix;
    seen.add(id);
    return [{id,...(id!=='native-'+index?{legacyId:'native-'+index}:{}),name:'자료 '+String(index+1).padStart(2,'0'),type:'document',x:Math.max(0,l)/screenW*viewport.width,y:Math.max(0,t)/screenH*viewport.height,w:(Math.min(screenW,r)-Math.max(0,l))/screenW*viewport.width,h:(Math.min(screenH,b)-Math.max(0,t))/screenH*viewport.height}];
  });
}

export function decodeHostMessage(data) {
  try {
    const value = typeof data === 'string' ? JSON.parse(data) : data;
    return value && typeof value === 'object' && !Array.isArray(value) && typeof value.t === 'string' ? value : null;
  } catch { return null; }
}

export function saveWorkspace(storage, state) {
  try { storage.setItem(STORAGE_KEY,JSON.stringify(restoreWorkspace(state))); return true; }
  catch { return false; }
}
