import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../src/i18n.js';
import {stationName,sourceKind,airStation,contentText,climatePeriod} from '../src/content-labels.js';
test('public content labels localize places and enums without leaking another language',()=>{
 try{
  setLanguage('en',{persist:false});assert.equal(stationName('AGROS'),'Agros');
  assert.equal(sourceKind('транспортная'),'traffic monitoring');assert.equal(airStation({code:'LARTRA'}),'Larnaca');
  assert.match(contentText({el:'Αίθριος',ru:'Ясно'}),/^Translation/);
  assert.equal(contentText({text:'Clear skies.'}),'Clear skies.');
  setLanguage('ru',{persist:false});assert.equal(contentText({text:null,ru:'Legacy translation'}),'Перевод готовится…');
  setLanguage('en',{persist:false});
  assert(climatePeriod('2026-09..11').includes('November'));
  assert(climatePeriod('2026-12..02').includes('2027'));
  setLanguage('el',{persist:false});assert.equal(stationName('AGROS'),'Αγρός');assert.equal(contentText({el:'Αίθριος'}),'Αίθριος');
 }finally{setLanguage('ru',{persist:false});}
});
