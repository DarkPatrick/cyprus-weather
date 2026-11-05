// The Moon as seen from a station: position, phase and the real tilt of the lit side.
// Positions come from Astronomy Engine (VSOP87 / ELP-based, arcsecond-level accuracy),
// topocentric (parallax for the observer) with standard atmospheric refraction.
import {Body,Observer,Equator,Horizon,Illumination,MoonPhase,SiderealTime,SearchRiseSet,SearchMoonPhase} from 'astronomy-engine';

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
  distanceKm:moon.dist*149597870.7,
  age:phase/360*29.530588,
 };
}

export function moonPosition(ms,lat,lon){
 const date=new Date(ms),observer=new Observer(lat,lon,0);
 const moon=Equator(Body.Moon,date,observer,true,true);
 const horizon=Horizon(date,observer,moon.ra,moon.dec,'normal');
 return {elevation:horizon.altitude,azimuth:horizon.azimuth};
}

// The next moonrise and moonset after ms (either may be more than a day away: the Moon
// rises about 50 minutes later every day and skips one rise or set a month).
export function moonTimes(ms,lat,lon){
 const observer=new Observer(lat,lon,0),from=new Date(ms);
 const next=direction=>SearchRiseSet(Body.Moon,observer,direction,from,2)?.date.getTime()??null;
 return {rise:next(+1),set:next(-1)};
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

export function moonSVG(state,size=120,label=''){
 const r=size/2-2,rot=screenRotation(state.limbAngle).toFixed(1);
 return `<svg class="moon-disk" viewBox="${-size/2} ${-size/2} ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${label}">`
  +`<defs><radialGradient id="moonlit" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fbf8ef"/><stop offset=".75" stop-color="#e6e0cf"/><stop offset="1" stop-color="#c9c1ac"/></radialGradient></defs>`
  +`<circle r="${r}" fill="var(--moon-dark)"/>`
  +`<g transform="rotate(${rot})"><path d="${litPath(state.phaseAngle,r)}" fill="url(#moonlit)"/></g>`
  +`<circle r="${r}" fill="none" stroke="var(--border)" stroke-width="1"/></svg>`;
}
