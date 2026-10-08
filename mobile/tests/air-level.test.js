import test from 'node:test';
import assert from 'node:assert/strict';
import {airLevel,airClass,AIR_SCALE} from '../src/air-level.js';
test('all six pollutants follow Cyprus DLI threshold boundaries',()=>{
 for(const [p,[a,b,c]] of Object.entries(AIR_SCALE)){
  assert.equal(airLevel(p,0),'низкий');assert.equal(airLevel(p,a-.01),'низкий');
  assert.equal(airLevel(p,a),'умеренный');assert.equal(airLevel(p,b),'высокий');
  assert.equal(airLevel(p,c),'очень высокий');assert.equal(airLevel(p,null),'Нет данных');
 }
 assert.equal(airLevel('co',1000),'низкий');assert.equal(airLevel('so2',200),'умеренный');
});
test('EAQI uses the six European bands and maps them to the four card colours',()=>{
 assert.equal(airClass('eaqi',10),'air-low');assert.equal(airClass('eaqi',30),'air-low');
 assert.equal(airClass('eaqi',50),'air-moderate');assert.equal(airClass('eaqi',70),'air-high');
 assert.equal(airClass('eaqi',95),'air-very-high');assert.equal(airClass('eaqi',140),'air-very-high');
 assert.equal(airClass('eaqi',null),'air-no-data');
 assert.notEqual(airLevel('eaqi',10),airLevel('eaqi',30));
 assert.equal(airClass('dust',40),'air-low');assert.equal(airClass('dust',120),'air-high');
});
