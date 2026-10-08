import L from 'leaflet';
// Canvas lightning glyph and age ramp from the original aranet4 map.
const SHAPE=[[.2,-1],[-.5,.15],[-.02,.15],[-.22,1],[.5,-.18],[.05,-.18]];
const COLORS=[[.08,'#fff7c2'],[.2,'#ffd23f'],[.4,'#ff9f1c'],[.7,'#f2542d'],[1.01,'#b5179e']];
L.Canvas.include({_updateBolt(layer){
 if(!this._drawing||layer._empty())return;
 const p=layer._point,r=layer._radius,ctx=this._ctx;ctx.beginPath();
 SHAPE.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](p.x+x*r,p.y+y*r));ctx.closePath();this._fillStroke(ctx,layer);
}});
const Bolt=L.CircleMarker.extend({_updatePath(){this._renderer._updateBolt(this);}});
export function boltMarker(data,index,at,trail,renderer){
 const age=Math.min(Math.max((at-data.ts[index])/trail,0),1);
 return new Bolt([data.lat[index],data.lon[index]],{renderer,radius:8-5*age,weight:.8,color:'#3b2a00',lineJoin:'round',
  opacity:1-.8*age,fillColor:COLORS.find(([limit])=>age<limit)[1],fillOpacity:1-.85*age,interactive:false});
}
