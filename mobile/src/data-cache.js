export const DATA_TTL=10*60*1000;
// Failures are still throttled (no retry storm against the API), but only briefly,
// so a transient network drop does not pin an error on screen for the full TTL.
export const FAILURE_TTL=30*1000;
export function weatherCacheKey(path){
 const [route,query='']=path.split('?');
 const params=new URLSearchParams(query);
 params.delete('from');params.delete('to');params.sort();
 return route+'?'+params.toString();
}
export function cachedLoader(fetcher,{ttl=DATA_TTL,failureTtl=FAILURE_TTL,clock=Date.now,key=weatherCacheKey}={}){
 const entries=new Map();
 return path=>{
  const cacheKey=key(path),at=clock(),entry=entries.get(cacheKey);
  if(entry&&at<entry.expires)return entry.promise;
  const promise=Promise.resolve().then(()=>fetcher(path));
  const created={promise,expires:at+ttl};
  entries.set(cacheKey,created);
  promise.catch(()=>{created.expires=Math.min(created.expires,at+failureTtl);});
  return promise;
 };
}
