import test from 'node:test';
import assert from 'node:assert/strict';
import {geoidHeight,gpsElevation,MAX_VERTICAL_ERROR} from '../src/elevation.js';
test('EGM2008 geoid height follows the PROJ values across Cyprus',()=>{
 // Point values from PROJ: Nicosia 28.1 m, Limassol 22.9 m, Larnaca 25.6 m.
 assert.ok(Math.abs(geoidHeight(35.17,33.36)-28.1)<1);
 assert.ok(Math.abs(geoidHeight(34.68,33.04)-22.9)<1.5);
 assert.ok(Math.abs(geoidHeight(34.92,33.63)-25.6)<1);
 assert.equal(geoidHeight(10,0),geoidHeight(34.5,32.25));
});
test('GPS altitude becomes sea-level elevation only for a precise vertical fix',()=>{
 const fix={latitude:35.17,longitude:33.36,altitude:180,altitudeAccuracy:8};
 assert.equal(gpsElevation(fix),Math.round(180-geoidHeight(35.17,33.36)));
 assert.equal(gpsElevation({...fix,altitudeAccuracy:MAX_VERTICAL_ERROR+1}),null);
 assert.equal(gpsElevation({...fix,altitudeAccuracy:null}),null);
 assert.equal(gpsElevation({...fix,altitude:null}),null);
 assert.equal(gpsElevation(null),null);
});
