import test from 'node:test';
import assert from 'node:assert/strict';
import {windStrength,pressureIndicator,uvLevel,todayUvMaximum} from '../src/weather-labels.js';
test('Beaufort labels match the original thresholds and missing is not calm',()=>{
 assert.equal(windStrength(null),'');assert.equal(windStrength(-1),'');assert.equal(windStrength(NaN),'');
 assert.equal(windStrength(0),'штиль (0 баллов)');assert.equal(windStrength(.3),'тихий (1 балл)');
 assert.equal(windStrength(1.6),'лёгкий (2 балла)');assert.equal(windStrength(3.4),'слабый (3 балла)');
 assert.equal(windStrength(8),'свежий (5 баллов)');assert.equal(windStrength(32.7),'ураган (12 баллов)');
});
test('Pressure arrows represent sea-level high/low, not elevation or a time trend',()=>{
 const p=value=>({value,target_height:0});
 assert.equal(pressureIndicator(p(1008.9)).symbol,'↓');assert.equal(pressureIndicator(p(1009)),null);
 assert.equal(pressureIndicator(p(1016.9)),null);assert.equal(pressureIndicator(p(1017)).symbol,'↑');
 assert.equal(pressureIndicator(null),null);assert.equal(pressureIndicator({value:900}),null);
 const hill={value:1013*Math.exp(-9.80665*1500/(287.05*288.15)),target_height:1500};
 assert.equal(pressureIndicator(hill),null);
 assert.equal(pressureIndicator({value:900,source_kind:'qnh',source_pressure:1020}).symbol,'↑');
});

test('UV maximum is the Cyprus calendar day, including past and forecast hours',()=>{
 const at=Date.parse('2026-10-08T22:30:00+03:00');
 const data={ts:['2026-10-07T20:59:00Z','2026-10-08T09:00:00Z','2026-10-08T21:00:00Z'].map(x=>Date.parse(x)/1000),uv:[99,5.3,88]};
 assert.deepEqual(todayUvMaximum(data,at),{value:5.3,at:Date.parse('2026-10-08T09:00:00Z')});
 assert.equal(todayUvMaximum({ts:[],uv:[]},at),null);
 assert.equal(todayUvMaximum({ts:[at/1000],uv:[null]},at),null);
 assert.equal(todayUvMaximum({ts:[at/1000],uv:[0]},at).value,0);
 const morning=Date.parse('2026-10-08T07:00:00+03:00');assert(todayUvMaximum(data,morning).at>morning);
});
test('UV levels match original boundaries and day selection survives Cyprus DST',()=>{
 assert.equal(uvLevel(2.9),'низкий');assert.equal(uvLevel(3),'умеренный');assert.equal(uvLevel(6),'высокий');assert.equal(uvLevel(8),'очень высокий');assert.equal(uvLevel(11),'экстремальный');assert.equal(uvLevel(null),'нет данных');
 const at=Date.parse('2026-10-25T23:30:00+02:00'),early=Date.parse('2026-10-25T00:30:00+03:00');
 assert.equal(todayUvMaximum({ts:[early/1000,at/1000],uv:[5,0]},at).at,early);
});
