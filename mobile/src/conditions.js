// Current condition from the snapshot: an icon (day/night) and a localisation key.
const ICONS={clear:['☀️','🌙'],partly_cloudy:['⛅','☁️'],cloudy:['☁️','☁️'],overcast:['☁️','☁️'],
 rain_light:['🌦️','🌧️'],rain_moderate:['🌧️','🌧️'],rain_heavy:['🌧️','🌧️'],thunderstorm:['⛈️','⛈️'],fog:['🌫️','🌫️'],dust:['🌫️','🌫️']};
export function conditionView(c){
 if(!c||!ICONS[c.code])return null;
 return {icon:ICONS[c.code][c.night?1:0],key:'conditions.'+c.code,source:c.source==='measured'?'conditions.measured':'conditions.model'};
}
