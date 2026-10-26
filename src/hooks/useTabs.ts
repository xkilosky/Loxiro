import { useEffect, useReducer } from 'react';
import type { EngineId } from '../types';
import { load, persist } from '../lib/storage';
import { blankTab, MAX_TABS, reduceTabs, restoreSession, type TabRoute, type TabSession, type WorkspaceTab } from '../lib/tabs';

export function useTabs(route: TabRoute, defaultEngine: EngineId) {
  const [session, dispatch] = useReducer(reduceTabs, undefined, () => restoreSession(load('tabs', null), route, location.hash.length>1, defaultEngine));
  useEffect(() => { persist('tabs', session); }, [session]);
  const active = session.tabs.find(t=>t.id===session.activeId)!;
  return {
    ...session, active,
    navigate: (route: TabRoute) => dispatch({type:'route', route}),
    setDraft: (draft: string) => dispatch({type:'draft', draft}),
    activate: (id: string) => dispatch({type:'activate', id}),
    create: () => dispatch({type:'add', tab:blankTab(defaultEngine)}),
    duplicate: (tab: WorkspaceTab) => dispatch({type:'add', tab:{...tab, id:blankTab(defaultEngine).id, pinned:false}}),
    close: (id: string) => dispatch({type:'close', id, blank:blankTab(defaultEngine)}),
    closeUnpinned: (keepActive: boolean) => dispatch({type:'bulk', keepActive, blank:blankTab(defaultEngine)}),
    reopen: () => dispatch({type:'reopen'}),
    pin: (id: string) => dispatch({type:'pin', id}),
    move: (id: string, direction: -1|1) => dispatch({type:'move', id, direction}),
    restore: (session: TabSession) => dispatch({type:'restore', session}),
    atLimit: session.tabs.length>=MAX_TABS,
  };
}
export type TabWorkspace = ReturnType<typeof useTabs>;
