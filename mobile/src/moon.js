// The Moon as seen from a station: position, phase and the real tilt of the lit side.
// Positions come from Astronomy Engine (VSOP87 / ELP-based, arcsecond-level accuracy),
// topocentric (parallax for the observer) with standard atmospheric refraction.
import {Body,Observer,Equator,Horizon,Illumination,MoonPhase,SiderealTime,SearchRiseSet,SearchMoonPhase,Libration,RotationAxis} from 'astronomy-engine';

// Surface albedo: NASA SVS CGI Moon Kit (LRO LROC WAC), public domain, converted to grey.
const moonMapURL=new URL('./moon-map.jpg',import.meta.url).href;
const RAD=Math.PI/180,DEG=180/Math.PI;
const norm=a=>((a%360)+360)%360;

// Position angle of the Moon's bright limb, from celestial north through east (Meeus 48.5).
export function brightLimbAngle(sunRaDeg,sunDecDeg,moonRaDeg,moonDecDeg){
 const a0=sunRaDeg*RAD,d0=sunDecDeg*RAD,a=moonRaDeg*RAD,d=moonDecDeg*RAD;
 return norm(Math.atan2(Math.cos(d0)*Math.sin(a0-a),Math.sin(d0)*Math.cos(d)-Math.cos(d0)*Math.sin(d)*Math.cos(a0-a))*DEG);
}

// Parallactic angle: how far celestial north at the Moon is turned from the zenith (Meeus 14.1).
export function parallacticAngle(hourAngleDeg,latDeg,decDeg){
 const h=hourAngleDeg*RAD,p=latDeg*RAD,d=decDeg*RAD;
 return Math.atan2(Math.sin(h),Math.tan(p)*Math.cos(d)-Math.sin(d)*Math.cos(h))*DEG;
}

export function moonState(ms,lat,lon,height=0){
 const date=new Date(ms),observer=new Observer(lat,lon,height);
 const moon=Equator(Body.Moon,date,observer,true,true),sun=Equator(Body.Sun,date,observer,true,true);
 const horizon=Horizon(date,observer,moon.ra,moon.dec,'normal');
 const light=Illumination(Body.Moon,date),phase=MoonPhase(date);
 const chi=brightLimbAngle(sun.ra*15,sun.dec,moon.ra*15,moon.dec);
 const q=parallacticAngle(SiderealTime(date)*15+lon-moon.ra*15,lat,moon.dec);
 return {
  elevation:horizon.altitude,azimuth:horizon.azimuth,
  fraction:light.phase_fraction,phaseAngle:light.phase_angle,phase,waxing:phase<180,
  // Bright limb direction on the observer's sky, from the zenith towards the east (left).
  limbAngle:norm(chi-q),
  // The Moon's north pole on the observer's sky (same convention), and the sub-Earth point
  // (optical libration): which face of the Moon is turned to us and how it is tilted.
  axisAngle:norm(axisPositionAngle(date,observer)-q),
  ...subEarth(date),
  distanceKm:moon.dist*149597870.7,
  age:phase/360*29.530588,
 };
}

function axisPositionAngle(date,observer){
 const pole=RotationAxis(Body.Moon,date),moon=Equator(Body.Moon,date,observer,false,true);
 return brightLimbAngle(pole.ra*15,pole.dec,moon.ra*15,moon.dec);
}
function subEarth(date){
 const l=Libration(date);
 return {libLat:l.elat,libLon:l.elon};
}

export function moonPosition(ms,lat,lon){
 const date=new Date(ms),observer=new Observer(lat,lon,0);
 const moon=Equator(Body.Moon,date,observer,true,true);
 const horizon=Horizon(date,observer,moon.ra,moon.dec,'normal');
 return {elevation:horizon.altitude,azimuth:horizon.azimuth};
}

// Moonrise and moonset on the local (Cyprus) calendar day of ms, like sunrise and sunset;
// null when the Moon does not rise or set that day (it happens once a month: the Moon
// rises about 50 minutes later every day).
const dayOf=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Asia/Nicosia'});
export function moonTimes(ms,lat,lon){
 const observer=new Observer(lat,lon,0),day=dayOf(ms);
 const find=direction=>{
  let from=ms-36*3600e3;
  for(let i=0;i<4;i++){
   const t=SearchRiseSet(Body.Moon,observer,direction,new Date(from),3)?.date.getTime();
   if(t==null)return null;
   const d=dayOf(t);
   if(d===day)return t;
   if(d>day)return null;
   from=t+60e3;
  }
  return null;
 };
 return {rise:find(+1),set:find(-1)};
}

