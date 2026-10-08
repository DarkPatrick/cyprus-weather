import test from 'node:test';
import assert from 'node:assert/strict';
import {airLevel,AIR_SCALE} from '../src/air-level.js';
test('all six pollutants follow Cyprus DLI threshold boundaries',()=>{
 for(const [p,[a,b,c]] of Object.entries(AIR_SCALE)){
  assert.equal(airLevel(p,0),'низкий');assert.equal(airLevel(p,a-.01),'низкий');
  assert.equal(airLevel(p,a),'умеренный');assert.equal(airLevel(p,b),'высокий');
  assert.equal(airLevel(p,c),'очень высокий');assert.equal(airLevel(p,null),'Нет данных');
 }
 assert.equal(airLevel('co',1000),'низкий');assert.equal(airLevel('so2',200),'умеренный');
});
