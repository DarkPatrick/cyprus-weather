import test from 'node:test';
import assert from 'node:assert/strict';
import {shrinkScale,bindImageShrink} from '../src/image-shrink.js';
test('large-image preview shrinks to fit but never enlarges the original size',()=>{
 assert.equal(shrinkScale(50,100,390,780,1170,2340),.5);
 assert.equal(shrinkScale(1,100,390,780,1170,2340),1/3);
 assert.equal(shrinkScale(200,100,390,780,1170,2340),1);
 assert.equal(shrinkScale(1,100,390,762,1326,915),390/1326);
});

test('two-finger preview returns to full size without changing pan position',()=>{
 const listeners={},classes=new Set();
 const view={clientWidth:390,clientHeight:780,scrollLeft:300,scrollTop:500,
  addEventListener:(name,fn)=>{listeners[name]=fn;},
  getBoundingClientRect:()=>({left:0,top:80}),
  classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
 const img={offsetWidth:1170,offsetHeight:2340,style:{}};
 bindImageShrink(view,img);
 let prevented=0;
 const event=touches=>({touches,preventDefault:()=>prevented++});
 listeners.touchstart(event([{clientX:100,clientY:200},{clientX:300,clientY:200}]));
 listeners.touchmove(event([{clientX:150,clientY:200},{clientX:250,clientY:200}]));
 assert.equal(img.style.transform,'scale(0.5)');
 assert.equal(img.style.transformOrigin,'500px 620px');
 assert.ok(classes.has('shrinking'));
 assert.equal(prevented,2);
 listeners.touchend(event([]));
 assert.equal(img.style.transform,'');
 assert.ok(!classes.has('shrinking'));
 assert.equal(view.scrollLeft,300);
 assert.equal(view.scrollTop,500);
});
