import test from 'node:test';
import assert from 'node:assert/strict';
import {sunPosition,sunTimes,sunWindow,HOUR} from '../src/sun.js';
import {points,latest,stress,stressClass,mapReading,POLLUTANTS,rollingWindow,windDirection} from '../src/series.js';

test('Cyprus solar times use the Cyprus date regardless of process timezone',()=>{
 const at=Date.parse('2026-10-07T21:10:00Z');const s=sunTimes(at,34.68,33.04);
 assert.equal(new Date(s.rise).toISOString().slice(0,10),'2026-10-08');
 assert(s.rise<s.noon&&s.noon<s.set);
 assert(sunPosition(Date.parse('2026-10-08T10:00:00Z'),34.68,33.04).elevation>40);
});
test('sun chart has the nearest extremum centered with equal halves',()=>{
 const at=Date.parse('2026-10-07T21:10:00Z');const w=sunWindow(at,34.68,33.04);
 assert.equal(w.center.time-w.from,12*HOUR);assert.equal(w.to-w.center.time,12*HOUR);
 assert(Math.abs(w.center.time-at)<7*HOUR);
});
test('no-stress range is silent and stale values stay missing',()=>{
 assert.equal(stress(20),'');assert(stress(35).includes('тепловой'));
 assert.equal(latest({ts:[0],pm25:[12]},'pm25',7200),null);
 assert.equal(mapReading({ts:[0],temp:[20]},7200),null);
 assert.equal(POLLUTANTS.length,6);
});
test('series keep missing values and restrict the window',()=>{
 assert.deepEqual(points({ts:[1,2,3],x:[0,null,5]},'x',1000,2000),[[1000,0],[2000,null]]);
});

test('missing hourly buckets do not draw an interpolated line',()=>{
 assert.deepEqual(points({ts:[3600,14400],x:[20,30]},'x'),[[3600000,20],[7200000,null],[14400000,30]]);
});

test('history is a full rolling day across midnight and Cyprus daylight saving',()=>{
 for(const iso of ['2026-10-08T00:05:00+03:00','2026-10-25T12:05:00+02:00']){
  const at=Date.parse(iso),w=rollingWindow(at);
  assert.equal(at-w.from,24*HOUR);assert.equal(w.to-at,24*HOUR);
  const data={ts:[(w.from-1)/1000,w.from/1000,(at-23*HOUR)/1000],x:[1,2,3]};
  assert.deepEqual(points(data,'x',w.from,at).filter(p=>p[1]!=null).map(p=>p[1]),[2,3]);
 }
});

test('wind directions wrap north and retain compass sectors',()=>{
 assert.equal(windDirection(0),'С');assert.equal(windDirection(360),'С');assert.equal(windDirection(-15),'ССЗ');
 assert.equal(windDirection(90),'В');assert.equal(windDirection(225),'ЮЗ');assert.equal(windDirection(null),'');
});

test('UTCI colors preserve missing, neutral and heat/cold boundaries',()=>{
 assert.equal(stressClass(null),'stress-missing');assert.equal(stressClass(NaN),'stress-missing');
 assert.equal(stressClass(9),'stress-none');assert.equal(stressClass(26),'stress-none');
 assert.equal(stressClass(26.1),'stress-moderate');assert.equal(stressClass(32),'stress-moderate');
 assert.equal(stressClass(32.1),'stress-high');assert.equal(stressClass(38.1),'stress-very-high');
 assert.equal(stressClass(46.1),'stress-extreme');assert.equal(stressClass(0),'stress-cool');
 assert.equal(stressClass(-13),'stress-cold');assert.equal(stressClass(-14),'stress-very-cold');
});
