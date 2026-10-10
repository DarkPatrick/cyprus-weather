import test from 'node:test';
import assert from 'node:assert/strict';
import {sunPhase} from '../src/sun.js';
test('sun phase follows the chart band boundaries',()=>{
 assert.equal(sunPhase(-60),'night');assert.equal(sunPhase(-15),'astronomical');
 assert.equal(sunPhase(-8),'nautical');assert.equal(sunPhase(-3),'civil');
 assert.equal(sunPhase(2),'low');assert.equal(sunPhase(45),'day');assert.equal(sunPhase(NaN),'night');
});
