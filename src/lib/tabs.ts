import type { EngineId, Screen } from '../types';
import { WEB_ENGINES, VERTICAL_ENGINES } from '../data/engines';
import { uid } from './storage';

export const MAX_TABS = 30;
export const MAX_CLOSED_TABS = 10;
export interface TabRoute { screen: Screen; q: string; engine?: EngineId; tabId?: string }
export interface WorkspaceTab { id: string; screen: Screen; q: string; draft: string; engine: EngineId; pinned: boolean }
export interface TabSession { tabs: WorkspaceTab[]; activeId: string; closed: WorkspaceTab[] }
export const PAGE_TITLES: Record<Screen, string> = {home:'New tab', results:'Search', smart:'Smart tools', spaces:'Spaces', downloads:'Downloads', settings:'Settings'};
const isScreen = (v: unknown): v is Screen => typeof v === 'string' && Object.hasOwn(PAGE_TITLES, v);
const isEngine = (v: unknown): v is EngineId => [...WEB_ENGINES, ...VERTICAL_ENGINES].some(e => e.id === v);
export function blankTab(engine: EngineId = 'duckduckgo'): WorkspaceTab { return {id:uid(), screen:'home', q:'', draft:'', engine:isEngine(engine)?engine:'duckduckgo', pinned:false}; }
export function tabTitle(tab: WorkspaceTab) { return tab.screen === 'results' ? tab.q || 'Search' : PAGE_TITLES[tab.screen]; }
export function tabHash(tab: WorkspaceTab) {
  const p = new URLSearchParams();
  if (tab.q) p.set('q', tab.q);
  p.set('engine', tab.engine); p.set('tab', tab.id);
  return `#${tab.screen}?${p}`;
}
function cleanTab(raw: unknown): WorkspaceTab | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<WorkspaceTab>;
  if (typeof t.id !== 'string' || !/^[\w-]{1,80}$/.test(t.id) || !isScreen(t.screen) || !isEngine(t.engine)) return null;
  const q = typeof t.q === 'string' ? t.q.slice(0,200) : '';
  return {id:t.id, screen:t.screen==='results'&&!q.trim()?'home':t.screen, engine:t.engine, q, draft:typeof t.draft === 'string' ? t.draft.slice(0,200) : '', pinned:t.pinned === true};
}
function sorted(tabs: WorkspaceTab[]) { return [...tabs.filter(t=>t.pinned), ...tabs.filter(t=>!t.pinned)]; }
export const sortTabs = sorted;
/** Drops malformed entries and de-duplicates by id, preserving input order. Shared by session restore and backup import. */
export function sanitizeTabList(raw: unknown): WorkspaceTab[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(); const out: WorkspaceTab[] = [];
  for (const item of raw) {
    const tab = cleanTab(item);
    if (!tab || seen.has(tab.id)) continue;
    seen.add(tab.id); out.push(tab);
  }
  return out;
}
const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function restoreSession(raw: unknown, route: TabRoute, explicit: boolean, engine: EngineId): TabSession {
  const value = raw && typeof raw === 'object' ? raw as Partial<TabSession> : {};
  const openList = sanitizeTabList(value.tabs);
  const openIds = new Set(openList.map(t=>t.id));
  let tabs = sorted(openList.slice(0,MAX_TABS));
  // An id claimed by the open list stays open, matching the pre-import shared-dedupe behaviour.
  const closed = sanitizeTabList(asArray(value.closed)).filter(t=>!openIds.has(t.id)).slice(0,MAX_CLOSED_TABS);
  if (!tabs.length) tabs = [blankTab(engine)];
  const activeId = tabs.some(t=>t.id===value.activeId) ? value.activeId! : tabs[0].id;
  const state = {tabs, activeId, closed};
  return explicit ? reduceTabs(state, {type:'route', route}) : state;
}
export type TabAction =
  | {type:'route'; route:TabRoute}
  | {type:'draft'; draft:string}
  | {type:'activate'; id:string}
  | {type:'add'; tab:WorkspaceTab}
  | {type:'close'; id:string; blank:WorkspaceTab}
  | {type:'bulk'; keepActive:boolean; blank:WorkspaceTab}
  | {type:'reopen'}
  | {type:'pin'; id:string}
  | {type:'move'; id:string; direction:-1|1}
  | {type:'restore'; session:TabSession};
function without(state: TabSession, closing: WorkspaceTab[], blank: WorkspaceTab): TabSession {
  if (!closing.length) return state;
  const ids = new Set(closing.map(t=>t.id));
  let tabs = state.tabs.filter(t=>!ids.has(t.id));
  if (!tabs.length) tabs = [blank];
  const oldIndex = state.tabs.findIndex(t=>t.id===state.activeId);
  const activeId = tabs.some(t=>t.id===state.activeId) ? state.activeId : tabs[Math.min(oldIndex,tabs.length-1)].id;
  return {tabs, activeId, closed:[...closing.slice().reverse(), ...state.closed].slice(0,MAX_CLOSED_TABS)};
}
export function reduceTabs(state: TabSession, action: TabAction): TabSession {
  const active = state.tabs.find(t=>t.id===state.activeId)!;
  switch (action.type) {
    case 'draft': return {...state, tabs:state.tabs.map(t=>t.id===active.id ? {...t, draft:action.draft.slice(0,200)} : t)};
    case 'route': {
      const target = state.tabs.find(t=>t.id===action.route.tabId) || active;
      const q = action.route.q.slice(0,200);
      const screen = action.route.screen==='results'&&!q.trim()?'home':action.route.screen;
      const engine = action.route.engine || target.engine;
      const same = target.screen===screen && target.q===q && target.engine===engine;
      return {...state, activeId:target.id, tabs:state.tabs.map(t=>t.id===target.id ? {...t, screen, q:q.slice(0,200), engine, draft:same?t.draft:q.slice(0,200)} : t)};
    }
    case 'activate': return state.tabs.some(t=>t.id===action.id) ? {...state, activeId:action.id} : state;
    case 'add': return state.tabs.length>=MAX_TABS || state.tabs.some(t=>t.id===action.tab.id) ? state : {...state, tabs:sorted([...state.tabs,action.tab]), activeId:action.tab.id};
    case 'close': return without(state,state.tabs.filter(t=>t.id===action.id),action.blank);
    case 'bulk': return without(state,state.tabs.filter(t=>!t.pinned && (!action.keepActive || t.id!==active.id)),action.blank);
    case 'reopen': {
      if (!state.closed.length || state.tabs.length>=MAX_TABS) return state;
      const [tab, ...closed] = state.closed;
      return {...state, tabs:sorted([...state.tabs,tab]), activeId:tab.id, closed};
    }
    case 'pin': return {...state,tabs:sorted(state.tabs.map(t=>t.id===action.id ? {...t,pinned:!t.pinned} : t))};
    case 'move': {
      const i = state.tabs.findIndex(t=>t.id===action.id), j = i+action.direction;
      if (i<0 || j<0 || j>=state.tabs.length || state.tabs[i].pinned!==state.tabs[j].pinned) return state;
      const tabs = [...state.tabs]; [tabs[i],tabs[j]]=[tabs[j],tabs[i]];return {...state,tabs};
    }
    case 'restore': {
      const incoming = sanitizeTabList(action.session.tabs).slice(0,MAX_TABS);
      if (!incoming.length) return state;
      const tabs = sorted(incoming);
      const activeId = tabs.some(t=>t.id===action.session.activeId) ? action.session.activeId : tabs[0].id;
      return {tabs, activeId, closed:sanitizeTabList(action.session.closed).slice(0,MAX_CLOSED_TABS)};
    }
  }
}
