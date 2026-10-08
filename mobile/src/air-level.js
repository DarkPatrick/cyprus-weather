import {t} from './i18n.js';
// Cyprus DLI hourly pollution scale (µg/m³):
// https://www.airquality.dli.mlsi.gov.cy/ (Pollution Level).
// PM2.5, PM10, NO2 and O3 thresholds match the original aranet4 UI.
export const AIR_SCALE={pm25:[25,50,100],pm10:[50,100,200],no2:[100,150,200],o3:[100,140,180],so2:[150,250,350],co:[7000,15000,20000],dust:[50,100,200]};
// Saharan dust has no official scale of its own; it is coarse PM, so it uses the PM10 bands.
// European AQI (CAMS) bands: good, fair, moderate, poor, very poor, extremely poor.
export const EAQI_SCALE=[20,40,60,80,100];
const EAQI_LEVELS=['eaqi.good','eaqi.fair','eaqi.moderate','eaqi.poor','eaqi.veryPoor','eaqi.extremelyPoor'];
const EAQI_CLASSES=['air-low','air-low','air-moderate','air-high','air-very-high','air-very-high'];
const eaqiIndex=value=>{const i=EAQI_SCALE.findIndex(limit=>Number(value)<limit);return i<0?EAQI_SCALE.length:i;};
const finite=value=>value!=null&&Number.isFinite(Number(value));
const LEVELS=['level.low','level.moderate','level.high','level.veryHigh'];
export function airLevel(p,value){
 if(p==='eaqi')return finite(value)?t(EAQI_LEVELS[eaqiIndex(value)]):t('common.noData');
 if(value==null||!Number.isFinite(Number(value))||!AIR_SCALE[p])return t('common.noData');
 const i=AIR_SCALE[p].findIndex(limit=>Number(value)<limit);
 return t(LEVELS[i<0?3:i]);
}

export function airClass(p,value){
 if(p==='eaqi')return finite(value)?EAQI_CLASSES[eaqiIndex(value)]:'air-no-data';
 const valid=value!=null&&Number.isFinite(Number(value))&&AIR_SCALE[p];
 const found=valid?AIR_SCALE[p].findIndex(limit=>Number(value)<limit):-1;
 const index=valid?(found<0?3:found):-1;
 return ['air-low','air-moderate','air-high','air-very-high'][index]||'air-no-data';
}
