import {warningItems,warningsHTML} from './warnings.js';
import {stationName as name,sourceKind,airStation,contentText,climatePeriod} from './content-labels.js';
import {t as tr,getLanguage,setLanguage,locale,resolveLanguage} from './i18n.js';
import {bindImageShrink} from './image-shrink.js';
import {levelView,chartLevel} from './chart-levels.js';
import {cachedLoader,DATA_TTL} from './data-cache.js';
import './style.css';
import {windStrength,pressureIndicator,uvLevel,todayUvMaximum} from './weather-labels.js';
import {airLevel,airClass} from './air-level.js';
import {boltMarker} from './bolt-layer.js';
import {forecastInterval,probabilityValue,orderedBulletins,bulletinAge,forecastIsCurrent,relativeForecastRange} from './forecast-format.js';
import {tempColor,labelFits,windArrow,rainLevel,flashIndices} from './map-style.js';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart,BarChart,ScatterChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent,MarkAreaComponent,CanvasRenderer]);
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import { sunPosition,sunTimes,sunWindow,HOUR } from './sun.js';
import {points,latest,stress,stressClass,POLLUTANTS,mapReading,rollingWindow,windDirection} from './series.js';

const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(locale(),{maximumFractionDigits:n});
const time=t=>t==null?'—':new Date(t).toLocaleTimeString(locale(),{timeZone:'Asia/Nicosia',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const date=t=>t==null?'—':new Date(t).toLocaleString(locale(),{timeZone:'Asia/Nicosia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const base=(import.meta.env.VITE_API_BASE||'').replace(/\/$/,'');
let metrics;function localizedMetrics(){metrics={temp:[tr("weather.temperature"),'°C'],utci_shade:[tr("weather.shadeUtci"),'°C'],utci_sun:[tr("weather.sunUtci"),'°C'],net:['NET','°C'],wind10:[tr("weather.wind"),tr("units.wind")],rh:[tr("weather.humidity"),'%'],rain:[tr("weather.precipitation"),tr("units.rain")],p_station:[tr("weather.pressure"),tr("units.pressure")],sst:[tr("weather.seaTemperature"),'°C'],sun:[tr("sun.elevation"),'°'],radiation:[tr("sun.radiationChart"),''],pm25:['PM2.5',tr("units.pollution")],pm10:['PM10',tr("units.pollution")],no2:['NO₂',tr("units.pollution")],o3:['O₃',tr("units.pollution")],so2:['SO₂',tr("units.pollution")],co:['CO',tr("units.pollution")]};}localizedMetrics();
const state={stations:[],station:localStorage.getItem('station')||'',tab:'weather',snapshot:null,obs:null,model:null,uv:null,air:null,marine:null,forecast:null,ai:null,health:null,errors:[],generation:0,altitude:localStorage.getItem('altitude')||'',location:null};
let positionRequest=null,locationMarker=null,shellEvents=false,languageGeneration=0;
let map=null,layer=null,boltLayer=null,boltCanvas=null,bolts=null,activeBolts=[],history=null,historyEnd=null,mapTimer=null,chart=null,chartKey=null;
const now=()=>Date.now();
const loadAPI=cachedLoader(async path=>{
 if(Capacitor.isNativePlatform()&&!base)throw Error(tr("error.noServer"));
 const r=await fetch(base+'/api/'+path,{signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error(tr('error.source',{status:r.status}));return r.json();
});
const api=path=>loadAPI(/^weather\/(forecast|ai-forecast|marine)(?:\?|$)/.test(path)?path+(path.includes('?')?'&':'?')+'lang='+getLanguage():path);
function station(){return state.stations.find(s=>s.code===state.station);}
function card(key,label,value,unit,note='',extra='',secondary='',ariaLabel='',indicator=null){
 return `<button class="card ${extra}" data-chart="${key}" ${ariaLabel?`aria-label="${esc(ariaLabel)}"`:!label?`aria-label="${tr("weather.feelsUtci")}"`:''}>${indicator?`<span class="pressure-indicator" title="${esc(indicator.label)}" aria-label="${esc(indicator.label)}">${esc(indicator.symbol)}</span>`:''}<div class="label">${esc(label)}</div><div class="value">${esc(value)}${unit?`<span>${esc(unit)}</span>`:''}</div>${secondary?`<div class="secondary">${esc(secondary)}</div>`:''}<div class="note">${esc(note)}</div></button>`;
}
function disclosure(title,body,open=false){return `<details class="disclosure" ${open?'open':''}><summary>${esc(title)}</summary><div class="body">${body}</div></details>`;}
function forecastCard(key,title,body,label=title,note='',interval=null){
 return `<button class="card forecast-card" data-forecast="${key}" data-title="${esc(title)}" ${interval?`data-from="${interval.from}" data-to="${interval.to}"`:''}><div class="value">${esc(label)}</div>${note?`<div class="note">${esc(note)}</div>`:''}</button><template id="forecast-${key}">${body}</template>`;
}
function openForecast(button){
 document.activeElement?.blur();$('forecasttitle').textContent=button.dataset.title;
 $('forecastbody').innerHTML=$('forecast-'+button.dataset.forecast).innerHTML;
 $('forecastdetail').showModal();
}
function openForecastImage(button){
 const source=button.querySelector('img');document.activeElement?.blur();
 $('forecasttitle').textContent=source.alt;$('forecastdetail').classList.add('image-viewer');
 $('forecastbody').innerHTML=`<div id="imagepan" class="image-pan" tabindex="0" aria-label="${tr("aria.largeImage")}"></div>`;
 const img=new Image();img.alt=source.alt;img.draggable=false;
 img.onload=()=>{
  const view=$('imagepan');if(!view)return;
  img.style.width=Math.ceil(Math.max(img.naturalWidth,view.clientWidth*3,view.clientHeight*1.2*img.naturalWidth/img.naturalHeight))+'px';
  if(button.classList.contains('forecast-image')){view.scrollLeft=(parseFloat(img.style.width)-view.clientWidth)/2;view.scrollTop=(parseFloat(img.style.width)*img.naturalHeight/img.naturalWidth-view.clientHeight)/2;}
 };
 img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('p'),{textContent:tr("common.imageUnavailable")}));};
 $('imagepan').append(img);$('forecastdetail').showModal();img.src=source.src;
 const view=$('imagepan');bindImageShrink(view,img);let drag=null;
 view.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:view.scrollLeft,top:view.scrollTop};view.setPointerCapture(e.pointerId);view.classList.add('dragging');e.preventDefault();});
 view.addEventListener('pointermove',e=>{if(!drag)return;view.scrollLeft=drag.left+drag.x-e.clientX;view.scrollTop=drag.top+drag.y-e.clientY;});
 const stop=()=>{drag=null;view.classList.remove('dragging');};view.addEventListener('pointerup',stop);view.addEventListener('pointercancel',stop);
}
function sourceRad(src){if(!src)return tr("sun.radiationUnavailable");return src.kind==='model'?tr("sun.radiationModel"):tr(src.kind==='near'?'sun.nearRadiation':'sun.stationRadiation',{station:name(src.station),km:num(src.km)});}
function applyTheme(){
 const dark=document.documentElement.dataset.theme==='dark';
 $('theme').innerHTML=dark?'<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
 $('theme').setAttribute('aria-label',dark?tr("theme.light"):tr("theme.dark"));
 $('theme').setAttribute('aria-pressed',String(dark));
 document.querySelector('meta[name="theme-color"]').content=dark?'#0f1c26':'#f7f4ee';
}
function fillShell(){
 $('app').innerHTML=`<main class="shell"><header><div><div class="eyebrow">${tr("brand.subtitle")}</div><h1>${tr("brand.name")}</h1></div><div class="header-actions"><button class="brandmark language-toggle" id="language" type="button" aria-label="${tr("language.select")}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg></button><button class="brandmark" id="theme" type="button" aria-label="${tr("theme.dark")}" aria-pressed="false"><span aria-hidden="true">☀</span></button></div></header>
 <section id="warnings" aria-label="${tr("warnings.title")}" hidden></section>
 <div class="toolbar"><select id="station" aria-label="${tr("aria.weatherStation")}"><option>${tr("common.loadingStations")}</option></select><button class="icon" id="locate" aria-label="${tr("aria.nearestStation")}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg></button><button class="icon" id="refresh" aria-label="${tr("aria.refresh")}">↻</button></div>
 <details class="mapwrap" id="mapwrap"><summary>${tr("map.stations")} <span class="muted">${tr("map.24hours")}</span></summary><div id="map" aria-label="${tr("map.cyprus")}"></div><div class="timeline"><div class="player"><button id="mapplay" aria-label="${tr("map.play")}" aria-pressed="false">▶</button><input id="timeline" aria-label="${tr("map.observationTime")}" type="range" min="0" max="144" value="144" step="1"></div><div class="mapoptions"><span id="maptime">${tr("common.now")}</span><label title="${tr("map.windHelp")}"><input type="checkbox" id="mapwind"> ${tr("weather.wind")}</label></div><div class="maplegend" aria-label="${tr("map.temperatureScale")}"><span>0°</span><span>12°</span><span>20°</span><span>28°</span><span>36°</span></div><div class="map-events"><div id="maprain"></div><div id="mapbolts"></div><div class="map-attribution">${tr("map.lightningAttribution",{year:new Date().getFullYear()})}</div><button id="mapshowbolts" class="mapshowbolts" hidden>${tr("map.allLightning")}</button></div></div></details>
 <div id="status" class="status" role="status">${tr("common.loading")}</div><div id="errors" role="alert"></div><section id="content"></section>
 <footer class="footer"><span class="footer-caption">${tr("sources.caption")}</span><details><summary>${tr("common.sourcesSettings")}</summary><p>${tr("sources.main")}</p><p class="lightning-source">${tr("sources.lightning",{year:new Date().getFullYear()})} <a href="https://www.eumetsat.int/legal-framework/data-policy" target="_blank" rel="noreferrer">${tr("sources.eumetsatPolicy")}</a>.</p><div class="altitude"><label>${tr("settings.altitude")} <input id="altitude" type="number" min="-500" max="4000" placeholder="${tr("common.auto")}" value="${esc(state.altitude)}"></label><button id="savealt">${tr("common.apply")}</button><p>${tr("settings.altitudeHelp")}</p></div><p><a href="https://www.dom.org.cy/" target="_blank" rel="noreferrer">CyDoM</a> · <a href="https://www.airquality.dli.mlsi.gov.cy/" target="_blank" rel="noreferrer">DLI</a> · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></p></details></footer></main>
 <nav class="tabs" role="tablist" aria-label="${tr("nav.sections")}"><button data-tab="weather" role="tab" aria-selected="true"><b>☁</b>${tr("nav.weather")}</button><button data-tab="sun" role="tab" aria-selected="false"><b>☀</b>${tr("nav.sun")}</button><button data-tab="air" role="tab" aria-selected="false"><b>≋</b>${tr("nav.air")}</button><button data-tab="forecast" role="tab" aria-selected="false"><b>▤</b>${tr("nav.forecast")}</button></nav>
 <dialog id="detail"><button class="close" id="close" aria-label="${tr("aria.closeChart")}">×</button><h2 id="charttitle"></h2><p id="chartsubtitle" class="muted"></p><div id="chart" class="chart"></div><div id="chartlevels" class="chart-levels"></div><p id="chartnote" class="chartnote"></p></dialog><dialog id="forecastdetail"><button class="close" id="forecastclose" aria-label="${tr("aria.closeForecast")}">×</button><h2 id="forecasttitle"></h2><div id="forecastbody" class="forecast-body"></div></dialog><dialog id="languagedetail" class="language-dialog"><button class="close" id="languageclose" aria-label="${tr("language.close")}">×</button><h2>${tr("language.select")}</h2><div class="language-options">${[["system",tr("language.system")],["en","English"],["el","Ελληνικά"],["ru","Русский"]].map(([code,label])=>`<button type="button" data-language="${code}" lang="${code==='system'?getLanguage():code}" aria-pressed="${String((localStorage.getItem('language')||'system')===code)}">${label}<span aria-hidden="true">${(localStorage.getItem('language')||'system')===code?'✓':''}</span></button>`).join('')}</div></dialog>`;
 applyTheme();
 $('language').onclick=()=>$('languagedetail').showModal();
 $('languageclose').onclick=()=>$('languagedetail').close();
 $('languagedetail').onclick=e=>{const option=e.target.closest('[data-language]');if(option)changeLanguage(option.dataset.language);else if(e.target===$('languagedetail'))$('languagedetail').close();};
 $('theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';localStorage.setItem('theme',theme);document.documentElement.dataset.theme=theme;applyTheme();if(chartKey&&$('detail').open)drawChart(chartKey);};
 $('station').onchange=e=>selectStation(e.target.value);$('refresh').onclick=refresh;$('locate').onclick=locate;
 $('mapwrap').addEventListener('toggle',()=>{if($('mapwrap').open)openMap();else stopMap();});
 $('timeline').oninput=()=>{stopMap();drawMap();};
 $('mapshowbolts').onclick=()=>{if(activeBolts.length)map.fitBounds(activeBolts.map(i=>[bolts.lat[i],bolts.lon[i]]).concat(state.stations.map(st=>[st.lat,st.lon])),{padding:[20,20]});};
 $('mapwind').checked=localStorage.getItem('mapWind')==='true';
 $('mapwind').onchange=()=>{localStorage.setItem('mapWind',String($('mapwind').checked));drawMap();};
 $('mapplay').onclick=()=>{if(mapTimer){stopMap();return;}if(!history)return;const r=$('timeline');if(+r.value>=144)r.value=0;drawMap();$('mapplay').textContent='❚❚';$('mapplay').setAttribute('aria-label',tr("map.pause"));$('mapplay').setAttribute('aria-pressed','true');mapTimer=setInterval(()=>{r.value=Math.min(144,+r.value+1);drawMap();if(+r.value===144)stopMap();},350);};
 $('content').onclick=e=>{const c=e.target.closest('[data-chart]');if(c)showChart(c.dataset.chart);const f=e.target.closest('[data-forecast]');if(f)openForecast(f);const image=e.target.closest('[data-image]');if(image)openForecastImage(image);};
 document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll('.tabs [data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));render();});
 $('forecastclose').onclick=()=>$('forecastdetail').close();
 $('forecastdetail').addEventListener('close',()=>{$('forecastbody').innerHTML='';$('forecastdetail').classList.remove('image-viewer');});
 $('forecastdetail').addEventListener('click',e=>{if(e.target===$('forecastdetail')){const r=$('forecastdetail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('forecastdetail').close();}});
 $('close').onclick=()=>$('detail').close();
 $('detail').addEventListener('close',()=>{chart?.dispose();chart=null;chartKey=null;});
 $('detail').addEventListener('click',e=>{if(e.target===$('detail')){const r=$('detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('detail').close();}});
 $('savealt').onclick=()=>{const v=$('altitude').value;if(v!==''&&(!Number.isFinite(+v)||+v < -500||+v > 4000)){alert(tr("settings.altitudeRange"));return;}state.altitude=v;localStorage.setItem('altitude',v);loadStation();};
 if(!shellEvents){window.addEventListener('resize',()=>chart?.resize());
 if(Capacitor.isNativePlatform())App.addListener('backButton',()=>{if($('languagedetail').open)$('languagedetail').close();else if($('forecastdetail').open)$('forecastdetail').close();else if($('detail').open)$('detail').close();else if($('mapwrap').open)$('mapwrap').open=false;else App.exitApp();});shellEvents=true;}
}
async function changeLanguage(choice){
 const generation=++languageGeneration;++state.generation;
 const opened=$('mapwrap').open,view=map?{center:map.getCenter(),zoom:map.getZoom()}:null,position=$('timeline').value;
 $('languagedetail').close();stopMap();chart?.dispose();chart=null;chartKey=null;
 map?.remove();map=null;layer=null;boltLayer=null;locationMarker=null;
 if(choice==='system'){localStorage.removeItem('language');setLanguage(resolveLanguage(navigator.languages||[navigator.language]),{persist:false});}
 else setLanguage(choice);
 localizedMetrics();for(const key of ['forecast','ai','marine'])state[key]=null;state.errors=[];
 fillShell();populateStations();render();
 document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
 $('timeline').value=position;if(opened){$('mapwrap').open=true;openMap().then(()=>{if(generation===languageGeneration&&view&&map)map.setView(view.center,view.zoom);});}
 if(generation===languageGeneration)await loadStation();
}
function populateStations(){
 $('station').innerHTML=state.stations.map(s=>`<option value="${esc(s.code)}">${esc(name(s.code))}</option>`).join('');$('station').value=state.station;
}
function renderWarnings(){
 const container=$('warnings');if(!container)return;
 const html=warningsHTML(warningItems(state.marine));
 if(container.dataset.markup!==html){const opened=container.querySelector('.warning-banner')?.open;container.innerHTML=html;container.dataset.markup=html;if(opened&&container.firstElementChild)container.firstElementChild.open=true;}
 container.hidden=!html;
}
setInterval(renderWarnings,60000);
function render(){
 renderWarnings();
 $('app').dataset.tab=state.tab;
 $('altitude').closest('.altitude').hidden=state.tab!=='weather';
 document.querySelector('.footer details > summary').textContent=state.tab==='weather'?tr("common.sourcesSettings"):tr("common.sources");
 const st=station();let html='';
 if(!st){$('errors').innerHTML=state.errors.map(e=>`<div class="error">${esc(e)}</div>`).join('');$('content').innerHTML=`<div class="empty">${tr("error.noStations")}</div>`;return;}
 const s=state.snapshot?.summary||{};const current=state.snapshot?.now||Math.floor(now()/1000);
 const pos=sunPosition(now(),st.lat,st.lon);
 if(state.tab==='weather'){
  html=`<div class="sectiontitle"><h2>${tr("weather.now")}</h2><small>${tr("weather.lastHour")}</small></div><div class="grid weather-grid">`;
  html+=`<div class="card wide temperature-overview">`+card('temp',tr("weather.temperature"),num(s.temp),'°C','','temperature-main');
  html+=`<div class="temperature-feels"><div class="label">${tr("weather.feelsLike")}</div><div class="feels">`;
  html+=card('utci_shade',pos.elevation>0?tr("weather.shade"):'',num(s.utci_shade),'°C','',stressClass(s.utci_shade),'',`${tr(pos.elevation>0?'weather.feelsShade':'weather.feelsLike')} · ${num(s.utci_shade)} °C${stress(s.utci_shade)?' · '+stress(s.utci_shade):''}`);
  if(pos.elevation>0)html+=card('utci_sun',tr("weather.sun"),num(s.utci_sun),'°C','',stressClass(s.utci_sun),'',`${tr("weather.feelsSun")} · ${num(s.utci_sun)} °C${stress(s.utci_sun)?' · '+stress(s.utci_sun):''}`);
  html+=card('net','NET¹',num(s.net),'°C','','feels-net');html+=`</div></div><div class="temperature-footnote">${tr("weather.netFootnote")}</div></div>`;
  html+='<div class="weather-primary-row">';
  const wind=s.wind10??s.wind2;
  const modelDirection=latest(state.model,'wdir',current,7200);
  const direction=s.wdir??modelDirection?.value;
  const directionNote=direction==null?tr("weather.directionUnavailable"):`${windDirection(direction)} · ${num(direction,0)}°${s.wdir==null?' · '+tr('weather.modelDirection'):''}`;
  html+=card('wind10',tr("weather.wind"),num(wind),tr("units.wind"),`${s.wind10!=null?tr("weather.height10"):tr("weather.height2")} · ${directionNote}`,'',windStrength(wind));
  const p=state.snapshot?.pressure,indicator=pressureIndicator(p);
  html+=card('p_station',tr("weather.pressure"),num(p?.value),tr("units.pressure"),p?tr('weather.pressureSource',{station:name(p.source_station),km:num(p.km),height:num(p.target_height,0),kind:tr(p.target_kind==='user'?'common.user':'common.stationLower')}):tr("weather.pressureUnavailable"),'',p?.value!=null?`${num(p.value*0.750061683)} ${tr("units.mercury")}`:'','',indicator);
  html+='</div><div class="weather-secondary-row">';
  html+=card('rain',tr("weather.precipitation"),num(s.rain),tr("units.rain"));
  html+=card('rh',tr("weather.humidity"),num(s.rh,0),'%','');
  const sea=state.marine?.forecast;
  html+=card('sst',tr("weather.sea"),num(sea?.sst),'°C');html+='</div></div>';
 }else if(state.tab==='sun'){
  const t=sunTimes(now(),st.lat,st.lon);const u=latest(state.uv,'uv',current);
  const r=latest(state.obs,'radiation_observed',current,7200),peak=todayUvMaximum(state.uv,now());
  html=`<div class="sectiontitle"><h2>${tr("nav.sun")}</h2><small>${tr("sun.hourlyCharts")}</small></div><div class="grid">`;
  html+=card('sun',tr("sun.now"),num(pos.elevation),'°',tr("sun.azimuth",{degrees:num(pos.azimuth,0)}),'featured');
  html+=card('sun',tr("sun.sunriseSunset"),`${time(t.rise)} — ${time(t.set)}`,'',tr("sun.timeZone"));
  html+=`<div class="card wide radiation-overview"><div class="label">${tr("sun.radiationUv")}</div><div class="uv-grid">`;
  html+=card('radiation',tr("sun.uvNow"),u?num(u.value):'—','',uvLevel(u?.value),'uv-tile');
  html+=card('radiation',tr("sun.todayMaximum"),peak?num(peak.value):'—','',uvLevel(peak?.value),'uv-tile');
  html+=`</div><div class="note">${r?num(r.value,0)+' '+tr('units.radiation'):tr("sun.noStationRadiation")} · UV: CAMS</div></div></div>`;
 }else if(state.tab==='air'){
  html=`<div class="sectiontitle"><h2>${tr("nav.air")}</h2><small>${tr("air.hourly")}</small></div><div class="grid">`;
  const measuredSources=new Map(),modelCards=[];
  for(const p of POLLUTANTS){
   const measured=latest(state.air,p,current,7200),cams=latest(state.air,p+'_cams',current,7200),source=state.air?.sources?.[p];
   const value=measured?.value??cams?.value;
   html+=card(p,metrics[p][0],num(value),metrics[p][1],'',`air-card ${airClass(p,value)}`,'',`${metrics[p][0]} · ${num(value)} ${metrics[p][1]} · ${airLevel(p,value)}`);
   if(measured&&source){
    const key=tr('air.stationSource',{station:airStation(source),kind:sourceKind(source.kind),km:num(source.km)});
    const pollutants=measuredSources.get(key)||[];pollutants.push(metrics[p][0]);measuredSources.set(key,pollutants);
   }else if(cams)modelCards.push(metrics[p][0]);
  }
  const sources=[...measuredSources].map(([label,pollutants])=>`${label} (${pollutants.join(', ')})`);
  const sourceText=[sources.length?tr('air.observationSources',{sources:sources.join('; ')}):'',modelCards.length?tr('air.modelCards',{pollutants:modelCards.join(', ')}):'',state.air?tr("air.modelForecast"):''].filter(Boolean).join('. ');
  html+=`</div><p class="muted air-sources">${esc(sourceText||tr("common.sourcesUnavailable"))}</p>`;
 }else{
  html=`<div class="sectiontitle"><h2>${tr("nav.forecast")}</h2><small>${tr("forecast.service")}</small></div>`;
  const f=state.forecast;
  html+='<div class="forecast-cards">';
  for(const entry of orderedBulletins(f?.bulletins)){const issue=entry.issue,b=entry.issued!=null?entry:null,label={A:tr("forecast.morning"),B:tr("forecast.day"),C:tr("forecast.evening")}[issue];
   html+=forecastCard('issue-'+issue,`${label}${b?' · '+date(b.issued*1000):''}`,b?`<p class="muted">${tr("forecast.valid",{from:date(b.valid_from*1000),to:date(b.valid_to*1000)})}</p>${b.paragraphs.map(p=>`<p>${esc(contentText(p))}</p>`).join('')}`:tr("forecast.issuePending"),label,b?[bulletinAge(b.issued,now()),date(b.issued*1000)].filter(Boolean).join(' · '):tr("common.noDataYet"));}
  html+='</div>';
  html+=`<div class="sectiontitle"><h2>${tr("forecast.ai")}</h2></div><p class="muted ai-updated">${state.ai?.issued?tr('forecast.updated',{date:date(state.ai.issued*1000)}):tr("forecast.updateUnavailable")}</p>`+renderAI(state.ai);
  const tables=f?.bulletins?.filter(b=>b.table_image)||[];
  html+='<div class="official-forecast">'+disclosure(tr("forecast.regionalTable"),tables.length?`<p class="muted">${tr("forecast.originalImage")}</p><p class="muted">${tr("forecast.lastIssue",{issue:tr({A:"forecast.morning",B:"forecast.day",C:"forecast.evening"}[tables[0].issue])})}</p><button class="forecast-image-link" data-image aria-label="${tr("forecast.openTable")}"><img loading="lazy" draggable="false" src="${esc(tables[0].table_image)}" alt="${tr("forecast.tableAlt")}"></button>`:tr("forecast.tableUnavailable"))+'</div>';
  html+=`<div class="sectiontitle"><h2>${tr("forecast.tomorrowMap")}</h2></div>`;
  html+=f?.map_image?`<p class="muted original-image-caption">${tr("forecast.originalImage")}</p><button class="forecast-image-link forecast-image" data-image aria-label="${tr("forecast.openMap")}"><img draggable="false" src="${esc(f.map_image)}" alt="${tr("forecast.mapAlt")}"></button>`:`<p class="muted">${tr("forecast.mapUnavailable")}</p>`;
  html+=disclosure(tr("forecast.seasonal"),renderClimate(f?.climate?.seasonal));
  html+=disclosure(tr("forecast.monthly"),renderClimate(f?.climate?.monthly));
 }
 $('content').innerHTML=html;
 $('content').querySelectorAll('img').forEach(img=>img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('p'),{className:'muted',textContent:tr("common.imageUnavailable")}));});
 const ts=s.latest_ts; $('status').textContent=`${name(st.code)} · ${ts?tr('status.observation',{date:date(ts*1000)}):tr("status.noCurrent")}`;
 $('errors').innerHTML=state.errors.map(e=>`<div class="error">${esc(e)}</div>`).join('');
}
function renderClimate(doc){if(!doc)return tr("forecast.documentPending");return `<p class="muted">${esc(climatePeriod(doc.period))}</p><p>${esc(doc.title)}</p>${doc.summary?`<p>${esc(contentText(doc.summary))}</p>`:''}${Object.entries(doc.sections||{}).map(([k,v])=>`<p><b>${esc(tr("climate."+k))}</b><br>${esc(contentText(v))}</p>`).join('')}${doc.rain_mm!=null?`<p>${tr("forecast.rainNormal",{mm:num(doc.rain_mm),percent:num(doc.rain_pct)})}</p>`:''}${doc.url?`<a href="${esc(doc.url)}" target="_blank" rel="noreferrer">${tr("forecast.originalPdf")}</a>`:''}`;}
function probabilityCell(value){
 const p=probabilityValue(value);
 return p==null?'—':`<span class="pbar" aria-hidden="true"><span style="width:${p}%"></span></span><span>${num(p,0)}%</span>`;
}
function renderAI(doc){
 const d=doc?.answer||doc?.forecast||doc;
 let html='<div class="forecast-cards ai-cards">'+[4,12,24].map(hours=>{
  const h=d?.horizons?.find(h=>Number(h.hours)===hours),interval=forecastInterval(doc?.issued,hours);
  if(interval&&!forecastIsCurrent(interval,now()))return '';
  const title=interval?relativeForecastRange(interval,now()):tr("forecast.periodUnavailable");
  const table=h?`<div class="tablewrap"><table><thead><tr><th>${tr("forecast.region")}</th><th>${tr("forecast.comment")}</th><th>°C</th><th>${tr("weather.precipitation")}</th><th>${tr("forecast.thunder")}</th><th>${tr("weather.wind")}</th></tr></thead><tbody>${(h.regions||[]).map(r=>`<tr><td>${esc(r.region)}</td><td>${esc(r.notes)}</td><td>${num(r.temp_min)}–${num(r.temp_max)}</td><td class="probability">${probabilityCell(r.precip_chance)}</td><td class="probability">${probabilityCell(r.thunder_chance)}</td><td>${esc(r.wind)}</td></tr>`).join('')}</tbody></table></div>`:'';
  const body=h?`<p class="muted">${esc(tr("forecast.confidence",{confidence:h.confidence||"—"}))}</p><p>${esc(h.overview||tr("translation.pending"))}</p>${disclosure(tr("forecast.tableRegions"),table)}`:tr("forecast.pending");
  return forecastCard('ai-'+hours,title,body,interval?title:tr("common.noDataYet"),'',interval);
 }).join('')+'</div>';
 if(doc?.translation_status==='pending')html+='<p class="muted">'+esc(tr('translation.pending'))+'</p>';
 if(d){
  if(d.summary||d.situation)html+=disclosure(tr("forecast.situation"),`<p>${esc(d.summary)}</p><p>${esc(d.situation)}</p>`);
  if(d.model_vs_obs)html+=disclosure(tr("forecast.modelComparison"),`<p>${esc(d.model_vs_obs)}</p>`);
  if(d.risks?.some(Boolean))html+=disclosure(tr("forecast.risks"),`<p>${esc(d.risks.filter(Boolean).join('\n'))}</p>`);
 }
 return html;
}
let refreshing=null,lastRefresh=0;
function refresh(){
 // One refresh at a time: the button, the timer and app resume can coincide.
 if(!refreshing)refreshing=refreshNow().finally(()=>{refreshing=null;});
 return refreshing;
}
async function refreshNow(){
 $('refresh').disabled=true;state.errors=[];
 try{
  state.stations=await api('weather/stations');
  $('station').innerHTML=state.stations.map(s=>`<option value="${esc(s.code)}">${esc(name(s.code))}</option>`).join('');
  if(!state.stations.some(s=>s.code===state.station))state.station=state.stations.find(s=>s.code==='LIMASSOL')?.code||state.stations[0]?.code||'';
  $('station').value=state.station;
  await loadStation();
 }catch(e){state.errors.push(tr('error.network'));$('status').textContent=tr("error.stations");$('errors').innerHTML=`<div class="error">${esc(tr('error.network'))}</div>`;render();}
 // Set after loading, so every cached response is at least this old when the check fires.
 finally{$('refresh').disabled=false;lastRefresh=now();}
}
async function selectStation(code){state.station=code;localStorage.setItem('station',code);$('station').value=code;for(const k of ['snapshot','obs','model','uv','air','pressureObs'])state[k]=null;render();await loadStation();drawMap();}
async function loadStation(){
 const st=station();if(!st){render();return;}
 const gen=++state.generation;
 const window=rollingWindow(now()),start=Math.floor(window.from/1000),end=Math.floor(window.to/1000),q=`station=${encodeURIComponent(st.code)}&from=${start}&to=${end}`;
 state.errors=[];
 const jobs=[['snapshot','weather/snapshot?station='+encodeURIComponent(st.code)+(state.altitude!==''?'&altitude='+encodeURIComponent(state.altitude):'')],['obs','weather/readings?'+q+'&agg=hour'],['model','weather/model?'+q],['uv',`weather/uv?station=${encodeURIComponent(st.code)}&from=${Math.floor(now()/1000)-26*3600}&to=${end}`],['air','weather/air?'+q],['marine','weather/marine'],['forecast','weather/forecast'],['ai','weather/ai-forecast'],['health','health']];
 const results=await Promise.allSettled(jobs.map(([,url])=>api(url)));
 if(gen!==state.generation)return;
 results.forEach((r,i)=>{const key=jobs[i][0];if(r.status==='fulfilled')state[key]=r.value;else{state[key]=null;state.errors.push(tr('error.network'));}});
 state.pressureObs=null;
 const p=state.snapshot?.pressure;
 if(p){try{state.pressureObs=await api(`weather/readings?station=${encodeURIComponent(p.source_station)}&from=${start}&to=${end}&agg=hour`);}catch(e){state.errors.push(tr('error.pressureHistory',{error:tr('error.network')}));}}
 if(gen!==state.generation)return;
 render();if(map)drawMap();if(chartKey)drawChart(chartKey);
}
function requestPosition(){
 if(positionRequest)return positionRequest;
 positionRequest=(async()=>{
  const options={enableHighAccuracy:true,timeout:15000,maximumAge:60000};
  if(Capacitor.isNativePlatform()){
   let permissions=await Geolocation.checkPermissions();
   if(permissions.location!=='granted'&&permissions.coarseLocation!=='granted')permissions=await Geolocation.requestPermissions({permissions:['location']});
   if(permissions.location!=='granted'&&permissions.coarseLocation!=='granted')throw Error(tr("geo.denied"));
   return Geolocation.getCurrentPosition({...options,enableHighAccuracy:permissions.location==='granted'});
  }
  if(!navigator.geolocation)throw Error(tr("geo.unavailable"));
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));
 })().finally(()=>{positionRequest=null;});
 return positionRequest;
}
function showLocation(){
 if(!map||!state.location)return;
 locationMarker?.remove();
 locationMarker=L.circleMarker([state.location.latitude,state.location.longitude],{radius:6,color:'#1f5f8b'}).addTo(map).bindTooltip(tr("geo.youAreHere"));
}
async function applyPosition(p){
 state.location=p.coords;
 const fresh=state.stations.filter(s=>s.latest&&now()/1000-s.latest.ts<=3600);
 if(!fresh.length)throw Error(tr("geo.noRecentStations"));
 const here=L.latLng(p.coords.latitude,p.coords.longitude);
 const nearest=fresh.reduce((best,s)=>here.distanceTo([s.lat,s.lon])<here.distanceTo([best.lat,best.lon])?s:best);
 if(nearest.code!==state.station)await selectStation(nearest.code);
 showLocation();
}
async function locate(){
 $('locate').disabled=true;
 try{await applyPosition(await requestPosition());}
 catch(e){state.errors=[e.code===1?tr("geo.denied"):e.code===3?tr("geo.timeout"):tr('geo.unavailable')];render();}
 finally{$('locate').disabled=false;}
}
async function start(){
 // Request immediately; keep loading weather even while the permission prompt is open.
 const position=requestPosition().catch(()=>null);
 await refresh();
 const p=await position;
 if(p){try{await applyPosition(p);}catch{/* The default or manually selected station stays available. */}}
}
async function openMap(){
 if(!map){map=L.map('map',{zoomControl:false}).setView([35.05,33.1],8);L.control.zoom({zoomInTitle:tr('map.zoomIn'),zoomOutTitle:tr('map.zoomOut')}).addTo(map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:18}).addTo(map);layer=L.layerGroup().addTo(map);boltLayer=L.layerGroup().addTo(map);boltCanvas=L.canvas({padding:.2}); if(state.stations.length)map.fitBounds(state.stations.map(s=>[s.lat,s.lon]),{padding:[25,25],maxZoom:8});}
 showLocation();
 map.off('zoomend moveend',drawMap);map.on('zoomend moveend',drawMap);
 requestAnimationFrame(()=>map.invalidateSize());drawMap();
 const t=Math.floor(now()/600000)*600;$('mapplay').disabled=true;
 const results=await Promise.allSettled([api(`weather/map-history?from=${t-86400-1800}&to=${t}`),api(`weather/lightning?from=${t-25*3600}&to=${t}`)]);
 if(results[0].status==='fulfilled'){history=results[0].value;historyEnd=t;}
 bolts=results[1].status==='fulfilled'?results[1].value:null;
 $('mapplay').disabled=!history;drawMap();
 if(results[0].status==='rejected')$('maptime').textContent=tr("map.historyUnavailable");
}
function stopMap(){clearInterval(mapTimer);mapTimer=null;$('mapplay').textContent='▶';$('mapplay').setAttribute('aria-label',tr("map.play"));$('mapplay').setAttribute('aria-pressed','false');}
function drawMap(){if(!map)return;layer.clearLayers();const offset=(+$('timeline').value-144)/6,at=(offset===0?Math.floor(now()/1000):historyEnd||Math.floor(now()/1000))+offset*3600;$('maptime').textContent=offset===0?tr("common.now"):date(at*1000);
 const raining=[];let rainAvailable=false;
 const positions=state.stations.map(st=>{const p=map.latLngToContainerPoint([st.lat,st.lon]);return {code:st.code,x:p.x,y:p.y};});
 for(let i=0;i<state.stations.length;i++){
  const st=state.stations[i],d=offset===0&&st.latest&&at-st.latest.ts<=3600?st.latest:mapReading(history?.stations?.[st.code],at);
  const rain=rainLevel(d?.rain_30m);if(d?.rain_30m!=null)rainAvailable=true;if(rain)raining.push(name(st.code));
  const label=d?.temp!=null&&labelFits(positions[i],positions,map.getZoom()),color=tempColor(d?.temp);
  const html=($('mapwind').checked?windArrow(d):'')+`<div class="stationdot ${label?'temperature':''} ${st.code===state.station?'selected':''} ${rain?'rain '+rain.cls:''}" style="background:${color.bg};color:${color.fg}">${label?num(d.temp,0)+'°':''}</div>`;
  const marker=L.marker([st.lat,st.lon],{title:name(st.code),icon:L.divIcon({className:'station-marker',html,iconSize:[36,36],iconAnchor:[18,18]})}).addTo(layer);
  marker.bindTooltip(`${esc(name(st.code))} · ${d?num(d.temp)+' °C · '+time(d.ts*1000):tr("map.noHourlyData")}${d?.wdir!=null?' · '+windDirection(d.wdir)+' '+num(d.wdir,0)+'°':''}${rain?' · '+tr('map.rainTooltip',{level:rain.name,mm:num(d.rain_30m)}):''}`);marker.on('click',()=>selectStation(st.code));
 }
 $('maprain').textContent=raining.length?tr('map.rainStations',{stations:raining.join(', ')}):rainAvailable?tr("map.noRain"):tr("map.noRainData");
 boltLayer.clearLayers();const trail=offset===0?4*3600:3600,indices=flashIndices(bolts,at,trail);
 activeBolts=indices;const visible=indices.filter(i=>map.getBounds().contains([bolts.lat[i],bolts.lon[i]])).length;
 $('mapshowbolts').hidden=!indices.length||visible===indices.length;
 indices.forEach(i=>boltMarker(bolts,i,at,trail,boltCanvas).addTo(boltLayer));
 $('mapbolts').textContent=bolts?.available===false||!bolts?tr("map.noLightning"):tr('map.lightningCount',{period:tr(offset===0?'map.fourHours':'map.oneHour'),count:indices.length})+(visible<indices.length?' '+tr('map.visibleCount',{count:visible}):'')+' · EUMETSAT'+(bolts.window?' · '+tr('map.dataUntil',{date:date(bolts.window.end*1000)}):'');
}
function showChart(key){if(key==='utci_sun')key='utci_shade';if(document.activeElement?.matches('[data-chart]'))document.activeElement.blur();chartKey=key;$('detail').showModal();requestAnimationFrame(()=>drawChart(key));}
function drawChart(key){
 const st=station();if(!st)return;
 chart?.dispose();$('chart').classList.toggle('solar',key==='sun');const dark=document.documentElement.dataset.theme==='dark';chart=echarts.init($('chart'),dark?'dark':null);const t=now(),cut=Math.floor(t/HOUR)*HOUR;
 let {from,to}=rollingWindow(t);
 let series=[],axes=[{type:'value',name:metrics[key][1],scale:true}],note=tr("chart.lineHelp");
 const line=(label,data,forecast=false,axis=0,bar=false,color=null)=>({name:label,type:bar?'bar':'line',showSymbol:false,connectNulls:false,yAxisIndex:axis,data,
  lineStyle:{type:forecast?'dashed':'solid',width:2},itemStyle:{color:color||undefined,opacity:forecast?.6:1},...(bar?{barMaxWidth:14}:{}),emphasis:{focus:'series'}});
 if(key==='sun'){
  const w=sunWindow(t,st.lat,st.lon);from=w.from;to=w.to;
  const pts=[];for(let x=from;x<=to;x+=HOUR)pts.push([x,sunPosition(x,st.lat,st.lon).elevation]);
  series=[line(tr("sun.elevationSeries"),pts,false,0,false,'#c98a2b'),{name:tr("common.now"),type:'scatter',data:[[t,sunPosition(t,st.lat,st.lon).elevation]],symbolSize:11,itemStyle:{color:'#1f5f8b'}}];
  series[0].markLine={symbol:'none',silent:true,data:[[0,tr("sun.horizon")],[-6,tr("sun.civilTwilightLine")],[-12,tr("sun.nauticalTwilightLine")],[-18,tr("sun.astronomicalTwilightLine")]].map(([height,label])=>({yAxis:height,name:label,lineStyle:{color:height===0?'#5e7180':'#a9b4bc',type:'dashed'},label:{formatter:label,position:'insideStartTop',fontSize:9,lineHeight:10,color:dark?'#b3c3cf':'#4f6474',backgroundColor:dark?'#14232e':'#fcfbf8'}}))};
  note='';
 }else if(key==='sst'){
  from=t-7*24*HOUR;to=t;series=[line(tr("chart.seaSeries"),points(state.marine?.sst,'sst',from,to,0,86400))];note=tr("chart.seaHelp");
 }else if(key==='radiation'){
  axes=[{type:'value',name:tr("units.radiation"),min:0},{type:'value',name:'UV',min:0}];
  series=[line(tr("chart.radiationObserved"),points(state.obs,'radiation_observed',from,t)),line(tr("chart.radiationModel"),points(state.model,'rad_global',t,to,-1800),true),line(tr("chart.uvCams"),points(state.uv,'uv',from,cut),false,1,false,'#a383b3'),line(tr("chart.uvForecast"),points(state.uv,'uv',t,to),true,1,false,'#a383b3')];
  note=tr('chart.radiationHelp',{source:sourceRad(state.obs?.rad_src)});
 }else if(key==='utci_shade'||key==='utci_sun'){
  const shade=dark?'#7fb8de':'#1f5f8b',sun=dark?'#e6b95a':'#c98a2b';
  const solar=line(tr("weather.sun"),points(state.obs,'utci_sun',from,t),false,0,false,sun);solar.lineStyle.type='dashed';
  series=[line(tr("weather.shade"),points(state.obs,'utci_shade',from,t),false,0,false,shade),solar,line(tr("weather.shade"),points(state.model,'utci_shade',t,to),true,0,false,shade),line(tr("weather.sun"),points(state.model,'utci_sun',t,to),true,0,false,sun)];
  note=tr('chart.utciHelp')+' '+sourceRad(state.obs?.rad_src)+'.';
 }else if(POLLUTANTS.includes(key)){
  const src=state.air?.sources?.[key];
  series=[line(tr("chart.dliObserved"),points(state.air,key,from,t)),line(tr("chart.camsPast"),points(state.air,key+'_cams',from,cut),false,0,false,'#9caec4'),line(tr("chart.camsForecast"),points(state.air,key+'_cams',t,to),true,0,false,'#6685ad')];
  note=src?tr('chart.airHelp',{station:airStation(src),kind:sourceKind(src.kind),km:num(src.km)}):tr("chart.noAirStation");
 }else{
  const bar=key==='rain';let obsKey=key;
  if(key==='wind10'&&!state.obs?.wind10?.some(v=>v!=null))obsKey='wind2';
  if(key==='p_station'){
   const p=state.snapshot?.pressure;
   const pressureData=state.pressureObs;
   if(p&&pressureData){
    const pk=p.source_kind==='station'?'p_station':'p_'+p.source_kind;
    const raw=points(pressureData,pk,from,t);
    const adjusted=raw.map(([x,y],i)=>[x,y==null?null:y*Math.exp(-9.80665*(p.target_height-p.source_height)/(287.05*((pressureData.temp?.[pressureData.ts.findIndex(ts=>ts*1000===x)]??15)+273.15)))]);
    series.push(line(tr("chart.pressureObserved"),adjusted));
   }
   note=p?tr('chart.pressureHelp',{height:num(p.target_height,0),kind:tr(p.target_kind==='user'?'common.user':'chart.selectedStation'),station:name(p.source_station),sourceKind:sourceKind(p.source_kind),km:num(p.km),sourceHeight:num(p.source_height,0)}):tr("weather.pressureSourceUnavailable");
  }else series.push(line(obsKey==='wind2'?tr("chart.observed2m"):tr("chart.observed"),points(state.obs,obsKey,from,t),false,0,bar));
  // Precipitation / radiation refer to the preceding hour; other variables are instantaneous.
  let forecastPoints=points(state.model,key,t,to,bar?-1800:0);
  if(key==='p_station'&&state.snapshot?.pressure){const p=state.snapshot.pressure;const elev=state.model?.elevation;forecastPoints=forecastPoints.map(([x,y])=>[x,y==null||elev==null?null:y*Math.exp(-9.80665*(p.target_height-elev)/(287.05*288.15))]);}
  series.push(line(tr("chart.modelForecast"),forecastPoints,true,0,bar));
  if(bar){axes.push({type:'value',name:'%',min:0,max:100});series.push(line(tr("chart.precipProbability"),points(state.model,'rain_probability',t,to),true,1,false,'#d7a348'));note=tr("chart.rainHelp");}
 }
 const levelAxis=key==='radiation'?1:0,height=state.snapshot?.pressure?.target_height;
 const levelSeries=series.filter(s=>(s.yAxisIndex||0)===levelAxis);
 const levels=levelView(key,levelSeries.flatMap(s=>s.data.map(p=>p[1])),height);
 $('chartlevels').innerHTML=levels?levels.legend.map(b=>`<span><i style="background:${b.color}"></i>${esc(b.label)}</span>`).join(''):'';
 if(levels&&levelSeries[0]){
  axes[levelAxis]={...axes[levelAxis],min:levels.min,max:levels.max};
  levelSeries[0].markArea={silent:true,label:{show:false},data:levels.bands.map(b=>[
   {yAxis:b.from,itemStyle:{color:b.color,opacity:dark?.46:.25},label:{show:(b.to-b.from)/(levels.max-levels.min)>.08,formatter:b.label,position:'insideTopRight',fontSize:9,color:dark?'#e8eef2':'#14324a',backgroundColor:dark?'rgba(15,28,38,.7)':'rgba(252,251,248,.75)',padding:[1,3],borderRadius:3}},{yAxis:b.to}
  ])};
  const target=levelSeries[0];
  target.markLine={...target.markLine,symbol:'none',silent:true,data:[...(target.markLine?.data||[]),...levels.bands.slice(0,-1).map(b=>({yAxis:b.to,label:{show:false},lineStyle:{color:dark?'rgba(232,238,242,.3)':'rgba(20,50,74,.2)',type:'solid',width:1}}))]};
  if(key==='p_station')note+=' '+tr('chart.pressureLevelsHelp');
 }
 const has=series.some(s=>s.data.some(p=>p[1]!=null));
 $('charttitle').textContent=key==='utci_shade'?tr("weather.feelsBoth"):metrics[key][0];$('chartsubtitle').textContent=name(st.code)+' · '+(key==='sst'?tr("chart.sevenDays"):key==='sun'?tr("chart.solarHourly"):tr("chart.24past24forecast"));
 const modelAge=state.model?.fetched?Math.floor(t/1000)-state.model.fetched:0;
 if(modelAge>7200&& !['sun','sst'].includes(key))note+=' '+tr('chart.staleModel');
 $('chartnote').textContent=has?note:tr('chart.noData')+' '+note;
 $('chartnote').hidden=!$('chartnote').textContent;
 series.push({name:tr("chart.nowBoundary"),type:'line',data:[],markLine:{symbol:'none',silent:true,label:{formatter:tr("common.nowLower")},lineStyle:{color:'#6a867b',type:'dotted'},data:[{xAxis:t}]}});
 chart.setOption({backgroundColor:'transparent',color:dark?['#7fb8de','#e08a62','#a3b46a','#d07fa8']:['#1f5f8b','#c4683f','#6f7f3e','#b3427a'],animation:false,tooltip:{trigger:'axis',confine:true,extraCssText:'max-width:min(280px,80vw);white-space:normal;overflow-wrap:anywhere;',valueFormatter:v=>num(v),formatter:params=>`${date(params[0]?.value?.[0])}<br>`+params.filter(p=>p.value?.[1]!=null).map(p=>`${p.marker}${esc(p.seriesName)}: ${num(p.value[1])}${chartLevel(key,p.value[1],height)&&(key!=='radiation'||p.seriesName.includes('UV'))?' · '+esc(chartLevel(key,p.value[1],height)):''}`).join('<br>')},legend:{type:'scroll',bottom:0,data:[...new Set(series.filter(s=>s.name!==tr("chart.nowBoundary")).map(s=>s.name))],textStyle:{fontSize:10}},grid:{left:55,right:axes.length>1?50:20,top:35,bottom:72},xAxis:{type:'time',min:from,max:to,minInterval:key==='sst'?24*HOUR:HOUR,axisLabel:{formatter:v=>key==='sst'?new Date(v).toLocaleDateString(locale(),{timeZone:'Asia/Nicosia',day:'2-digit',month:'2-digit'}):time(v),fontSize:10},splitLine:{show:false}},yAxis:axes,dataZoom:[{type:'inside',filterMode:'none'}],series});
}
async function periodicRefresh(){
 try{if(!document.hidden)await refresh();}
 finally{setTimeout(periodicRefresh,DATA_TTL);}
}
fillShell();start().finally(()=>setTimeout(periodicRefresh,DATA_TTL));

setInterval(async()=>{if(map&&$('mapwrap').open&&!document.hidden){try{const t=Math.floor(now()/1000);bolts=await api(`weather/lightning?from=${t-25*3600}&to=${t}`);drawMap();}catch(e){$('mapbolts').textContent=tr("map.noLightning");}}},DATA_TTL);

function updateAICardTimes(){
 if(state.tab!=='forecast'||document.hidden)return;
 const at=now();
 document.querySelectorAll('.ai-cards [data-to]').forEach(card=>{
  const interval={from:Number(card.dataset.from),to:Number(card.dataset.to)};
  if(!forecastIsCurrent(interval,at)){card.remove();return;}
  const title=relativeForecastRange(interval,at);
  if(card.dataset.title!==title){card.dataset.title=title;card.querySelector('.value').textContent=title;}
 });
}
setInterval(updateAICardTimes,1000);
document.addEventListener('visibilitychange',updateAICardTimes);
// The periodic timer skips refreshes while hidden, so catch up on return to the app.
function refreshIfStale(){if(!document.hidden&&lastRefresh&&now()-lastRefresh>=DATA_TTL)refresh();}
document.addEventListener('visibilitychange',refreshIfStale);
if(Capacitor.isNativePlatform())App.addListener('resume',refreshIfStale);
