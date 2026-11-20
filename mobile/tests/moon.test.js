import test from 'node:test';
import assert from 'node:assert/strict';
import {brightLimbAngle,parallacticAngle,moonState,moonTimes,nextPhases,phaseKey,litPath,screenRotation,moonImage,lunarLambert} from '../src/moon.js';

test('bright limb position angle matches Meeus example 48.a (1992-04-12)',()=>{
 assert.ok(Math.abs(brightLimbAngle(20.6579,8.6964,134.6885,13.7684)-285.0)<0.1);
});
test('parallactic angle is zero on the meridian and turns with the hour angle',()=>{
 assert.equal(Math.round(parallacticAngle(0,34.7,10)),0);
 assert.ok(parallacticAngle(30,34.7,10)>0&&parallacticAngle(-30,34.7,10)<0);
});
test('an evening crescent over Limassol shows its lit side down and to the right, towards the set Sun',()=>{
 const s=moonState(Date.UTC(2026,10,14,15,30),34.68,33.04);
 assert.ok(s.waxing&&s.fraction>0.2&&s.fraction<0.3&&s.elevation>20);
 assert.ok(s.limbAngle>200&&s.limbAngle<260,String(s.limbAngle));  // between down (180) and right (270)
 assert.equal(phaseKey(s.phase),'waxingCrescent');
 assert.ok(s.distanceKm>356000&&s.distanceKm<407000);
});
test('moonrise and moonset fall on the local day asked; the next phases come after it',()=>{
 const t=Date.UTC(2026,10,5,12),times=moonTimes(t,34.68,33.04),next=nextPhases(t);
 const day=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Asia/Nicosia'});
 assert.equal(day(times.rise),'2026-11-05');assert.equal(day(times.set),'2026-11-05');
 // A day without a moonrise or moonset gives null rather than the next day's event.
 const missing=Array.from({length:31},(_,i)=>moonTimes(Date.UTC(2026,10,1+i,10),34.68,33.04)).filter(x=>x.rise==null||x.set==null);
 assert.ok(missing.length>=1&&missing.length<=3);
 assert.ok(next.newMoon>t&&next.fullMoon>next.newMoon&&next.fullMoon-t<30*86400e3);
});
test('lit shape and screen rotation',()=>{
 assert.match(litPath(0),/A1,1 0 1 1/);            // full: whole disk
 assert.match(litPath(90),/A0.0000,1 0 0 [01] 0,-1Z$/);  // quarter: straight terminator
 assert.match(litPath(60),/ 0 0 1 0,-1Z$/);          // gibbous: terminator bulges to the dark side
 assert.match(litPath(120),/ 0 0 0 0,-1Z$/);         // crescent
 assert.equal(Math.round(screenRotation(0)),270);    // lit limb up
 assert.equal(Math.round(screenRotation(90)),180);   // towards the east = left
 assert.equal(Math.round(screenRotation(270)),0);    // towards the west = right
});
test('shading: full Moon is nearly flat, the terminator fades to nothing',()=>{
 const n=40,row=(phaseAngle)=>{const s=moonImage({phaseAngle,limbAngle:270,axisAngle:0},n);return Array.from({length:n},(_,i)=>s[4*((n/2)*n+i)]);};
 const full=row(0);assert.ok(full[n/2]>=245&&full[3]>150);           // limb barely darker at full
 const half=row(90);assert.equal(half[n/2-2],0);assert.ok(half[n/2+1]<120&&half[n-3]>200);  // lit limb to the west = right
 assert.ok(lunarLambert(0.5,0.5,0)>lunarLambert(0.5,0.5,90)*0.9);
});