// Upcoming new moon and full moon.
export function nextPhases(ms){
 const at=phase=>SearchMoonPhase(phase,new Date(ms),40)?.date.getTime()??null;
 return {newMoon:at(0),fullMoon:at(180)};
}

// One of eight phase names from the Sun-Moon elongation (0 new, 90 first quarter, 180 full).
export function phaseKey(phase){
 return ['new','waxingCrescent','firstQuarter','waxingGibbous','full','waningGibbous','lastQuarter','waningCrescent'][Math.floor(norm(phase+22.5)/45)%8];
}

// The lit part of a unit disk whose bright limb points to +x, for a phase angle in degrees
// (0 full, 90 half, 180 new). The terminator is a half-ellipse with semi-axis |cos i|.
export function litPath(phaseAngle,r=1){
 const c=Math.cos(phaseAngle*RAD),rx=Math.abs(c)*r;
 if(c>=0.9999)return `M0,${-r}A${r},${r} 0 1 1 0,${r}A${r},${r} 0 1 1 0,${-r}Z`;
 return `M0,${-r}A${r},${r} 0 0 1 0,${r}A${rx.toFixed(4)},${r} 0 0 ${c>0?1:0} 0,${-r}Z`;
}

// Screen rotation (SVG, degrees clockwise) that turns +x to the bright limb direction, with
// the zenith up and east to the left, as the Moon looks to someone facing it.
export function screenRotation(limbAngle){
 return norm(Math.atan2(-Math.cos(limbAngle*RAD),-Math.sin(limbAngle*RAD))*DEG);
}

// Lunar-Lambert reflectance (McEwen 1991): the Moon is not a matte ball. Brightness falls to
// zero at the terminator, so near it the lit side is dim and on a bright sky the Moon looks
// thinner than its lit area. L(alpha) blends Lommel-Seeliger (flat disk at full) and Lambert.
export function lunarLambert(mu0,mu,phaseAngle){
 if(mu0<=0)return 0;
 const a=phaseAngle,L=Math.max(0,Math.min(1,1-0.019*a+2.42e-4*a*a-1.46e-6*a*a*a));
 return 2*L*mu0/(mu0+mu)+(1-L)*mu0;
}

// The Moon as it looks to the observer, as RGBA on an n x n grid (screen axes: x right, y down,
// zenith up, east left): lunar-Lambert lighting from the Sun's direction (phase angle, bright
// limb) times the surface albedo map turned to the observer (pole direction, libration).
// The brightest point is full white, sRGB-encoded like a photograph; 2x2 supersampling.
// albedo: {w,h,data} grey equirectangular map, longitude 0 in the middle; null = uniform.
const SUPER=[0.25,0.75];
export function moonImage(state,n,albedo=null){
 const a=state.phaseAngle*RAD,L=state.limbAngle*RAD,N=state.axisAngle*RAD;
 const sun=[Math.sin(a)*-Math.sin(L),Math.sin(a)*-Math.cos(L),Math.cos(a)];
 const b=(state.libLat||0)*RAD,cb=Math.cos(b),sb=Math.sin(b);
 const pole=[cb*-Math.sin(N),cb*-Math.cos(N),sb];
 const e0=[-sb*pole[0]/cb,-sb*pole[1]/cb,(1-sb*pole[2])/cb];             // sub-Earth meridian
 const e90=[e0[1]*pole[2]-e0[2]*pole[1],e0[2]*pole[0]-e0[0]*pole[2],e0[0]*pole[1]-e0[1]*pole[0]];
 const l0=(state.libLon||0)*RAD;
 const out=new Float32Array(n*n),cover=new Float32Array(n*n);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  let v=0,c=0;
  for(const dy of SUPER)for(const dx of SUPER){
   const x=(i+dx)/n*2-1,y=(j+dy)/n*2-1,rr=x*x+y*y;
   if(rr>=1)continue;
   const z=Math.sqrt(1-rr);c+=0.25;
   const mu0=x*sun[0]+y*sun[1]+z*sun[2];
   if(mu0<=0)continue;
   let alb=1;
   if(albedo){
    const lat=Math.asin(Math.max(-1,Math.min(1,x*pole[0]+y*pole[1]+z*pole[2])));
    const lon=l0+Math.atan2(x*e90[0]+y*e90[1]+z*e90[2],x*e0[0]+y*e0[1]+z*e0[2]);
    const u=Math.floor(((lon/(2*Math.PI)+0.5)%1+1)%1*albedo.w),w=Math.min(albedo.h-1,Math.floor((0.5-lat/Math.PI)*albedo.h));
    alb=albedo.data[w*albedo.w+u]/255;
   }
   v+=alb*lunarLambert(mu0,z,state.phaseAngle)/4;
  }
  out[j*n+i]=v;cover[j*n+i]=c;
 }
 const sorted=Float32Array.from(out).sort(),top=sorted[Math.floor(sorted.length*0.998)]||1;
 const srgb=v=>v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055;
 const rgba=new Uint8ClampedArray(4*n*n);
 for(let k=0;k<n*n;k++){
  const g=srgb(Math.min(1,out[k]/top));
  // Lit surface over the dark disk: opaque where the Sun lights it, see-through on the night side.
  rgba[4*k]=Math.round(250*g);rgba[4*k+1]=Math.round(246*g);rgba[4*k+2]=Math.round(234*g);
  rgba[4*k+3]=Math.round(255*cover[k]*Math.min(1,g*4));
 }
 return rgba;
}

