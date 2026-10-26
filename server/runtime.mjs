import {createHash} from 'node:crypto';
import {ProviderError} from './transport.mjs';
import {canonicalUrl} from './rank.mjs';
import {usefulTokens,tokenCoverage} from './relevance.mjs';
export {usefulTokens} from './relevance.mjs';
function prune(results,query,lexical){
  const tokens=usefulTokens(query);
  return results.slice(0,24).filter(r=>r&&typeof r.title==='string'&&typeof r.url==='string'&&canonicalUrl(r.url)).map(r=>({title:r.title.slice(0,220),url:r.url,extract:String(r.extract||'').slice(0,700),...(r.contentType?{contentType:r.contentType}:{}),...(r.discoveredFrom&&canonicalUrl(r.discoveredFrom)?{discoveredFrom:r.discoveredFrom}:{})})).filter(r=>{
    if(!lexical||!tokens.length)return true;
    const text=`${r.title} ${r.extract}`.toLowerCase();
    return tokenCoverage(query,text)>=.4;
  });
}
/** Warm-instance protection, not distributed rate limiting. Never logs or writes queries. */
export function createProviderRuntime({now=Date.now,maxCache=160,ttl=60000}={}){
  const cache=new Map(),pending=new Map(),health=new Map();
  async function run(provider,query,env){
    const key=createHash('sha256').update(provider.id+'\0'+query.trim().toLowerCase()).digest('hex');
    const time=now();
    for(const [k,entry]of cache)if(entry.expires<=time){clearTimeout(entry.timer);cache.delete(k);}
    const cached=cache.get(key);
    if(cached)return{status:'ok',results:cached.results,cached:true};
    if(pending.has(key))return pending.get(key);
    const state=health.get(provider.id)||{next:0,failures:0};
    health.set(provider.id,state);
    if(state.next>time)return{status:'rate_limited',results:[],retryAfterSeconds:Math.ceil((state.next-time)/1000)};
    state.next=time+(provider.minInterval||0);
    const task=Promise.resolve().then(async()=>{
      try{
        const output=await provider.run(query,env);
        const backoff=Math.min(86400000,Math.max(0,Number(output?.backoffMs)||0));
        if(backoff)state.next=Math.max(state.next,now()+backoff);
        if(output?.error)throw new ProviderError('unavailable',backoff||60000);
        const results=prune(Array.isArray(output)?output:output?.results||[],query,provider.lexical);
        state.failures=0;
        // Cache empty successful answers too; don't repeatedly spend an upstream quota.
        if(cache.size>=maxCache){const oldest=cache.keys().next().value;clearTimeout(cache.get(oldest)?.timer);cache.delete(oldest);}
        const entry={results,expires:now()+ttl};
        entry.timer=setTimeout(()=>{if(cache.get(key)===entry)cache.delete(key);},ttl);
        entry.timer.unref?.();
        cache.set(key,entry);
        return{status:'ok',results,cached:false};
      }catch(error){
        state.failures++;
        if(error instanceof ProviderError||state.failures>=2)state.next=Math.max(state.next,now()+Math.max(1000,Number(error?.retryMs)||60000));
        return{status:error instanceof ProviderError?error.status:'unavailable',results:[],retryAfterSeconds:Math.max(1,Math.ceil((state.next-now())/1000))};
      }
    }).finally(()=>pending.delete(key));
    pending.set(key,task);
    return task;
  }
  return{run};
}
