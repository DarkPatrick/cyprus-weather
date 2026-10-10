import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionView} from '../src/conditions.js';
import en from '../src/locales/en.js';
test('every condition code has an icon, a label and a source label',()=>{
 for(const code of ['clear','partly_cloudy','cloudy','overcast','rain_light','rain_moderate','rain_heavy','thunderstorm','fog','dust']){
  const v=conditionView({code,source:'model',night:false});
  assert.ok(v.icon&&en[v.key]&&en[v.source],code);
 }
 assert.equal(conditionView({code:'clear',night:true,source:'measured'}).icon,'🌙');
 assert.equal(conditionView(null),null);assert.equal(conditionView({code:'unknown'}),null);
});
