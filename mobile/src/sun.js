  const RAD = Math.PI / 180;
export function sunPosition(ms, lat, lon) {
    const d = ms / 864e5 - 0.5 + 2440588 - 2451545;          // days since J2000
    const M = RAD * (357.5291 + 0.98560028 * d);              // mean anomaly
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;               // ecliptic longitude
    const e = RAD * 23.4397;                                  // obliquity
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra; // hour angle
    const phi = RAD * lat;
    const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
    const azimuth = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180) % 360;
    return { elevation, azimuth };
  }

export const HOUR=3600000;
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'});
const localDate=ms=>dayFormatter.format(new Date(ms));
const timesCache=new Map();
export function sunTimes(ms,lat,lon){
  const day=localDate(ms),key=`${day}:${lat}:${lon}`;
  if(timesCache.has(key))return timesCache.get(key);
  let rise=null,set=null,noon=null,best=-91;
  const start=Math.floor((ms-36*HOUR)/60000)*60000;
  let prev=sunPosition(start,lat,lon).elevation;
  for(let t=start+60000;t<=ms+36*HOUR;t+=60000){
    const el=sunPosition(t,lat,lon).elevation;
    if(localDate(t)===day){
      if(prev<-.833&&el>=-.833)rise=t;
      if(prev>=-.833&&el<-.833)set=t;
      if(el>best){best=el;noon=t;}
    }
    prev=el;
  }
  const result={rise,set,noon,maxElevation:best};
  if(timesCache.size>100)timesCache.clear();
  timesCache.set(key,result);return result;
}
export function sunWindow(ms,lat,lon){
  let extrema=[]; const start=Math.floor((ms-18*HOUR)/60000)*60000;
  let a=sunPosition(start,lat,lon).elevation,b=sunPosition(start+60000,lat,lon).elevation;
  for(let t=start+120000;t<=ms+18*HOUR;t+=60000){
    const c=sunPosition(t,lat,lon).elevation;
    if((b>=a&&b>c)||(b<=a&&b<c))extrema.push({time:t-60000,kind:b>=a?'верхний':'нижний'});
    a=b;b=c;
  }
  const center=extrema.sort((a,b)=>Math.abs(a.time-ms)-Math.abs(b.time-ms))[0];
  return {center,from:center.time-12*HOUR,to:center.time+12*HOUR};
}
