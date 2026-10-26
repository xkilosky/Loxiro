// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useUnifiedSearch } from './useUnifiedSearch';
import type { Screen } from '../types';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const response=(query:string)=>new Response(JSON.stringify({query,results:[{title:query,url:'https://example.org/'+query}],providers:[],limitedWebCoverage:true,ranking:'fixture'}),{headers:{'Content-Type':'application/json'}});
describe('tab-isolated unified search',()=>{
  it('does not search inactive app pages or empty queries',()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const {rerender}=renderHook(({screen,q}:{screen:Screen;q:string})=>useUnifiedSearch(screen,q,'duckduckgo','a',0),{initialProps:{screen:'home' as Screen,q:''}});
    rerender({screen:'downloads',q:'alpha'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('aborts old work and never allows a late response to replace another tab',async()=>{
    const pending:{resolve:(response:Response)=>void;signal:AbortSignal}[]=[];
    vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>(resolve=>pending.push({resolve,signal:init.signal!}))));
    const {result,rerender}=renderHook(({q,id})=>useUnifiedSearch('results',q,'duckduckgo',id,0),{initialProps:{q:'alpha',id:'a'}});
    rerender({q:'beta',id:'b'});expect(pending[0].signal.aborted).toBe(true);
    await act(async()=>pending[1].resolve(response('beta')));await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));
    await act(async()=>pending[0].resolve(response('alpha')));expect(result.current.knowledge[0].title).toBe('beta');
  });
  it('reuses fresh memory-only results when switching or duplicating tabs',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(response(new URL(url,'https://example.org').searchParams.get('q')!)));vi.stubGlobal('fetch',fetcher);
    const {result,rerender}=renderHook(({q,id})=>useUnifiedSearch('results',q,'duckduckgo',id,0),{initialProps:{q:'alpha',id:'a'}});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));rerender({q:'beta',id:'b'});
    await waitFor(()=>expect(result.current.knowledge[0]?.title).toBe('beta'));rerender({q:'alpha',id:'a'});
    await waitFor(()=>expect(result.current.knowledge[0]?.title).toBe('alpha'));rerender({q:'alpha',id:'c'});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('expires cached results and manual retry bypasses a fresh cache',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(1000);const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(response('alpha')));vi.stubGlobal('fetch',fetcher);
    const {result,rerender}=renderHook(({id,attempt})=>useUnifiedSearch('results','alpha','duckduckgo',id,attempt),{initialProps:{id:'a',attempt:0}});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));now.mockReturnValue(62000);rerender({id:'b',attempt:0});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));expect(fetcher).toHaveBeenCalledTimes(2);
    rerender({id:'b',attempt:1});await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not show a previous tab’s results when a new tab errors',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response('alpha')).mockRejectedValueOnce(new TypeError('offline')));
    const {result,rerender}=renderHook(({q,id})=>useUnifiedSearch('results',q,'duckduckgo',id,0),{initialProps:{q:'alpha',id:'a'}});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('done'));rerender({q:'beta',id:'b'});
    await waitFor(()=>expect(result.current.knowledgeStatus).toBe('error'));expect(result.current.knowledge).toEqual([]);expect(result.current.searchData).toBeNull();expect(result.current.searchError).toContain('offline');
  });
});
