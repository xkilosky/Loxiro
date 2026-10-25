import { describe, expect, it } from 'vitest';
import { blankTab, MAX_TABS, reduceTabs, restoreSession, tabHash, tabTitle, type TabSession, type WorkspaceTab } from './tabs';
const tab=(q='', pinned=false):WorkspaceTab=>({...blankTab(),screen:q?'results':'home',q,draft:q,pinned});
const session=(tabs=[tab()]):TabSession=>({tabs,activeId:tabs[0].id,closed:[]});

describe('local workspace tabs',()=>{
  it('creates a blank session without browser APIs or website navigation',()=>{
    const s=restoreSession(null,{screen:'home',q:''},false,'duckduckgo');
    expect(s.tabs).toHaveLength(1);expect(s.activeId).toBe(s.tabs[0].id);expect(tabTitle(s.tabs[0])).toBe('New tab');
  });
  it('restores active tab, drafts, order, pins, and closed history when no URL route is given',()=>{
    const a=tab('alpha'), b={...tab(),draft:'unsent idea'}, c=tab('closed');
    const restored=restoreSession({...session([a,b]),activeId:b.id,closed:[c]},{screen:'home',q:''},false,'duckduckgo');
    expect(restored).toEqual({tabs:[a,b],activeId:b.id,closed:[c]});
  });
  it('an explicit deep link navigates the active tab without losing other tabs',()=>{
    const a=tab('alpha'),b=tab('beta');const s=restoreSession(session([a,b]),{screen:'results',q:'NASA'},true,'duckduckgo');
    expect(s.tabs[0].q).toBe('NASA');expect(s.tabs[1]).toEqual(b);expect(s.activeId).toBe(a.id);
  });
  it('restores unsent edits on reload if the URL still matches the submitted route',()=>{
    const a={...tab('alpha'),draft:'a different unsent question'};
    const s=restoreSession(session([a]),{screen:'results',q:'alpha',tabId:a.id},true,'duckduckgo');expect(s.tabs[0].draft).toBe(a.draft);
  });
  it('uses the URL tab ID for browser back/forward when the tab still exists',()=>{
    const a=tab('alpha'),b=tab('beta');const s=reduceTabs(session([a,b]),{type:'route',route:{tabId:b.id,screen:'results',q:'earlier beta'}});
    expect(s.activeId).toBe(b.id);expect(s.tabs[0]).toEqual(a);expect(s.tabs[1].q).toBe('earlier beta');
  });
  it('ignores unknown URL tab IDs instead of allowing arbitrary tab creation',()=>{
    const a=tab('alpha');const s=reduceTabs(session([a]),{type:'route',route:{tabId:'unknown',screen:'home',q:''}});expect(s.tabs).toHaveLength(1);expect(s.activeId).toBe(a.id);
  });
  it('normalizes corrupt, duplicate, oversized, and unknown persisted values',()=>{
    const a=tab('alpha');const raw={tabs:[null,{id:'bad'},a,a,{...a,id:'second',q:'x'.repeat(500),draft:'y'.repeat(500),pinned:'yes'}, {...a,id:'bad-engine',engine:'evil'}, {...a,id:'bad-screen',screen:'__proto__'}],activeId:'missing',closed:[a,{...a,id:'closed'}]};
    const s=restoreSession(raw,{screen:'home',q:''},false,'duckduckgo');
    expect(s.tabs).toHaveLength(2);expect(s.activeId).toBe(a.id);expect(s.tabs[1].q).toHaveLength(200);expect(s.tabs[1].draft).toHaveLength(200);expect(s.tabs[1].pinned).toBe(false);expect(s.closed).toHaveLength(1);
    expect(restoreSession('bad',{screen:'home',q:''},false,'duckduckgo').tabs).toHaveLength(1);
    expect(restoreSession({tabs:{}},{screen:'home',q:''},false,'duckduckgo').tabs).toHaveLength(1);
  });
  it('bounds persisted open and closed sessions',()=>{
    const s=restoreSession({tabs:Array.from({length:40},()=>tab()),closed:Array.from({length:20},()=>tab())},{screen:'home',q:''},false,'duckduckgo');expect(s.tabs).toHaveLength(30);expect(s.closed).toHaveLength(10);
  });
  it('updates only the active draft and preserves drafts while switching',()=>{
    const a=tab('alpha'),b=tab('beta');let s=reduceTabs(session([a,b]),{type:'draft',draft:'unsent'});
    s=reduceTabs(s,{type:'activate',id:b.id});expect(s.tabs[0].draft).toBe('unsent');expect(s.tabs[1].draft).toBe('beta');
    s=reduceTabs(s,{type:'activate',id:'unknown'});expect(s.activeId).toBe(b.id);
  });
  it('adds and selects tabs, rejects duplicate IDs, and enforces the tab limit',()=>{
    let s=session();const b=tab();s=reduceTabs(s,{type:'add',tab:b});expect(s.activeId).toBe(b.id);
    expect(reduceTabs(s,{type:'add',tab:b})).toBe(s);
    while(s.tabs.length<MAX_TABS)s=reduceTabs(s,{type:'add',tab:tab()});
    expect(reduceTabs(s,{type:'add',tab:tab()})).toBe(s);
  });
  it('closing an inactive tab preserves the current one; closing active selects a neighbor',()=>{
    const a=tab('alpha'),b=tab('beta'),c=tab('gamma');let s={...session([a,b,c]),activeId:b.id};
    s=reduceTabs(s,{type:'close',id:a.id,blank:tab()});expect(s.activeId).toBe(b.id);
    s=reduceTabs(s,{type:'close',id:b.id,blank:tab()});expect(s.activeId).toBe(c.id);expect(s.closed.map(t=>t.id)).toEqual([b.id,a.id]);
  });
  it('closing the last tab creates exactly one fresh blank tab and permits reopening',()=>{
    const a=tab('alpha'),fresh=tab();let s=reduceTabs(session([a]),{type:'close',id:a.id,blank:fresh});
    expect(s.tabs).toEqual([fresh]);expect(s.activeId).toBe(fresh.id);s=reduceTabs(s,{type:'reopen'});expect(s.tabs).toEqual([fresh,a]);expect(s.activeId).toBe(a.id);expect(s.closed).toEqual([]);
  });
  it('limits closed history to ten and safely handles reopening with no history or a full session',()=>{
    let s=session(Array.from({length:15},()=>tab()));for(let i=0;i<12;i++)s=reduceTabs(s,{type:'close',id:s.tabs[0].id,blank:tab()});expect(s.closed).toHaveLength(10);
    const empty=session();expect(reduceTabs(empty,{type:'reopen'})).toBe(empty);
    const full={...session(Array.from({length:30},()=>tab())),closed:s.closed};expect(reduceTabs(full,{type:'reopen'})).toBe(full);
  });
  it('pins first, unpins into the normal group, and supports bounded reordering within a group',()=>{
    const a=tab('alpha'),b=tab('beta'),c=tab('gamma');let s=reduceTabs(session([a,b,c]),{type:'pin',id:c.id});
    expect(s.tabs.map(t=>t.id)).toEqual([c.id,a.id,b.id]);expect(s.tabs[0].pinned).toBe(true);
    expect(reduceTabs(s,{type:'move',id:a.id,direction:-1})).toBe(s);
    s=reduceTabs(s,{type:'move',id:b.id,direction:-1});expect(s.tabs.map(t=>t.id)).toEqual([c.id,b.id,a.id]);
    s=reduceTabs(s,{type:'pin',id:c.id});expect(s.tabs.every(t=>!t.pinned)).toBe(true);
    expect(reduceTabs(s,{type:'move',id:'unknown',direction:1})).toBe(s);
  });
  it('bulk close protects pinned and optionally active tabs; all unpinned closed leaves a fresh tab',()=>{
    const a=tab('alpha',true),b=tab('beta'),c=tab('gamma');let s={...session([a,b,c]),activeId:b.id};
    s=reduceTabs(s,{type:'bulk',keepActive:true,blank:tab()});expect(s.tabs.map(t=>t.id)).toEqual([a.id,b.id]);
    s=reduceTabs(s,{type:'bulk',keepActive:false,blank:tab()});expect(s.tabs).toEqual([a]);expect(s.activeId).toBe(a.id);
    const fresh=tab();s=reduceTabs(session([b,c]),{type:'bulk',keepActive:false,blank:fresh});expect(s.tabs).toEqual([fresh]);expect(s.closed).toHaveLength(2);
  });
  it('serializes encoded routes and uses plain text titles, never site HTML or URLs',()=>{
    const a=tab('<script> & NASA?');const url=new URL(tabHash(a),'https://example.org');const p=new URLSearchParams(url.hash.split('?')[1]);
    expect(p.get('q')).toBe(a.q);expect(p.get('tab')).toBe(a.id);expect(tabTitle(a)).toBe(a.q);expect(tabTitle({...a,screen:'downloads'})).toBe('Downloads');
  });
  it('turns empty results routes into a usable home page rather than a perpetual loading screen',()=>{
    const a=tab('alpha');let s=reduceTabs(session([a]),{type:'route',route:{screen:'results',q:''}});expect(s.tabs[0].screen).toBe('home');
    s=restoreSession({tabs:[{...a,q:''}]},{screen:'home',q:''},false,'duckduckgo');expect(s.tabs[0].screen).toBe('home');
  });

});
