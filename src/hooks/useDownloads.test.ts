// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useDownloads } from './useDownloads';
import { saveBlob } from '../lib/storage';
vi.mock('../lib/storage', async original => ({...await original<typeof import('../lib/storage')>(),saveBlob:vi.fn()}));
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const response=()=>new Response(new Uint8Array([1,2,3]), {headers:{'content-length':'3','content-type':'application/octet-stream'}});
describe('real download queue',()=>{
  it('streams bytes and saves a complete file',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response()));
    const {result}=renderHook(()=>useDownloads(2));
    act(()=>{expect(result.current.add('https://example.com/file.bin','')).toBe(true);});
    await waitFor(()=>expect(result.current.tasks[0].status).toBe('done'));
    expect(result.current.tasks[0].received).toBe(3);expect(saveBlob).toHaveBeenCalledOnce();
  });
  it('rejects non-web URLs without starting a transfer',()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useDownloads(1));
    act(()=>{expect(result.current.add('javascript:alert(1)','')).toBe(false);});expect(fetcher).not.toHaveBeenCalled();
  });
  it('reports cross-origin failure honestly',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const {result}=renderHook(()=>useDownloads(1));act(()=>{result.current.add('https://example.com/no-cors','');});
    await waitFor(()=>expect(result.current.tasks[0].status).toBe('error'));
    expect(result.current.tasks[0].error).toContain('CORS');expect(saveBlob).not.toHaveBeenCalled();
  });
  it('enforces concurrency and allows queued cancellation',async()=>{
    const fetcher=vi.fn().mockImplementation(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher);
    const {result}=renderHook(()=>useDownloads(1));
    act(()=>{result.current.add('https://example.com/one','');result.current.add('https://example.com/two','');});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
    const queued=result.current.tasks.find(t=>t.status==='queued')!;expect(queued).toBeTruthy();
    act(()=>result.current.cancel(queued.id));expect(result.current.tasks.find(t=>t.id===queued.id)?.status).toBe('cancelled');
  });
  it('marks interrupted transfers cancelled on restart',()=>{
    localStorage.setItem('loxiro:v2:downloads',JSON.stringify([{id:'old',status:'downloading',url:'https://example.com/file',filename:'file',received:20,total:100,speed:0,createdAt:1}]));
    const {result}=renderHook(()=>useDownloads(1));expect(result.current.tasks[0].status).toBe('cancelled');
  });
  it('shares a 32-request reservation budget and starts the next file after cancellation',async()=>{
    const fetcher=vi.fn().mockImplementation((_url:string, init:RequestInit)=>new Promise((_resolve,reject)=>{
      init.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    }));
    vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useDownloads(4,32));
    act(()=>{result.current.add('https://example.com/one','one');result.current.add('https://example.com/two','two');result.current.add('https://example.com/three','three');});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
    expect(result.current.tasks.filter(t=>t.status==='queued')).toHaveLength(2);
    const active=result.current.tasks.find(t=>t.status==='downloading')!;
    act(()=>result.current.cancel(active.id));
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.tasks.find(t=>t.id===active.id)?.status).toBe('cancelled');expect(saveBlob).not.toHaveBeenCalled();
  });
  it('cleans up all active files on cancel all and does not save cancelled bytes',async()=>{
    const signals:AbortSignal[]=[];
    const fetcher=vi.fn().mockImplementation((_url:string, init:RequestInit)=>new Promise((_resolve,reject)=>{
      signals.push(init.signal!);init.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    }));
    vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useDownloads(4,8));
    act(()=>{for(let i=0;i<4;i++)result.current.add(`https://example.com/${i}`,'');});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));act(()=>result.current.cancelAll());
    await waitFor(()=>expect(result.current.tasks.every(t=>t.status==='cancelled')).toBe(true));
    expect(signals.every(s=>s.aborted)).toBe(true);expect(saveBlob).not.toHaveBeenCalled();
  });
  it('retries an error as a fresh transfer and clears stale error/progress',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response()));
    const {result}=renderHook(()=>useDownloads(1,8));act(()=>{result.current.add('https://example.com/file.bin','');});
    await waitFor(()=>expect(result.current.tasks[0].status).toBe('error'));await act(async()=>{});
    act(()=>result.current.retry(result.current.tasks[0].id));
    await waitFor(()=>expect(result.current.tasks[0].status).toBe('done'));
    expect(result.current.tasks[0].error).toBeUndefined();expect(saveBlob).toHaveBeenCalledOnce();expect(result.current.tasks[0].received).toBe(3);
  });

  it('releases unused part reservations when a source falls back to one stream',async()=>{
    const fetcher=vi.fn().mockImplementation((_url:string, init:RequestInit)=>{
      if(fetcher.mock.calls.length===1)return Promise.resolve(new Response(new ReadableStream({start(){}})));
      return new Promise((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    });
    vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useDownloads(2,32));
    act(()=>{result.current.add('https://example.com/one','one');result.current.add('https://example.com/two','two');});
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.tasks.filter(t=>t.status==='downloading')).toHaveLength(2);
    act(()=>result.current.cancelAll());
  });

});
