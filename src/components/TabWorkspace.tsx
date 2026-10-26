import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Layers, Pin, Plus, RotateCcw, Search, Trash2, X, Globe2 } from 'lucide-react';
import type { TabWorkspace } from '../hooks/useTabs';
import { MAX_CLOSED_TABS, MAX_TABS, tabTitle } from '../lib/tabs';

export function TabBar({workspace:w, onNew, onManage, onClose}:{workspace:TabWorkspace; onNew:()=>void; onManage:()=>void; onClose:(id:string)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[w.activeId]);
  return <nav className="workspace-bar" aria-label="Loxiro tabs"><div className="workspace-strip" ref={ref} onKeyDown={e=>{
    if (e.ctrlKey||e.metaKey||e.altKey||!(e.target as HTMLElement).classList.contains('workspace-tab-select')) return;
    const i=w.tabs.findIndex(t=>t.id===(e.target as HTMLElement).dataset.tabId);
    let next=i;
    if(e.key==='ArrowRight')next=(i+1)%w.tabs.length;
    else if(e.key==='ArrowLeft')next=(i-1+w.tabs.length)%w.tabs.length;
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=w.tabs.length-1;
    else if(e.key==='Delete'){e.preventDefault();onClose(w.tabs[i].id);requestAnimationFrame(()=>ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus());return;}
    else return;
    e.preventDefault();w.activate(w.tabs[next].id);
    ref.current?.querySelector<HTMLElement>(`[data-tab-id="${w.tabs[next].id}"]`)?.focus();
  }}>{w.tabs.map(t=><div key={t.id} className={`workspace-tab ${t.id===w.activeId?'active':''} ${t.pinned?'pinned':''}`}><button className="workspace-tab-select" data-tab-id={t.id} aria-current={t.id===w.activeId?'page':undefined} aria-label={`Switch to ${tabTitle(t)}${t.pinned?' (pinned)':''}`} title={tabTitle(t)} onClick={()=>w.activate(t.id)}>{t.pinned?<Pin size={13}/>:t.screen==='results'?<Search size={14}/>:<Globe2 size={14}/>}<span>{tabTitle(t)}</span></button><button className="workspace-tab-close" aria-label={`Close tab ${tabTitle(t)}`} onClick={()=>{onClose(t.id);requestAnimationFrame(()=>ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus());}}><X size={13}/></button></div>)}</div><div className="workspace-controls"><button className="icon-btn" aria-label="New Loxiro tab" title={`New tab · ${w.tabs.length}/${MAX_TABS}`} onClick={onNew}><Plus size={18}/></button><button className="workspace-manager-btn" aria-label={`Manage tabs (${w.tabs.length})`} onClick={onManage}><Layers size={16}/><span>{w.tabs.length}</span></button></div></nav>;
}

export function TabManager({workspace:w, onNew, onSelect, onClose}:{workspace:TabWorkspace; onNew:()=>void; onSelect:(id:string)=>void; onClose:(id:string)=>void}) {
  const [filter,setFilter]=useState('');
  const [confirm,setConfirm]=useState<'others'|'all'|null>(null);
  const matches=w.tabs.filter(t=>`${tabTitle(t)} ${t.draft}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const closable=w.tabs.filter(t=>!t.pinned && (confirm!=='others'||t.id!==w.activeId)).length;
  return <div className="tab-manager"><p className="modal-description">{w.tabs.length} of {MAX_TABS} tabs · Saved on this device. These tabs hold Loxiro pages and searches; websites still open in your browser.</p><label className="tab-filter"><Search size={16}/><input aria-label="Find an open tab" placeholder="Find a tab…" maxLength={200} value={filter} onChange={e=>setFilter(e.target.value)}/></label><div className="tab-manager-toolbar"><button className="secondary-btn small" disabled={w.atLimit} onClick={onNew}><Plus size={14}/>New tab</button><button className="text-btn" disabled={!w.closed.length||w.atLimit} onClick={()=>{w.reopen();setFilter('');setConfirm(null);}}><RotateCcw size={14}/>Reopen last closed{w.closed.length?` (${w.closed.length})`:''}</button></div><div className="tab-manager-list">{matches.map(t=>{
    const i=w.tabs.findIndex(tab=>tab.id===t.id);
    return <article className={`tab-manager-row ${t.id===w.activeId?'active':''}`} key={t.id}>
      <button className="tab-manager-select" onClick={()=>onSelect(t.id)} aria-label={`Go to ${tabTitle(t)}`}><span className="tab-manager-icon">{t.pinned?<Pin size={17}/>:t.screen==='results'?<Search size={17}/>:<Globe2 size={17}/>}</span><span><strong>{tabTitle(t)}</strong><small>{t.id===w.activeId?'Current tab · ':''}{t.pinned?'Pinned · ':''}{t.screen==='results'?'Unified search':t.screen==='home'&&t.draft?`Draft: ${t.draft}`:'Loxiro workspace'}</small></span></button>
      <div className="tab-manager-actions"><button className="icon-btn" aria-label={`${t.pinned?'Unpin':'Pin'} tab ${tabTitle(t)}`} aria-pressed={t.pinned} onClick={()=>w.pin(t.id)}><Pin size={14}/></button><button className="icon-btn" aria-label={`Duplicate tab ${tabTitle(t)}`} disabled={w.atLimit} onClick={()=>{w.duplicate(t);setFilter('');}}><Copy size={14}/></button><button className="icon-btn" aria-label={`Move tab ${tabTitle(t)} left`} disabled={i===0||w.tabs[i-1].pinned!==t.pinned} onClick={()=>w.move(t.id,-1)}><ArrowLeft size={14}/></button><button className="icon-btn" aria-label={`Move tab ${tabTitle(t)} right`} disabled={i===w.tabs.length-1||w.tabs[i+1].pinned!==t.pinned} onClick={()=>w.move(t.id,1)}><ArrowRight size={14}/></button><button className="icon-btn" aria-label={`Close tab ${tabTitle(t)}`} onClick={()=>{onClose(t.id);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.tab-filter input')?.focus());}}><X size={15}/></button></div>
    </article>;
  })}{!matches.length&&<p className="tab-no-matches" role="status">No tabs match “{filter}”.</p>}</div><div className="tab-manager-footer"><p>Pinned tabs stay first and survive bulk closing. The last {MAX_CLOSED_TABS} closed tabs can be reopened. Closing a tab does not cancel downloads.</p>{confirm?<div className="tab-close-confirm" role="group" aria-label="Confirm closing tabs"><p>Close {closable} unpinned {closable===1?'tab':'tabs'}?</p><button className="text-btn" onClick={()=>setConfirm(null)}>Cancel</button><button className="secondary-btn small" disabled={!closable} onClick={()=>{w.closeUnpinned(confirm==='others');setConfirm(null);setFilter('');}}>Close tabs</button></div>:<div className="tab-bulk-actions"><button className="text-btn" disabled={!w.tabs.some(t=>!t.pinned&&t.id!==w.activeId)} onClick={()=>setConfirm('others')}>Close other unpinned tabs</button><button className="text-btn" disabled={!w.tabs.some(t=>!t.pinned)} onClick={()=>setConfirm('all')}><Trash2 size={13}/>Close unpinned tabs</button></div>}</div></div>;
}
