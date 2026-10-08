// Anonymous visit counting: a random id per install, sent once per app open.
// No account, device or location data; the server stores the id and its own time.
const KEY='anonymous_id';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Coming back after this long in the background counts as a new open.
export const SESSION_GAP=30*60*1000;

function randomId(){
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function anonymousId(storage=globalThis.localStorage,random=randomId){
 try{
  let id=storage.getItem(KEY);
  if(!ID.test(id||'')){id=random();storage.setItem(KEY,id);}
  return id;
 }catch{return null;}
}

export function visitTracker(send,{clock=Date.now,gap=SESSION_GAP}={}){
 let hiddenAt=null;
 return {
  open(){send();},
  hide(){if(hiddenAt==null)hiddenAt=clock();},
  show(){if(hiddenAt!=null&&clock()-hiddenAt>=gap)send();hiddenAt=null;},
 };
}
