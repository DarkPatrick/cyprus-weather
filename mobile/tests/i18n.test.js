import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLanguage,getLanguage,setLanguage,locale,t} from '../src/i18n.js';
import {windDirection,stress} from '../src/series.js';
import {airLevel,airClass} from '../src/air-level.js';
import {windStrength,pressureIndicator,uvLevel} from '../src/weather-labels.js';
import {chartLevel} from '../src/chart-levels.js';
import {relativeForecastRange,bulletinAge} from '../src/forecast-format.js';
import {rainLevel} from '../src/map-style.js';
import ru from '../src/locales/ru.js';
import en from '../src/locales/en.js';
import el from '../src/locales/el.js';

test('system preference selects the first supported primary language and respects saved override',()=>{
 assert.equal(resolveLanguage(['el-CY','en-GB']),'el');
 assert.equal(resolveLanguage(['de-DE','en-US','ru']),'en');
 assert.equal(resolveLanguage(['EL_gr']),'el');
 assert.equal(resolveLanguage(['fr']),'en');
 assert.equal(resolveLanguage(['en'],'ru'),'ru');
 assert.equal(resolveLanguage(['el'],'invalid'),'el');
});
test('catalogs have aligned keys and interpolation variables',()=>{
 const vars=s=>[...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m=>m[1]).sort();
 for(const catalog of [en,el]){
  assert.deepEqual(Object.keys(catalog).sort(),Object.keys(ru).sort());
  for(const key of Object.keys(ru))assert.deepEqual(vars(catalog[key]),vars(ru[key]),key);
 }
});
test('weather terminology switches immediately and preserves numeric classes',()=>{
 try{
  setLanguage('en',{persist:false});
  assert.equal(getLanguage(),'en');assert.equal(locale(),'en-GB');
  assert.equal(windDirection(90),'E');assert.equal(windStrength(3.4),'gentle breeze · 3 Bft');
  assert.equal(uvLevel(6),'high');assert.equal(airLevel('pm25',25),'moderate');
  assert.equal(airClass('pm25',25),'air-moderate');
  assert.equal(chartLevel('wind10',3.4),'3 · gentle breeze');
  assert.equal(rainLevel(.5).name,'light');assert.equal(stress(35),'Strong heat stress');
  assert(pressureIndicator({value:1020,target_height:0}).label.includes('sea level'));
  setLanguage('el',{persist:false});
  assert.equal(locale(),'el-GR');assert.equal(windDirection(90),'Α');
  assert.equal(airLevel('pm25',25),'μέτριο');assert.equal(airClass('pm25',25),'air-moderate');
  assert.equal(uvLevel(null),'χωρίς δεδομένα');assert.equal(rainLevel(.5).name,'ασθενής');
  const at=Date.parse('2026-10-08T12:00:00+03:00'),from=Date.parse('2026-10-08T11:40:00+03:00');
  assert.equal(relativeForecastRange({from,to:from+4*3600000},at),'σήμερα 11:40 — 15:40');
  assert.equal(bulletinAge((from-86400000)/1000,at),'Χθες');
  assert.equal(t('forecast.daysAgo',{days:2}),'Πριν από 2 ημέρες');
  setLanguage('xx',{persist:false});assert.equal(getLanguage(),'el');
 }finally{setLanguage('ru',{persist:false});}
});
