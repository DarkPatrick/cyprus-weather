export function shrinkScale(distance,initialDistance,viewWidth,viewHeight,imageWidth,imageHeight){
 const fit=Math.min(1,viewWidth/imageWidth,viewHeight/imageHeight);
 return Math.min(1,Math.max(fit,distance/Math.max(1,initialDistance)));
}
const pair=touches=>({distance:Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY),x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2});
export function bindImageShrink(view,img){
 let start=null,wheelScale=1,resetTimer=null;
 const reset=()=>{start=null;wheelScale=1;view.classList.remove('shrinking');img.style.transform='';};
 const origin=(x,y)=>{const r=view.getBoundingClientRect();img.style.transformOrigin=`${view.scrollLeft+x-r.left}px ${view.scrollTop+y-r.top}px`;};
 const scale=ratio=>shrinkScale(ratio,1,view.clientWidth,view.clientHeight,img.offsetWidth,img.offsetHeight);
 view.addEventListener('touchstart',e=>{
  if(e.touches.length!==2||!img.offsetWidth)return;
  e.preventDefault();clearTimeout(resetTimer);start=pair(e.touches);origin(start.x,start.y);view.classList.add('shrinking');
 },{passive:false});
 view.addEventListener('touchmove',e=>{
  if(!start||e.touches.length<2)return;
  e.preventDefault();img.style.transform=`scale(${scale(pair(e.touches).distance/Math.max(1,start.distance))})`;
 },{passive:false});
 view.addEventListener('touchend',e=>{if(e.touches.length<2)reset();});
 view.addEventListener('touchcancel',reset);
 view.addEventListener('wheel',e=>{
  if(!e.ctrlKey||!img.offsetWidth)return;
  e.preventDefault();clearTimeout(resetTimer);if(wheelScale===1)origin(e.clientX,e.clientY);
  wheelScale=scale(wheelScale*Math.exp(-e.deltaY*.01));view.classList.add('shrinking');img.style.transform=`scale(${wheelScale})`;
  resetTimer=setTimeout(reset,220);
 },{passive:false});
}
