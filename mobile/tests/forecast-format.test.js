import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastInterval,probabilityValue,orderedBulletins,bulletinAge,forecastIsCurrent,relativeForecastTime,relativeForecastRange} from '../src/forecast-format.js';
import {airClass} from '../src/air-level.js';
import {mapReading} from '../src/series.js';
import {rainLevel,flashIndices} from '../src/map-style.js';
test('forecast intervals start at issue time and span midnight',()=>{
 const start=Date.parse('2026-10-07T22:40:00+03:00');
 const d=forecastInterval(start/1000,4);
 assert.equal(d.from,start);assert.equal(d.to-start,4*3600000);
 assert.equal(new Date(d.to).toISOString(),'2026-10-07T23:40:00.000Z');
 assert.equal(forecastInterval(null,4),null);
});
test('probability bars distinguish missing values and clamp percentages',()=>{
 assert.equal(probabilityValue(null),null);assert.equal(probabilityValue(0),0);
 assert.equal(probabilityValue(-5),0);assert.equal(probabilityValue(120),100);
});
test('pollutant colors share level boundaries and keep unknown values neutral',()=>{
 assert.equal(airClass('pm25',24),'air-low');assert.equal(airClass('pm25',25),'air-moderate');
 assert.equal(airClass('pm25',50),'air-high');assert.equal(airClass('pm25',100),'air-very-high');
 assert.equal(airClass('co',null),'air-no-data');
});
test('map rain sums only the preceding half hour without treating missing as zero',()=>{
 const d={ts:[0,600,1200,1800,2400],temp:[20,20,20,20,20],rain:[99,.1,.2,.3,99]};
 assert(Math.abs(mapReading(d,1800).rain_30m-.6)<1e-9);
 assert.equal(mapReading({ts:[1800],temp:[20],rain:[null]},1800).rain_30m,null);
 assert.equal(rainLevel(.5).cls,'light');assert.equal(rainLevel(2).cls,'moderate');assert.equal(rainLevel(4).cls,'heavy');
 assert.equal(rainLevel(null),null);
});
test('lightning timeline excludes future flashes and uses selected trailing window',()=>{
 const d={ts:[0,3600,7200,10800,14400]};
 assert.deepEqual(flashIndices(d,10800,3600),[2,3]);
 assert.deepEqual(flashIndices(d,10800,4*3600),[0,1,2,3]);
});

test('bulletins sort oldest first with missing issues last',()=>{
 assert.deepEqual(orderedBulletins([{issue:'A',issued:100},{issue:'C',issued:50},{issue:'B',issued:200}]).map(b=>b.issue),['C','A','B']);
 assert.deepEqual(orderedBulletins([{issue:'C',issued:100}]).map(b=>b.issue),['C','A','B']);
});
test('yesterday means Cyprus calendar day across midnight and daylight saving',()=>{
 const secs=s=>Date.parse(s)/1000;
 assert.equal(bulletinAge(secs('2026-10-07T16:00:00+03:00'),Date.parse('2026-10-08T12:00:00+03:00')),'Вчера');
 assert.equal(bulletinAge(secs('2026-10-08T05:00:00+03:00'),Date.parse('2026-10-08T12:00:00+03:00')),'');
 assert.equal(bulletinAge(secs('2026-10-24T23:50:00+03:00'),Date.parse('2026-10-25T23:40:00+02:00')),'Вчера');
 assert.equal(bulletinAge(secs('2026-10-06T16:00:00+03:00'),Date.parse('2026-10-08T12:00:00+03:00')),'2 дн. назад');
 assert.equal(bulletinAge(null),'');
});

test('AI intervals expire only after their end time',()=>{
 const at=Date.parse('2026-10-08T12:00:00+03:00');
 assert.equal(forecastIsCurrent({from:at-1000,to:at-1},at),false);
 assert.equal(forecastIsCurrent({from:at-1000,to:at},at),true);
 assert.equal(forecastIsCurrent({from:at-1000,to:at+1},at),true);
});
test('AI labels use relative Cyprus days and retain local times',()=>{
 const at=Date.parse('2026-10-08T12:00:00+03:00');
 assert.equal(relativeForecastTime(Date.parse('2026-10-07T23:40:00+03:00'),at),'вчера 23:40');
 assert.equal(relativeForecastTime(Date.parse('2026-10-08T11:40:00+03:00'),at),'сегодня 11:40');
 assert.equal(relativeForecastTime(Date.parse('2026-10-09T11:40:00+03:00'),at),'завтра 11:40');
 assert.equal(relativeForecastTime(Date.parse('2026-10-25T23:40:00+02:00'),Date.parse('2026-10-24T23:50:00+03:00')),'завтра 23:40');
});

test('AI range names a shared day once and both days across midnight',()=>{
 const at=Date.parse('2026-10-08T12:00:00+03:00');
 const start=Date.parse('2026-10-08T11:40:00+03:00');
 assert.equal(relativeForecastRange({from:start,to:Date.parse('2026-10-08T15:40:00+03:00')},at),'сегодня 11:40 — 15:40');
 assert.equal(relativeForecastRange({from:start,to:Date.parse('2026-10-09T11:40:00+03:00')},at),'сегодня 11:40 — завтра 11:40');
 assert.equal(relativeForecastRange({from:Date.parse('2026-10-07T23:40:00+03:00'),to:start},at),'вчера 23:40 — сегодня 11:40');
});
