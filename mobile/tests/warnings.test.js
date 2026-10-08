import test from 'node:test';
import assert from 'node:assert/strict';
import {warningItems,warningsHTML} from '../src/warnings.js';
import {setLanguage} from '../src/i18n.js';
const now=10000;
const alert=(id,level,onset,expires=20000)=>({identifier:id,level,onset,expires,type:3,description:'Thunderstorms expected.',msg_type:'Alert'});
test('warnings put active before upcoming, then severity, and remove expired/cancelled/replaced',()=>{
 const items=warningItems({alerts:[alert('future',4,11000),alert('yellow',2,9000),alert('red',4,9500),alert('expired',4,1,now),{...alert('cancel',4,1),msg_type:'Cancel'},alert('old',4,1),{...alert('new',3,1),refs:'old'}]},now);
 assert.deepEqual(items.map(a=>a.identifier),['red','new','yellow','future']);
});
test('department fallback avoids duplicates; marine NIL and expired forecasts stay hidden',()=>{
 assert.equal(warningItems({alerts:[alert('one',2,1)],warnings:{text:'Greek warning'},forecast:{warnings:' NIL ',valid_to:20000}},now).length,1);
 assert.equal(warningItems({warnings:{has_warning:false,text:'translated none'},forecast:{has_warning:true,warnings:'Danger',valid_to:now}},now).length,0);
 assert.deepEqual(warningItems({warnings:{has_warning:true,text:null},forecast:{has_warning:true,warnings:null,valid_to:20000}},now).map(a=>a.kind),['department','marine']);
});
test('banner is collapsed, localized, escapes source text and retains a separately marked Greek original',()=>{
 for(const language of ['ru','en','el']){
  setLanguage(language,{persist:false});
  const html=warningsHTML([{...alert('one',3,9000),kind:'weather',description:'<script>alert(1)</script>',description_el:'Καταιγίδες.'}],now);
  assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('warnings.type'));assert(!html.includes(' open'));
  assert.equal(html.includes('lang="el"'),language!=='el');
 }
 assert.equal(warningsHTML([]),'');setLanguage('ru',{persist:false});
});
