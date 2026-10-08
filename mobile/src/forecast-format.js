import {t,locale} from './i18n.js';
export function forecastInterval(issued,hours){
 if(!Number.isFinite(Number(issued))||!Number.isFinite(Number(hours))||issued==null)return null;
 return {from:Number(issued)*1000,to:(Number(issued)+Number(hours)*3600)*1000};
}
export function probabilityValue(value){
 return value==null||!Number.isFinite(Number(value))?null:Math.min(100,Math.max(0,Number(value)));
}

export function orderedBulletins(bulletins=[]){
 return ['A','B','C'].map(issue=>bulletins.find(b=>b.issue===issue)||{issue,issued:null})
  .sort((a,b)=>(a.issued??Infinity)-(b.issued??Infinity));
}
export function bulletinAge(issued,at=Date.now()){
 if(issued==null||!Number.isFinite(Number(issued)))return '';
 const day=t=>{
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));
  const v=Object.fromEntries(p.map(p=>[p.type,p.value]));
  return Date.UTC(Number(v.year),Number(v.month)-1,Number(v.day));
 };
 const days=Math.round((day(at)-day(Number(issued)*1000))/86400000);
 return days===1?t('forecast.yesterdayTitle'):days>1?t('forecast.daysAgo',{days}):'';
}

export function forecastIsCurrent(interval,at=Date.now()){
 return interval!=null&&interval.to>=at;
}
export function relativeForecastTime(timestamp,at=Date.now()){
 const calendar=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'});
 const day=t=>{const v=Object.fromEntries(calendar.formatToParts(new Date(t)).map(p=>[p.type,p.value]));return Date.UTC(+v.year,+v.month-1,+v.day);};
 const offset=Math.round((day(timestamp)-day(at))/86400000);
 const label=offset===-1?'forecast.yesterday':offset===0?'forecast.today':offset===1?'forecast.tomorrow':null;
 if(!label)return '';
 return t(label)+' '+new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Nicosia',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp));
}

export function relativeForecastRange(interval,at=Date.now()){
 if(!interval)return '';
 const from=relativeForecastTime(interval.from,at),to=relativeForecastTime(interval.to,at);
 const end=from.split(' ')[0]===to.split(' ')[0]?to.slice(to.indexOf(' ')+1):to;
 return `${from} — ${end}`;
}
