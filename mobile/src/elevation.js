// GPS reports height above the WGS84 ellipsoid; pressure needs height above sea level.
// EGM2008 geoid height N (m) over Cyprus, generated with PROJ (EPSG:4979 -> 4326+3855):
// rows from 34.5°N northwards, columns from 32.25°E eastwards, 0.25° apart.
const LAT0=34.5,LON0=32.25,STEP=.25;
const GEOID=[
 [14.6,16.1,17.8,18.5,18.9,19.2,19.2,18.5,17.8,17.5,17.3],
 [18.4,21.4,23.6,24.6,24.3,23.6,22.1,20.9,19.9,19.0,18.1],
 [22.2,25.3,28.1,28.9,28.3,27.4,26.0,24.6,22.9,21.2,19.9],
 [22.4,25.5,27.6,28.2,28.2,28.1,27.3,26.4,24.8,23.1,22.0],
 [21.3,23.7,25.6,26.5,26.7,26.5,26.4,26.3,25.7,24.3,23.0],
 [21.4,23.6,25.1,25.7,25.6,25.4,25.2,24.9,24.6,24.3,23.7],
];
// A GPS fix vaguer than this (or with no vertical accuracy at all) is not used:
// 30 m is already about 3.5 hPa of pressure.
export const MAX_VERTICAL_ERROR=30;
// GPS elevation applies only near the station the pressure is computed for.
export const NEAR_STATION_KM=15;

export function geoidHeight(lat,lon){
 const y=Math.min(GEOID.length-1,Math.max(0,(lat-LAT0)/STEP)),x=Math.min(GEOID[0].length-1,Math.max(0,(lon-LON0)/STEP));
 const i=Math.min(GEOID.length-2,Math.floor(y)),j=Math.min(GEOID[0].length-2,Math.floor(x)),u=y-i,v=x-j;
 return GEOID[i][j]*(1-u)*(1-v)+GEOID[i][j+1]*(1-u)*v+GEOID[i+1][j]*u*(1-v)+GEOID[i+1][j+1]*u*v;
}

export function gpsElevation(coords){
 if(!coords)return null;
 const {latitude,longitude,altitude,altitudeAccuracy}=coords;
 if(![latitude,longitude,altitude,altitudeAccuracy].every(Number.isFinite)||altitudeAccuracy>MAX_VERTICAL_ERROR)return null;
 const msl=Math.round(altitude-geoidHeight(latitude,longitude));
 return msl>=-500&&msl<=4000?msl:null;
}
