import { useEffect, useRef, useState } from 'react';
import type { EngineId, Screen, UnifiedSearchResponse } from '../types';
import { analyze } from '../lib/smart';

// In-memory only: inactive tabs do not keep fetching. Switches reuse fresh results for 60s.
export function useUnifiedSearch(screen: Screen, query: string, engine: EngineId, tabId: string, attempt: number) {
  const key = JSON.stringify([tabId, query, engine]);
  const [state,setState] = useState<{key:string; status:'loading'|'done'|'error'; data:UnifiedSearchResponse|null; error:string}>({key:'',status:'loading',data:null,error:''});
  const cache = useRef(new Map<string,{data:UnifiedSearchResponse; at:number}>());
  const lastAttempt = useRef(attempt);
  useEffect(()=>{
    const force = lastAttempt.current!==attempt;lastAttempt.current=attempt;
    if (screen!=='results'||!query.trim()) return;
    const cacheKey = JSON.stringify([query,engine]);
    const hit = cache.current.get(cacheKey);
    if (!force && hit && Date.now()-hit.at<60000) {setState({key,status:'done',data:hit.data,error:''});return;}
    const controller=new AbortController();let disposed=false;
    setState({key,status:'loading',data:null,error:''});
    const timer=setTimeout(()=>controller.abort(),11000);
    const clean=analyze(query,engine).cleanQuery;
    fetch(`/api/search?q=${encodeURIComponent(clean)}`,{signal:controller.signal,credentials:'same-origin',cache:'no-store'}).then(async r=>{
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Search is temporarily unavailable.');
      return data as UnifiedSearchResponse;
    }).then(data=>{
      if(disposed||controller.signal.aborted)return;
      cache.current.delete(cacheKey);cache.current.set(cacheKey,{data,at:Date.now()});
      if(cache.current.size>30)cache.current.delete(cache.current.keys().next().value!);
      setState({key,status:'done',data,error:''});
    }).catch(error=>{
      if(disposed)return;
      const message=controller.signal.aborted?'The search timed out. Please try again.':error instanceof SyntaxError?'The search service is not available on this preview.':error.message||'Could not reach the search service.';
      setState({key,status:'error',data:null,error:message});
    }).finally(()=>clearTimeout(timer));
    return()=>{disposed=true;clearTimeout(timer);controller.abort();};
  },[screen,query,engine,tabId,attempt,key]);
  const current = screen==='results' && state.key===key ? state : null;
  return {knowledge:current?.data?.results || [], searchData:current?.data || null, searchError:current?.error || '', knowledgeStatus:current?.status || (screen==='results'?'loading':'idle')};
}
