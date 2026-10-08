import test from 'node:test';
import assert from 'node:assert/strict';
import {anonymousId,visitTracker,SESSION_GAP} from '../src/visits.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('anonymous id is a v4 UUID created once and reused',()=>{
 const storage=memory(),id=anonymousId(storage);
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(anonymousId(storage),id);
 storage.setItem('anonymous_id','garbage');assert.notEqual(anonymousId(storage),'garbage');
 assert.equal(anonymousId({getItem(){throw Error('blocked');}}),null);
});
test('an open is sent at start and after a long background, not for short switches',()=>{
 let at=0,sent=0;
 const tracker=visitTracker(()=>sent++,{clock:()=>at});
 tracker.open();assert.equal(sent,1);
 tracker.hide();at=SESSION_GAP-1;tracker.show();assert.equal(sent,1);
 tracker.hide();tracker.hide();at+=SESSION_GAP;tracker.show();tracker.show();assert.equal(sent,2);
});
