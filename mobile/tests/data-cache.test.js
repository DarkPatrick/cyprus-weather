import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedLoader,DATA_TTL,FAILURE_TTL} from '../src/data-cache.js';
test('weather data reuses concurrent and rolling-window requests for ten minutes',async()=>{
 let at=0,calls=0;
 const load=cachedLoader(async path=>({path,request:++calls}),{clock:()=>at});
 const a=load('weather/readings?station=A&from=0&to=100&agg=hour');
 const b=load('weather/readings?to=200&from=100&agg=hour&station=A');
 assert.equal(a,b);assert.equal((await a).request,1);
 at=DATA_TTL-1;await load('weather/readings?station=A&from=100&to=200&agg=hour');assert.equal(calls,1);
 at=DATA_TTL;await load('weather/readings?station=A&from=200&to=300&agg=hour');assert.equal(calls,2);
 await load('weather/readings?station=B&from=200&to=300&agg=hour');assert.equal(calls,3);
});
test('failed requests are throttled briefly, then retried',async()=>{
 let at=0,calls=0;
 const load=cachedLoader(async()=>{calls++;throw Error('unavailable');},{clock:()=>at});
 await assert.rejects(load('weather/forecast'));await assert.rejects(load('weather/forecast'));assert.equal(calls,1);
 at=FAILURE_TTL-1;await assert.rejects(load('weather/forecast'));assert.equal(calls,1);
 at=FAILURE_TTL;await assert.rejects(load('weather/forecast'));assert.equal(calls,2);
 assert.ok(FAILURE_TTL<DATA_TTL);
});
