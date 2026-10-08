import {t,getLanguage,locale} from './i18n.js';
export function stationName(code){
 const key='station.'+code,label=t(key);
 return label!==key?label:code?.replaceAll('_',' ')||t('common.station');
}
const kinds={'транспортная':'traffic','жилой район':'residential','промышленная':'industrial','фоновая':'background'};
export function sourceKind(kind){return t('sourceKind.'+(kinds[kind]||kind));}
const airPlaces={NICTRA:'LEFKOSIA',NICRES:'LEFKOSIA',LIMTRA:'LIMASSOL',LARTRA:'LCLK',PAFTRA:'PAPHOS',ZYGIND:'ZYGI',MARIND:'MARI',AYMBGR:'AYIA_MARINA_XYLIATOU',PARTRA:'PARALIMNI',KALIND:'KALAVASOS',ORMIND:'ORMIDIA'};
export function airStation(source){return source?.code in airPlaces?stationName(airPlaces[source.code]).split(' · ')[0]:source?.name||t('common.station');}
export function contentText(paragraph){
 if(paragraph&&Object.hasOwn(paragraph,'text'))return paragraph.text??t('translation.pending');
 return (getLanguage()==='el'?paragraph?.el:getLanguage()==='ru'?paragraph?.ru:null)??t('translation.pending');
}
export function climatePeriod(period){
 if(!period)return '';
 const match=String(period).match(/^(\d{4})-(\d{2})(?:\.\.(\d{2}))?$/);
 if(!match)return period;
 const year=+match[1],month=+match[2],last=match[3]?+match[3]:month;
 const format=new Intl.DateTimeFormat(locale(),{month:'long',year:'numeric',timeZone:'UTC'});
 const start=new Date(Date.UTC(year,month-1,1)),end=new Date(Date.UTC(year+(last<month?1:0),last-1,1));
 return match[3]?format.formatRange(start,end):format.format(start);
}
