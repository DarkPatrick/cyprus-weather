import {t} from './i18n.js';
// Milliseconds; fixed elapsed hours, independent of midnight and daylight saving.
export function rollingWindow(at){return {from:at-86400000,to:at+86400000};}
export const POLLUTANTS=['pm25','pm10','no2','o3','so2','co'];
// Air tab cards by importance: overall index, particles, Saharan dust, then gases.
// EAQI and dust come only from the CAMS model; there are no ground measurements.
export const AIR_MODEL_ONLY=['eaqi','dust'];
export const AIR_CARDS=['eaqi','pm25','pm10','dust','o3','no2','so2','co'];
export function points(data,key,from=-Infinity,to=Infinity,shift=0,step=3600){
 const rows=(data?.ts||[]).map((t,i)=>[(t+shift)*1000,data[key]?.[i]??null]).filter(([t])=>t>=from&&t<=to);
 const out=[];
 for(const row of rows){
  const last=out.at(-1);
  if(last&&row[0]-last[0]>step*1500)out.push([last[0]+step*1000,null]);
  out.push(row);
 }
 return out;
}
export function latest(data,key,now,maxAge=3600){
 for(let i=(data?.ts?.length||0)-1;i>=0;i--){
  const t=data.ts[i]; if(t<=now&&t>now-maxAge&&data[key]?.[i]!=null)return {value:data[key][i],ts:t};
 }
 return null;
}
export function stress(v){
 if(v==null||(v>=9&&v<=26))return '';
 if(v>46)return t('stress.extremeHeat');
 if(v>38)return t('stress.veryStrongHeat');
 if(v>32)return t('stress.strongHeat');
 if(v>26)return t('stress.moderateHeat');
 if(v>=0)return t('stress.lightCold');
 if(v>=-13)return t('stress.moderateCold');
 return t('stress.strongCold');
}
export function mapReading(data,at){
 if(!data)return null;
 let i=data.ts.findLastIndex(t=>t<=at);
 if(i<0||at-data.ts[i]>3600)return null;
 const reading=Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v[i]]));
 const rain=data.ts.map((t,j)=>t>at-1800&&t<=at?data.rain?.[j]:null).filter(v=>v!=null);
 reading.rain_30m=rain.length?rain.reduce((sum,v)=>sum+v,0):null;
 return reading;
}

export function windDirection(degrees){
 if(degrees==null||!Number.isFinite(Number(degrees)))return '';
 const names=['direction.N','direction.NNE','direction.NE','direction.ENE','direction.E','direction.ESE','direction.SE','direction.SSE','direction.S','direction.SSW','direction.SW','direction.WSW','direction.W','direction.WNW','direction.NW','direction.NNW'];
 return t(names[Math.round(((Number(degrees)%360+360)%360)/22.5)%16]);
}

// UTCI bands match the existing heat/cold stress labels; NET has a different scale.
export function stressClass(v){
 if(v==null||!Number.isFinite(Number(v)))return 'stress-missing';
 if(v>46)return 'stress-extreme';
 if(v>38)return 'stress-very-high';
 if(v>32)return 'stress-high';
 if(v>26)return 'stress-moderate';
 if(v>=9)return 'stress-none';
 if(v>=0)return 'stress-cool';
 if(v>=-13)return 'stress-cold';
 return 'stress-very-cold';
}
