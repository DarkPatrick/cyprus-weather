import test from 'node:test';
import assert from 'node:assert/strict';
import {tempColor,labelFits,windArrow} from '../src/map-style.js';
test('temperature colors retain source scale and distinguish missing readings',()=>{
 assert.equal(tempColor(0).bg,'rgb(59,111,212)');assert.equal(tempColor(36).bg,'rgb(194,45,45)');
 assert.equal(tempColor(-5).bg,tempColor(0).bg);assert.notEqual(tempColor(null).bg,tempColor(20).bg);
});
test('temperature labels only appear at close zoom without colliding',()=>{
 const a={code:'A',x:100,y:100},near={code:'B',x:120,y:115},far={code:'B',x:145,y:100};
 assert.equal(labelFits(a,[a,far],9),false);assert.equal(labelFits(a,[a,near],12),false);
 assert.equal(labelFits(a,[a,far],10),true);
});
test('wind arrows point downwind and absent wind stays absent',()=>{
 assert.equal(windArrow({wind10:2}), '');assert.equal(windArrow({wdir:90,wind10:0}), '');
 assert(windArrow({wdir:90,wind10:3}).includes('rotate(270deg)'));
});
