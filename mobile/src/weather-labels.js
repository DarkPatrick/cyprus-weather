import {t,getLanguage} from './i18n.js';
// Beaufort names and thresholds reused from aranet4/static/weather.js.
const WIND=[.3,1.6,3.4,5.5,8,10.8,13.9,17.2,20.8,24.5,28.5,32.7,Infinity];
export function windStrength(value){
 if(value==null||!Number.isFinite(Number(value))||value<0)return '';
 const i=WIND.findIndex(to=>value<to);
 const label=t('wind.force'+i);
 return getLanguage()==='ru'?`${label} (${i} балл${i===1?'':i>1&&i<5?'а':'ов'})`:t('wind.strength',{label,force:i});
}
export function pressureIndicator(p){
 if(p?.value==null||!Number.isFinite(Number(p.value)))return null;
 // Compare at sea level, so high-altitude stations do not always appear low.
 const sea=p.source_kind==='msl'||p.source_kind==='qnh'?p.source_pressure:p.target_height==null?null:p.value*Math.exp(9.80665*p.target_height/(287.05*288.15));
 if(sea==null||!Number.isFinite(sea))return null;
 if(sea<1009)return {symbol:'↓',label:t('weather.pressureLow')};
 if(sea>=1017)return {symbol:'↑',label:t('weather.pressureHigh')};
 return null;
}

const cyprusDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'});
export function uvLevel(v){
 if(v==null||!Number.isFinite(Number(v)))return t('common.noDataLower');
 return t(v<3?'level.low':v<6?'level.moderate':v<8?'level.high':v<11?'level.veryHigh':'level.extreme');
}
export function todayUvMaximum(data,at){
 const day=cyprusDay.format(new Date(at));let peak=null;
 (data?.ts||[]).forEach((ts,i)=>{
  const value=data.uv?.[i],time=ts*1000;
  if(value!=null&&Number.isFinite(Number(value))&&cyprusDay.format(new Date(time))===day&&(!peak||value>peak.value))peak={value:Number(value),at:time};
 });
 return peak;
}
