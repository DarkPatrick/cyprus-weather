import test from 'node:test';
import assert from 'node:assert/strict';
import {chartBands,chartLevel,levelView} from '../src/chart-levels.js';
test('chart levels match air, Beaufort, UTCI and UV boundaries',()=>{
 assert.equal(chartLevel('pm25',25),'умеренный');assert.equal(chartLevel('co',20000),'очень высокий');
 assert.equal(chartLevel('wind10',3.4),'3 · слабый');assert.equal(chartLevel('utci_shade',26),'умеренный тепловой');
 assert.equal(chartLevel('radiation',6),'высокий');assert.deepEqual(chartBands('net'),[]);
});
test('pressure level thresholds follow target elevation instead of labelling mountains low',()=>{
 const b=chartBands('p_station',1500);const normal=(b[3].from+b[3].to)/2;
 assert.equal(chartLevel('p_station',normal,1500),'норма');assert.deepEqual(chartBands('p_station',null),[]);
});
test('bands fit observed values and clip negative or infinite ends',()=>{
 const view=levelView('utci_shade',[-2,34]);assert(view.min<0);assert(view.max>34);
 assert(view.bands.every(b=>Number.isFinite(b.from)&&Number.isFinite(b.to)));
 assert.equal(levelView('pm25',[null]),null);assert.equal(levelView('pm25',[10]).legend.length,4);
});
