import {t} from './i18n.js';
import {AIR_SCALE,EAQI_SCALE} from './air-level.js';
const QUALITY=['level.low','level.moderate','level.high','level.veryHigh'];
const HEAT=[[-40,'stress.band.extremeCold','#3559cc'],[-27,'stress.band.veryStrongCold','#4672d1'],[-13,'stress.band.strongCold','#5a8bd9'],[0,'stress.band.moderateCold','#72a4de'],[9,'stress.band.slightCold','#91bddd'],[26,'stress.band.none','#6b9b71'],[32,'stress.band.moderateHeat','#d5a643'],[38,'stress.band.strongHeat','#d88042'],[46,'stress.band.veryStrongHeat','#c95f48'],[Infinity,'stress.band.extremeHeat','#af3b48']];
const WIND=[[.3,'wind.band0'],[1.6,'wind.band1'],[3.4,'wind.band2'],[5.5,'wind.band3'],[8,'wind.band4'],[10.8,'wind.band5'],[13.9,'wind.band6'],[17.2,'wind.band7'],[20.8,'wind.band8'],[24.5,'wind.band9'],[28.5,'wind.band10'],[32.7,'wind.band11'],[Infinity,'wind.band12']];
const PRESSURE=[[987,'pressure.deepLow'],[1000,'pressure.lowSystem'],[1009,'pressure.belowNormal'],[1017,'pressure.normal'],[1027,'pressure.aboveNormal'],[Infinity,'pressure.high']];
const UV=[[3,'level.low'],[6,'level.moderate'],[8,'level.high'],[11,'level.veryHigh'],[Infinity,'level.extreme']];
const SUN=[[-18,'sun.night','#425a9b'],[-12,'sun.astronomicalTwilight','#696ca5'],[-6,'sun.nauticalTwilight','#9d84a8'],[-.833,'sun.civilTwilight','#cfa27c'],[6,'sun.lowSun','#d9be75'],[Infinity,'sun.day','#d7ca8b']];
const COLORS=['#6b9b71','#d5a643','#d88042','#bf515b','#953c61'];
export function chartBands(key,height=null){
 let scale,start=0;
 if(key==='eaqi')scale=[...EAQI_SCALE,Infinity].map((to,i)=>[to,['eaqi.good','eaqi.fair','eaqi.moderate','eaqi.poor','eaqi.veryPoor','eaqi.extremelyPoor'][i],['#50a77f','#8fbf6b','#d5a643','#d88042','#bf515b','#953c61'][i]]);
 else if(AIR_SCALE[key])scale=[...AIR_SCALE[key],Infinity].map((to,i)=>[to,QUALITY[i],COLORS[i]]);
 else if(key==='wind10')scale=WIND.map(([to,label],i)=>[to,label,['#588dd5','#35b5c8','#65b86e','#d3bb42','#e6a53b','#e4863a','#dc683c','#d45148','#c94361','#b34283','#9648a5','#7c4fb7','#624cc2'][i]]);
 else if(key==='utci_shade'||key==='utci_sun'){scale=HEAT;start=-Infinity;}
 else if(key==='sun'){scale=SUN;start=-Infinity;}
 else if(key==='radiation')scale=UV;
 else if(key==='p_station'){
  if(height==null||!Number.isFinite(Number(height)))return [];
  const factor=Math.exp(-9.80665*height/(287.05*288.15));
  scale=PRESSURE.map(([to,label],i)=>[to*factor,label,['#526fb3','#6d89be','#8aadc7','#6b9b71','#c4ac65','#c18b55'][i]]);start=-Infinity;
 }else return [];
 return scale.map(([to,label,color],i)=>({from:i?scale[i-1][0]:start,to,label:t(label),color:color||COLORS[Math.min(i,COLORS.length-1)]}));
}
export function levelView(key,values,height=null){
 const bands=chartBands(key,height),finite=values.filter(v=>v!=null&&Number.isFinite(v));
 if(!bands.length||!finite.length)return null;
 const low=Math.min(...finite),high=Math.max(...finite);let min,max;
 if(['p_station','utci_shade','utci_sun','sun'].includes(key)){
  const pad=Math.max(1,(high-low)*.15);min=Math.floor(low-pad);max=Math.ceil(high+pad);
 }else{
  // Dust is ~1-2 µg/m³ on a clean day: a 10+ axis keeps that noise from looking like an event.
  min=0;max=Math.max(key==='dust'?10:1,Math.ceil(high*1.15));
  if(key==='wind10'){const n=Math.max(2,bands.findIndex(b=>high<b.to));max=Number.isFinite(bands[n]?.to)?bands[n].to:max;}
 }
 const visible=bands.filter(b=>b.to>min&&b.from<max).map(b=>({...b,from:Math.max(min,b.from),to:Math.min(max,b.to)}));
 return {min,max,bands:visible,legend:AIR_SCALE[key]||key==='eaqi'||key==='radiation'?bands:visible};
}
export function chartLevel(key,value,height=null){
 return chartBands(key,height).find(b=>value>=b.from&&value<b.to)?.label||'';
}
