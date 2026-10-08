import {t} from './i18n.js';
// Temperature ramp reused from aranet4's station map.
const STOPS=[[0,[59,111,212]],[12,[47,163,168]],[20,[224,161,42]],[28,[224,102,45]],[36,[194,45,45]]];
export function tempColor(t){
 if(t==null)return {bg:'#8b93a1',fg:'#fff'};
 const x=Math.min(36,Math.max(0,t));let i=0;
 while(i<STOPS.length-2&&x>STOPS[i+1][0])i++;
 const [a,c]=STOPS[i],[b,d]=STOPS[i+1],k=(x-a)/(b-a);
 const rgb=c.map((v,j)=>Math.round(v+(d[j]-v)*k));
 return {bg:`rgb(${rgb.join(',')})`,fg:(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255>.55?'#1d2330':'#fff'};
}
export function labelFits(point,points,zoom){
 return zoom>=10&&!points.some(other=>other.code!==point.code&&Math.abs(other.x-point.x)<40&&Math.abs(other.y-point.y)<30);
}
export function windArrow(reading){
 const speed=reading?.wind10??reading?.wind2;
 if(reading?.wdir==null||speed==null||speed<.3)return '';
 const start=16,len=Math.min(8+speed*2.5,30),r=start+len+4,tip=r-start-len,base=r-start;
 const path=`M${r} ${base} L${r} ${tip+5} M${r-4} ${tip+6} L${r} ${tip} L${r+4} ${tip+6}`;
 return `<svg class="mapwind" width="${r*2}" height="${r*2}" viewBox="0 0 ${r*2} ${r*2}" style="transform:translate(-50%,-50%) rotate(${(reading.wdir+180)%360}deg)" aria-hidden="true"><path d="${path}" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" stroke="#29483f" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function rainLevel(mm30){
 if(!(mm30>0))return null;
 const rate=mm30*2;
 return rate<2.5?{cls:'light',name:t('rain.light')}:rate<7.6?{cls:'moderate',name:t('rain.moderate')}:{cls:'heavy',name:t('rain.heavy')};
}
export function flashIndices(data,at,trail){
 return (data?.ts||[]).flatMap((t,i)=>t<=at&&t>=at-trail?[i]:[]);
}
