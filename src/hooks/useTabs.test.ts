// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useTabs } from './useTabs';
beforeEach(()=>{localStorage.clear();history.replaceState(null,'','/');});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const route={screen:'home' as const,q:''};
describe('tab session persistence',()=>{
  it('handles multiple batched creates without dropping tabs',()=>{
    const {result}=renderHook(()=>useTabs(route,'duckduckgo'));
    act(()=>{result.current.create();result.current.create();});expect(result.current.tabs).toHaveLength(3);expect(new Set(result.current.tabs.map(t=>t.id)).size).toBe(3);
  });
  it('restores active drafts, pins, and closed tabs after remount',()=>{
    const first=renderHook(()=>useTabs(route,'duckduckgo'));
    const original=first.result.current.activeId;
    act(()=>first.result.current.setDraft('unsent idea'));act(()=>first.result.current.pin(original));act(()=>first.result.current.create());
    const second=first.result.current.activeId;act(()=>first.result.current.close(second));
    first.unmount();const restored=renderHook(()=>useTabs(route,'duckduckgo'));
    expect(restored.result.current.activeId).toBe(original);expect(restored.result.current.active.draft).toBe('unsent idea');expect(restored.result.current.active.pinned).toBe(true);expect(restored.result.current.closed[0].id).toBe(second);
    act(()=>restored.result.current.reopen());expect(restored.result.current.activeId).toBe(second);
  });
  it('falls back safely from invalid stored JSON',()=>{
    localStorage.setItem('loxiro:v2:tabs','{broken');const {result}=renderHook(()=>useTabs(route,'duckduckgo'));expect(result.current.tabs).toHaveLength(1);expect(result.current.active.screen).toBe('home');
  });
  it('keeps the session usable when browser storage is unavailable',()=>{
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('disabled');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    const {result}=renderHook(()=>useTabs(route,'duckduckgo'));act(()=>result.current.create());expect(result.current.tabs).toHaveLength(2);
  });
});