let albedoMap=null,albedoLoading=null;
function loadAlbedo(){
 if(albedoMap||albedoLoading||typeof Image==='undefined')return;
 albedoLoading=new Promise(resolve=>{
  const img=new Image();
  img.onload=()=>{
   try{
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const d=ctx.getImageData(0,0,c.width,c.height).data,data=new Uint8Array(c.width*c.height);
    for(let k=0;k<data.length;k++)data[k]=d[4*k];
    albedoMap={w:c.width,h:c.height,data};
    for(const el of document.querySelectorAll('image[data-moon]'))el.setAttribute('href',moonURL(JSON.parse(el.dataset.moon),+el.dataset.px));
   }catch{}
   resolve();
  };
  img.onerror=()=>resolve();
  img.src=moonMapURL;
 });
}

const imageCache=new Map();
function moonURL(state,px){
 const key=[state.phaseAngle,state.limbAngle,state.axisAngle,state.libLat,state.libLon].map(v=>(+v||0).toFixed(1)).join()+`:${px}:${albedoMap?1:0}`;
 if(imageCache.has(key))return imageCache.get(key);
 let url=null;
 try{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=px;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(px,px);
  img.data.set(moonImage(state,px,albedoMap));ctx.putImageData(img,0,0);
  url=canvas.toDataURL('image/png');
 }catch{url=null}
 if(imageCache.size>20)imageCache.clear();
 imageCache.set(key,url);
 return url;
}

export function moonSVG(state,size=120,label=''){
 const r=size/2-2,px=Math.round(2*r*Math.min(3,Math.max(1,globalThis.devicePixelRatio||2)));
 const keep={phaseAngle:state.phaseAngle,limbAngle:state.limbAngle,axisAngle:state.axisAngle,libLat:state.libLat,libLon:state.libLon};
 let lit;
 if(typeof document==='undefined')lit=`<g transform="rotate(${screenRotation(state.limbAngle).toFixed(1)})"><path d="${litPath(state.phaseAngle,r)}" fill="#f6f1e2"/></g>`;
 else{
  loadAlbedo();
  lit=`<image data-moon='${JSON.stringify(keep)}' data-px="${px}" href="${moonURL(keep,px)}" x="${-r}" y="${-r}" width="${2*r}" height="${2*r}"/>`;
 }
 return `<svg class="moon-disk" viewBox="${-size/2} ${-size/2} ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${label}">`
  +`<circle r="${r}" fill="var(--moon-dark)"/>${lit}`
  +`<circle r="${r}" fill="none" stroke="var(--border)" stroke-width="1"/></svg>`;
}
