import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Search, ArrowUpRight, ArrowRight, ArrowLeft, Sparkles, Download, Layers, Settings2,
  Plus, X, Globe2, Clock3, ChevronRight, Command, MoreHorizontal, Trash2, Check,
  Bookmark, Zap, ShieldCheck, ExternalLink, Copy, Calculator, ArrowLeftRight,
  Palette, Type, RefreshCw, FileDown, Pause, CheckCircle2, AlertCircle, WifiOff,
  Sun, Moon, Monitor, Smartphone, Keyboard, Folder, Link2, LoaderCircle, Menu,
} from 'lucide-react';
import type { EngineId, Screen, Settings, SavedLink, Space, RecentSearch, SearchProviderState } from './types';
import { WEB_ENGINES, VERTICAL_ENGINES, getEngine, engineUrl } from './data/engines';
import { BANGS } from './data/bangs';
import { QUICK_EXAMPLES, SUGGESTIONS } from './data/suggestions';
import { analyze, calculate, convert, formatNumber, parseColor, textStats, relatedSearches, normalizeUrl } from './lib/smart';
import { load, persist, uid, safeUrl, saveBlob, formatBytes } from './lib/storage';
import { useDownloads } from './hooks/useDownloads';
import { SiteIcon } from './components/SiteIcon';
import { TabBar, TabManager } from './components/TabWorkspace';
import { useTabs } from './hooks/useTabs';
import { useUnifiedSearch } from './hooks/useUnifiedSearch';
import { MAX_TABS, tabHash, type TabRoute } from './lib/tabs';
import { isAndroidBrowser } from './lib/platform';

function providerMessage(p: SearchProviderState): string {
  if(p.status==='not_configured')return p.access==='free-key'?'Free tier · API key required':'API key required';
  if(p.status==='disabled')return 'Paid provider · disabled by default';
  if(p.status==='skipped')return 'Not selected for this query';
  if(p.status==='rate_limited')return `Quota / cooldown${p.retryAfterSeconds?` · retry in ${p.retryAfterSeconds}s`:''}`;
  if(p.status==='unavailable')return 'Temporarily unavailable';
  return `${p.count} matches · ${p.cached?'cached · ':''}${p.kind==='web'?'web search':p.kind==='knowledge'?'knowledge source':p.kind}`;
}

const DEFAULTS: Settings = {theme:'system', defaultEngine:'duckduckgo', concurrency:2, downloadParts:8, openInNewTab:true, showRecents:true, reduceMotion:false, safeMode:true};
const INITIAL_SPACES: Space[] = [{id:'inbox',name:'Reading list',color:'#7A68D8',createdAt:Date.now()}];
const NAV = [
  {id:'home',label:'Search',icon:Search}, {id:'smart',label:'Smart tools',icon:Sparkles},
  {id:'spaces',label:'Spaces',icon:Layers}, {id:'downloads',label:'Downloads',icon:Download},
] as const;
type InstallEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome:string}>};

function readRoute(): TabRoute {
  const [page, params] = location.hash.slice(1).split('?');
  const p = new URLSearchParams(params); const e = p.get('engine');
  const screen = ['results','smart','spaces','downloads','settings'].includes(page) ? page as Screen : 'home';
  const engine = [...WEB_ENGINES,...VERTICAL_ENGINES].some(v=>v.id===e) ? e as EngineId : undefined;
  return {screen, q:(p.get('q') || '').slice(0,200), engine, tabId:p.get('tab') || undefined};
}

export default function App() {
  const initial = useRef(readRoute());
  const nativeAndroid = isAndroidBrowser();
  const [settings,setSettings] = useState<Settings>(()=>({...DEFAULTS,...load('settings',{})}));
  const tabs = useTabs(initial.current, settings.defaultEngine);
  const {screen, q:submitted, draft:query, engine} = tabs.active;
  const setQuery = tabs.setDraft;
  const [recents,setRecents] = useState<RecentSearch[]>(()=>load('recents',[]));
  const [saved,setSaved] = useState<SavedLink[]>(()=>load('saved',[]));
  const [spaces,setSpaces] = useState<Space[]>(()=>load('spaces',INITIAL_SPACES));
  const [toast,setToast] = useState('');
  const [modal,setModal] = useState<'save'|'space'|'download'|'shortcuts'|'clear'|'tabs'|null>(null);
  const [saveTitle,setSaveTitle] = useState(''); const [saveUrl,setSaveUrl] = useState('');
  const [saveSpace,setSaveSpace] = useState('inbox'); const [spaceName,setSpaceName] = useState('');
  const [spaceColor,setSpaceColor] = useState('#7A68D8'); const [activeSpace,setActiveSpace] = useState('all');
  const [savedFilter,setSavedFilter] = useState('');
  const [downloadUrl,setDownloadUrl] = useState(''); const [downloadName,setDownloadName] = useState('');
  const [formError,setFormError] = useState('');
  const [focused,setFocused] = useState(false); const [suggestionIndex,setSuggestionIndex] = useState(-1);
  const [online,setOnline] = useState(navigator.onLine);
  const [install,setInstall] = useState<InstallEvent|null>(null);
  const [installHelp,setInstallHelp] = useState(false);
  const [searchAttempt,setSearchAttempt] = useState(0);
  const {knowledge,searchData,searchError,knowledgeStatus} = useUnifiedSearch(screen,submitted,engine,tabs.activeId,searchAttempt);
  const [tool,setTool] = useState('calculator'); const [toolInput,setToolInput] = useState('');
  const [convertInput,setConvertInput] = useState('100 km to mi');
  const [colorInput,setColorInput] = useState('#3B5BFF'); const [textInput,setTextInput] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const downloads = useDownloads(settings.concurrency, settings.downloadParts);
  const activeDownloads = downloads.tasks.filter(t=>['queued','downloading'].includes(t.status)).length;
  const smart = analyze(query,engine);

  useEffect(()=>persist('settings',settings),[settings]);
  useEffect(()=>persist('recents',recents),[recents]);
  useEffect(()=>persist('saved',saved),[saved]);
  useEffect(()=>persist('spaces',spaces),[spaces]);
  useEffect(()=>{ if (!toast) return; const t=setTimeout(()=>setToast(''),3500); return ()=>clearTimeout(t); },[toast]);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=settings.theme==='system'?(media.matches?'dark':'light'):settings.theme;document.documentElement.dataset.motion=settings.reduceMotion?'reduced':'full';document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#111318':'#f8f9fb'));};
    apply(); media.addEventListener('change',apply); return ()=>media.removeEventListener('change',apply);
  },[settings.theme,settings.reduceMotion]);
  useEffect(()=>{
    const yes=()=>setOnline(true), no=()=>setOnline(false);
    const ready=(e:Event)=>{e.preventDefault();setInstall(e as InstallEvent);};
    window.addEventListener('online',yes);window.addEventListener('offline',no);window.addEventListener('beforeinstallprompt',ready);
    return ()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no);window.removeEventListener('beforeinstallprompt',ready);};
  },[]);
  useEffect(()=>{
    const change=()=>{tabs.navigate(readRoute());setFocused(false);setSuggestionIndex(-1);};
    window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);
  });
  useEffect(()=>{history.replaceState(null,'',tabHash(tabs.active));setFocused(false);setSuggestionIndex(-1);},[tabs.activeId,screen,submitted,engine]);
  useEffect(()=>{
    const key=(e:globalThis.KeyboardEvent)=>{
      const typing=['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName);
      if (e.key==='Escape') {setModal(null);setFocused(false);searchRef.current?.blur();return;}
      if (modal || e.isComposing) return;
      if(!nativeAndroid&&e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey){
        const key=e.key.toLowerCase();
        if(key==='n'){e.preventDefault();newTab();return;}
        if(key==='w'){e.preventDefault();closeTab(tabs.activeId);return;}
        if(key==='t'){e.preventDefault();if(tabs.atLimit)setToast(`Maximum ${MAX_TABS} tabs. Close one first.`);else if(tabs.closed.length)tabs.reopen();return;}
      }
      if (!nativeAndroid&&((e.key==='k'&&(e.ctrlKey||e.metaKey))||(!typing&&e.key==='/'))) {e.preventDefault();go('home');setTimeout(()=>searchRef.current?.focus(),20);}
      if (!typing && e.key==='?') setModal('shortcuts');
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });
  useEffect(()=>{setFormError('');},[modal]);

  function go(next:Screen,q='',e=engine) {
    setFocused(false);setSuggestionIndex(-1);setQuery(q);
    const route={...tabs.active,screen:next,q,engine:e};
    history.pushState(null,'',tabHash(route));
    tabs.navigate({screen:next,q,engine:e});
  }
  function newTab(){if(tabs.atLimit){setToast(`Maximum ${MAX_TABS} tabs. Close one first.`);return;}tabs.create();setModal(null);setTimeout(()=>searchRef.current?.focus(),30);}
  function closeTab(id:string){tabs.close(id);setToast('Tab closed. Reopen it from Manage tabs.');}
  function open(url:string) {const safe=safeUrl(url);if(!safe){setToast('Only HTTP and HTTPS links are supported.');return;}if(settings.openInNewTab)window.open(safe,'_blank','noopener,noreferrer');else location.assign(safe);}
  function search(q=query,e=engine) {
    q=q.trim();if(!q)return;
    const a=analyze(q,e);
    if(a.intent==='url'&&a.url){open(a.url);remember(q,e);return;}
    if(a.bang&&a.cleanQuery){open(engineUrl(a.engine,a.cleanQuery));remember(q,a.engine);return;}
    if(q===submitted&&screen==='results')setSearchAttempt(n=>n+1);
    const chosen=e;
    remember(q,chosen);go('results',q,chosen);searchRef.current?.blur();
  }
  function remember(q:string,e:EngineId){if(settings.showRecents)setRecents(rs=>[{id:uid(),query:q,engine:e,createdAt:Date.now()},...rs.filter(r=>r.query!==q)].slice(0,40));}

  function prepareSave(url='',title=''){setSaveUrl(url);setSaveTitle(title);setSaveSpace(activeSpace==='all'?'inbox':activeSpace);setModal('save');}
  function addSaved(e:FormEvent){e.preventDefault();const url=safeUrl(saveUrl.trim())||normalizeUrl(saveUrl.trim());if(!url){setFormError('Enter a valid http:// or https:// address.');return;}if(saved.some(s=>s.url===url)){setFormError('This link is already in your Spaces.');return;}setSaved(s=>[{id:uid(),url,title:saveTitle.trim()||new URL(url).hostname,spaceId:saveSpace,createdAt:Date.now()},...s]);setModal(null);setToast('Saved to your space.');}
  function addSpace(e:FormEvent){e.preventDefault();if(!spaceName.trim())return;const id=uid();setSpaces(s=>[...s,{id,name:spaceName.trim(),color:spaceColor,createdAt:Date.now()}]);setActiveSpace(id);setSpaceName('');setModal(null);}
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setToast('Copied to clipboard.');}catch{setToast('Clipboard unavailable. Select and copy the text manually.');}}
  function exportData(){saveBlob(new Blob([JSON.stringify({settings,spaces,saved,recents,tabs:{tabs:tabs.tabs,activeId:tabs.activeId,closed:tabs.closed},exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),'loxiro-backup.json');setToast('Backup saved.');}
  function addDownload(e:FormEvent){e.preventDefault();if(nativeAndroid){const url=safeUrl(downloadUrl.trim());if(!url){setFormError('Enter a valid HTTP or HTTPS file URL.');return;}open(url);setModal(null);setDownloadUrl('');setDownloadName('');setToast('Confirm the download in Android. Uses the system downloader, not parallel mode.');return;}if(!downloads.add(downloadUrl.trim(),downloadName)){setFormError('Enter a valid HTTP or HTTPS file URL.');return;}setModal(null);setDownloadUrl('');setDownloadName('');setToast('Added to the download queue.');}
  async function installApp(){if(install){await install.prompt();const result=await install.userChoice;if(result.outcome==='accepted')setToast('Loxiro is ready for your home screen.');setInstall(null);}else setInstallHelp(v=>!v);}
  const matches=query.trim()? [...new Set([...recents.map(r=>r.query),...SUGGESTIONS])].filter(s=>s.toLowerCase().includes(query.toLowerCase())&&s!==query).slice(0,4):[];
  const bangSuggestions=query.startsWith('!')&&!query.includes(' ')?BANGS.filter(b=>b.label.startsWith(query)).slice(0,5):[];
  const suggestions=bangSuggestions.length?bangSuggestions.map(b=>`${b.label} `):matches;
  function inputKey(e:ReactKeyboardEvent<HTMLInputElement>){
    if(e.key==='ArrowDown'){e.preventDefault();setSuggestionIndex(i=>Math.min(i+1,suggestions.length-1));}
    if(e.key==='ArrowUp'){e.preventDefault();setSuggestionIndex(i=>Math.max(i-1,-1));}
    if(e.key==='Enter'){e.preventDefault();if(suggestionIndex>=0&&suggestions[suggestionIndex]){const s=suggestions[suggestionIndex];if(s.startsWith('!')&&!s.trim().includes(' ')){setQuery(s);setSuggestionIndex(-1);}else search(s);}else search();}
  }
  function searchBox(compact=false){return <div className={`search-area ${compact?'compact':''}`}>
    <form className={`searchbox ${focused?'is-focused':''}`} onSubmit={e=>{e.preventDefault();search();}}>
      <Search size={compact?20:24} strokeWidth={1.8} className="search-icon"/>
      <input ref={searchRef} value={query} onChange={e=>{setQuery(e.target.value);setSuggestionIndex(-1);setFocused(true);}} onFocus={()=>setFocused(true)} onKeyDown={inputKey}
        placeholder="Search anything, or enter a URL" aria-label="Search the web or enter a URL" autoComplete="off" spellCheck={false} maxLength={200}
        role="combobox" aria-expanded={focused&&suggestions.length>0} aria-controls="suggestions" aria-activedescendant={suggestionIndex>=0?`suggestion-${suggestionIndex}`:undefined}/>
      {query&&<button type="button" className="icon-btn clear-search" aria-label="Clear search" onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={17}/></button>}
      {!query&&<kbd className="search-key">⌘ K</kbd>}
      <button className="search-submit" aria-label="Search"><ArrowRight size={21}/></button>
    </form>
    {focused&&suggestions.length>0&&<div className="suggestions" id="suggestions" role="listbox">{suggestions.map((s,i)=><button id={`suggestion-${i}`} key={s} type="button" role="option" aria-selected={suggestionIndex===i} className={suggestionIndex===i?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(bangSuggestions.length){setQuery(s);setSuggestionIndex(-1);searchRef.current?.focus();}else search(s);}}><Search size={16}/><span>{s}{bangSuggestions.length&&<small>{bangSuggestions[i]?.description}</small>}</span><ArrowUpRight size={15}/></button>)}</div>}
    {query.trim()&&smart.value&&smart.intent!=='search'&&smart.intent!=='question'&&smart.intent!=='code'&&<button className="instant-preview" onClick={()=>smart.intent==='url'&&smart.url?open(smart.url):search()}><Sparkles size={16}/><span><small>{smart.headline}</small><strong>{smart.value}</strong></span><ArrowUpRight size={17}/></button>}
  </div>;}
  function unifiedBadge(){return <div className="unified-search-badge"><Layers size={13}/><span>One search</span><span className="badge-divider">/</span><span>Combined sources</span><span className="badge-divider">/</span><span>No duplicates</span></div>;}

  function pageHeading(eyebrow:string,title:string,description:string,action?:React.ReactNode){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span className="title-dot">.</span></h1><p>{description}</p></div>{action}</div>;}

  return <div className="app-shell" onClick={()=>{if(focused&&document.activeElement!==searchRef.current)setFocused(false);}}>
    <aside className="sidebar">
      <button className="wordmark" onClick={()=>go('home')} aria-label="Loxiro home"><span className="logo-icon"><span/></span>Loxiro<span className="wordmark-dot">.</span></button>
      <div className="sidebar-label">YOUR EVERYDAY, REFINED</div>
      <nav className="desktop-nav" aria-label="Main navigation">{NAV.map(({id,label,icon:Icon})=><button key={id} className={(screen===id||(id==='home'&&screen==='results'))?'active':''} onClick={()=>go(id)}><Icon size={19} strokeWidth={1.8}/><span>{label}</span>{id==='downloads'&&activeDownloads>0?<b className="nav-count">{activeDownloads}</b>:id==='smart'?<span className="nav-new">NEW</span>:null}{id==='home'&&!nativeAndroid&&<kbd>⌘ K</kbd>}</button>)}</nav>
      <div className="sidebar-spaces"><div className="sidebar-section"><span>YOUR SPACES</span><button className="tiny-btn" aria-label="Create a space" onClick={()=>setModal('space')}><Plus size={16}/></button></div>{spaces.slice(0,5).map(s=><button key={s.id} onClick={()=>{setActiveSpace(s.id);go('spaces');}}><span className="space-dot" style={{background:s.color}}/>{s.name}<span className="quiet">{saved.filter(x=>x.spaceId===s.id).length}</span></button>)}<button className="create-space" onClick={()=>setModal('space')}><Plus size={15}/>New space</button></div>
      <div className="sidebar-bottom"><div className="local-badge"><ShieldCheck size={15}/><span>Your space. Your data.</span><span className="status-dot"/></div><button className={`settings-nav ${screen==='settings'?'active':''}`} onClick={()=>go('settings')}><Settings2 size={18}/>Settings<span className="version">v0.7</span></button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span className="mini-logo">l<span>•</span></span><span>Loxiro</span><span className="slash">/</span><strong>{screen==='home'?'Your search starts here':screen==='results'?'Search results':screen==='smart'?'Smart tools':screen==='spaces'?'Spaces':screen==='downloads'?'Downloads':'Settings'}</strong></div><div className="topbar-actions"><span className="privacy-label"><ShieldCheck size={14}/>Local-first by design</span><button className="icon-btn" aria-label="Keyboard shortcuts" onClick={()=>setModal('shortcuts')}><Command size={17}/></button><button className="icon-btn" aria-label="Toggle light and dark theme" onClick={()=>setSettings(s=>({...s,theme:document.documentElement.dataset.theme==='dark'?'light':'dark'}))}>{document.documentElement.dataset.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div></header>
      {!nativeAndroid&&<TabBar workspace={tabs} onNew={newTab} onManage={()=>setModal('tabs')} onClose={closeTab}/>}
      {!online&&<div className="offline-banner" role="status"><WifiOff size={15}/>You're offline. Smart tools and saved spaces still work.</div>}
      <main id="workspace-page" className={`main-content ${screen==='home'?'home-content':''}`}>
        {screen==='home'&&<>
          <section className="hero">
            <div className="hero-badge"><span/>LESS NOISE. MORE DISCOVERY.<ArrowUpRight size={12}/></div>
            <h1>A little curiosity.<br/>A world of <span>possibility.</span></h1>
            <p className="hero-subtitle">One beautiful place to search, explore, and keep what matters.</p>
            {nativeAndroid?<p className="native-search-hint">Search or enter a website in the address bar above.</p>:searchBox()}{unifiedBadge()}
            <div className="search-caption"><ShieldCheck size={12}/><span>No account. No tracking. Just you and the web.</span></div>
          </section>
          <section className="home-lower">
            <div className="section-heading"><h2>Your shortcuts<span>A faster way there</span></h2><span className="section-small">THE INTERNET, A LITTLE CLOSER</span></div>
            <div className="shortcut-grid">{[
              {label:'YouTube',sub:'Something to watch',letter:'▶',color:'#EF514E',bg:'#FFF0EE',url:'https://youtube.com'},
              {label:'Wikipedia',sub:'Follow your curiosity',letter:'W',color:'#64616D',bg:'#F0EEEF',url:'https://wikipedia.org'},
              {label:'GitHub',sub:'Build something great',letter:'⌘',color:'#5B6ACF',bg:'#EEF0FD',url:'https://github.com'},
              {label:'Reddit',sub:'Find your people',letter:'r',color:'#F16B3C',bg:'#FFF2E9',url:'https://reddit.com'},
            ].map(s=><button className="shortcut-card" key={s.label} onClick={()=>open(s.url)}><span className="shortcut-logo" style={{color:s.color,background:s.bg}}>{s.letter}</span><ArrowUpRight className="shortcut-arrow" size={16}/><strong>{s.label}</strong><small>{s.sub}</small></button>)}</div>
            <div className="home-columns">
              <section className="recent-section"><div className="section-heading"><h2>Pick up where you left off</h2>{recents.length>0&&<button className="text-btn" onClick={()=>setRecents([])}>Clear</button>}</div>
                {settings.showRecents&&recents.length>0?<div className="recent-list">{recents.slice(0,4).map(r=><div className="recent-row" key={r.id}><button onClick={()=>search(r.query,r.engine)}><Clock3 size={17}/><span>{r.query}<small>Unified search · {new Date(r.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></span><ArrowUpRight size={16}/></button><button className="tiny-btn delete-recent" aria-label={`Remove ${r.query} from history`} onClick={()=>setRecents(rs=>rs.filter(x=>x.id!==r.id))}><X size={13}/></button></div>)}</div>:<div className="recents-empty"><Clock3 size={21}/><p>{settings.showRecents?'Your next discovery starts here.':'A clean slate, every time.'}<span>{settings.showRecents?'Recent searches will appear here, only on this device.':'Recent searches are turned off in Settings.'}</span></p></div>}
              </section>
              <section className="discovery-card"><div className="discovery-top"><span className="sparkle-box"><Sparkles size={21}/></span><span className="pill">A LITTLE SMARTER</span></div><h3>Your search box.<br/>With a few superpowers.</h3><p>Calculate, convert, or jump straight to a site. All without missing a beat.</p><button onClick={()=>go('smart')}>Meet smart tools<ArrowRight size={16}/></button><span className="decor-orbit orbit-one"/><span className="decor-orbit orbit-two"/></section>
            </div>
            <div className="home-foot"><span><Zap size={13}/>Built for your flow.</span><span>Fast search. Open possibilities.<span className="tiny-star">✳</span></span></div>
          </section>
        </>}

        {screen==='results'&&<div className="results-page">
          {nativeAndroid?<div className="native-search-summary"><h1>{submitted?`Results for “${submitted}”`:'Search results'}</h1><p>Use the address bar above to change your search.</p></div>:<div className="results-search"><button className="icon-btn" aria-label="Back to search" onClick={()=>go('home')}><ArrowLeft size={20}/></button>{searchBox(true)}</div>}{unifiedBadge()}
          <div className="results-meta"><span>{knowledgeStatus==='loading'?'Gathering available sources…':`${knowledge.length} selected results${searchData?.websiteCount!==undefined?` · ${searchData.websiteCount} website links`:''}`}</span><span><Zap size={12}/>Combined. Deduplicated. Ranked.</span></div>
          <div className="fusion-header"><span className="fusion-icon"><Layers size={23}/></span><div><span className="eyebrow">LOXIRO UNIFIED SEARCH</span><h2>A better view of the web.</h2><p>Websites and supporting references, together. Available website matches lead the feed; duplicate links disappear and reference pages cannot crowd them out.</p></div></div>
          {searchData?.limitedWebCoverage&&<div className="coverage-notice" role="status"><AlertCircle size={17}/><div><p><strong>Limited coverage right now.</strong> {searchData.webSearchConfigured?'The connected web-search services returned no website matches. Available directory and specialist links still appear below.':'General web search is not connected. Available website links come from directories and specialist sources—not a complete web index.'}</p>{!searchData.webSearchConfigured&&<details className="web-setup-details"><summary>Enable broader website search</summary><p>Add one server-only key: <code>TAVILY_API_KEY</code>, <code>SERPAPI_API_KEY</code>, or <code>ZENSERP_API_KEY</code>, then redeploy. These services offer limited free plans that require your own account. Keep keys out of chat and client code.</p><a href="https://vercel.com/flux-cf70/loxiro-preview/settings/environment-variables" target="_blank" rel="noopener noreferrer">Open secure environment settings<ArrowUpRight size={13}/></a></details>}</div></div>}

          {(()=>{const a=analyze(submitted,engine);return a.value&&['calculation','conversion','color','time'].includes(a.intent)?<div className="answer-card"><div className="eyebrow"><Sparkles size={14}/>{a.headline} · ON DEVICE</div><p>{a.detail}</p><div className="answer-value">{a.intent==='color'&&<span className="color-inline" style={{background:a.value}}/>}{a.value}</div><button className="text-btn" onClick={()=>copy(a.value!)}><Copy size={14}/>Copy answer</button></div>:null;})()}
          <div className="results-grid"><section><div className="section-heading"><h2>Selected for your search</h2><span className="source-label">{searchData?`${searchData.providers.filter(p=>p.status==='ok'&&p.count>0).length} CONTRIBUTING SOURCES`:'UNIFIED FEED'}</span></div>
            {knowledgeStatus==='loading'?<div aria-live="polite" aria-label="Loading combined search results">{[1,2,3].map(n=><div key={n} className="result-skeleton"><span/><span/><span/></div>)}</div>:knowledge.length?<div className="knowledge-list">{knowledge.map(k=><article className="knowledge-result" key={k.url}><div className="result-source"><SiteIcon url={k.url}/><span>{k.domain}<small>{k.sources.join(' + ')}</small></span><button className="icon-btn" aria-label={`Save ${k.title}`} onClick={()=>prepareSave(k.url,k.title)}><Bookmark size={16}/></button></div><a href={k.url} target={settings.openInNewTab?'_blank':undefined} rel="noopener noreferrer">{k.title}<ArrowUpRight size={17}/></a><p>{k.extract||'Open the source to explore this result.'}</p><div className="rank-reason"><span className="result-kind">{(k.kind==='reference'||(!k.kind&&/(?:^|\.)(?:wikipedia\.org|wikidata\.org)$/.test(k.domain)))?'Reference':'Website'}</span><Sparkles size={11}/><span>{k.reason}</span></div></article>)}</div>:<div className="empty-state compact-empty"><Globe2 size={27}/><h3>{knowledgeStatus==='error'?'Search is unavailable':searchData?.providers.every(p=>p.status!=='ok')?'Sources couldn’t be reached':'No matches from the available sources'}</h3><p>{knowledgeStatus==='error'?searchError:searchData?.providers.every(p=>p.status!=='ok')?'No source returned a successful response. Try again in a moment.':'Try a broader query. Unconnected web providers cannot contribute results yet.'}</p><button className="secondary-btn" onClick={()=>setSearchAttempt(n=>n+1)}><RefreshCw size={15}/>Try again</button></div>}
          </section><aside className="results-aside"><div className="section-heading"><h2>Behind your results</h2></div><p className="source-routing-note">Relevant sources run together automatically. Unrelated sources stay idle; no provider picking.</p><div className="provider-status-list">{knowledgeStatus==='loading'?<p>Checking sources in parallel…</p>:searchData?searchData.providers.filter(p=>p.status!=='skipped'&&p.access!=='paid-key').map(p=><div key={p.id}><span className={`provider-state-dot ${p.status==='ok'?'connected':''}`}/><span><strong>{p.name}</strong><small>{providerMessage(p)}</small></span></div>):<p>No source status available.</p>}</div><div className="privacy-note"><ShieldCheck size={20}/><strong>How “best” is picked.</strong><p>Provider ranking and cross-source agreement come first, with a small query-match boost and domain diversity. Ranking is a relevance heuristic, not a guarantee of accuracy.</p><p>Queries go only to sources selected for relevance. Results are cached in server memory for up to 60 seconds; the search server does not write history to disk. Open tabs and recent searches are saved locally on this device. Providers and hosting may log requests. Website icons load from DuckDuckGo’s icon service using only the site hostname, without the search text or page URL.</p></div></aside></div>
          {searchData&&<details className="mobile-source-details"><summary>Sources & ranking</summary><p>Sources are selected automatically for relevance; no search is sent to skipped sources.</p>{searchData.providers.map(p=><p key={p.id}><strong>{p.name}</strong> — {providerMessage(p)}</p>)}<p>Ranked by provider position, agreement, query match, and domain diversity. Rankings are not accuracy guarantees.</p></details>}
          <section className="related"><h2>Follow the thread</h2><div>{relatedSearches(submitted).map(q=><button key={q} onClick={()=>search(q)}><Search size={15}/>{q}<ArrowUpRight size={15}/></button>)}</div></section>
        </div>}

        {screen==='smart'&&<>
          {pageHeading('A LITTLE EXTRA CAPABILITY','Small tools. Big flow.','Useful little things, done instantly on your device.')}
          <div className="tool-tabs" role="tablist" aria-label="Smart tools">{[{id:'calculator',label:'Calculator',icon:Calculator},{id:'converter',label:'Converter',icon:ArrowLeftRight},{id:'color',label:'Color studio',icon:Palette},{id:'text',label:'Text tools',icon:Type}].map(t=><button key={t.id} role="tab" aria-selected={tool===t.id} onClick={()=>setTool(t.id)} className={tool===t.id?'active':''}><t.icon size={17}/>{t.label}</button>)}</div>
          <section className="tool-workspace" role="tabpanel">
            <div className="tool-header"><span className="tool-icon">{tool==='calculator'?<Calculator/>:tool==='converter'?<ArrowLeftRight/>:tool==='color'?<Palette/>:<Type/>}</span><div><h2>{tool==='calculator'?'A thought, calculated.':tool==='converter'?'From one thing to another.':tool==='color'?'A color worth keeping.':'Words, with a little clarity.'}</h2><p>{tool==='calculator'?'Arithmetic, powers, parentheses, and functions. No network needed.':tool==='converter'?'Length, mass, data, time, speed, volume, and temperature.':tool==='color'?'Explore HEX, RGB, HSL, and accessible text colors.':'Count, transform, and take your text with you.'}</p></div><span className="local-chip"><ShieldCheck size={12}/>On device</span></div>
            {tool==='calculator'&&<><label className="field-label" htmlFor="calculation">YOUR EXPRESSION</label><div className="tool-input-wrap"><input id="calculation" className="tool-input mono" placeholder="(128 + 64) / 3" value={toolInput} onChange={e=>setToolInput(e.target.value)}/><span>=</span></div><div className="calculation-result"><small>THE ANSWER</small><strong>{calculate(toolInput)!==null?formatNumber(calculate(toolInput)!):'—'}</strong><button className="icon-btn" disabled={calculate(toolInput)===null} aria-label="Copy calculation result" onClick={()=>copy(formatNumber(calculate(toolInput)!))}><Copy size={18}/></button></div><div className="example-chips">{['sqrt(1764)','(128 + 64) / 3','2 ^ 16','sin(pi / 2)','15 * 24 + 380'].map(s=><button key={s} onClick={()=>setToolInput(s)}>{s}</button>)}</div><p className="tool-note">Functions: sqrt, abs, sin, cos, tan, log, ln, round, min, max, pow. Trigonometry uses radians; % is remainder.</p></>}
            {tool==='converter'&&<><label className="field-label" htmlFor="conversion">WHAT WOULD YOU LIKE TO CONVERT?</label><input id="conversion" className="tool-input" value={convertInput} onChange={e=>setConvertInput(e.target.value)} placeholder="100 km to mi"/><div className="calculation-result"><small>{convert(convertInput)?.from||'RESULT'}</small><strong>{convert(convertInput)?.value||'—'}</strong><button className="icon-btn" disabled={!convert(convertInput)} aria-label="Copy conversion" onClick={()=>copy(convert(convertInput)!.value)}><Copy size={18}/></button></div><div className="example-chips">{['100 km to mi','72 f to c','1 gb to mb','10 kg to lb','48 hours to days','5 l to gal'].map(s=><button key={s} onClick={()=>setConvertInput(s)}>{s}</button>)}</div></>}
            {tool==='color'&&(()=>{const c=parseColor(colorInput);return <><div className="color-controls"><input type="color" aria-label="Choose color" value={c?.hex||'#3B5BFF'} onChange={e=>setColorInput(e.target.value)}/><input className="tool-input mono" aria-label="Hex color" value={colorInput} onChange={e=>setColorInput(e.target.value)} placeholder="#3B5BFF" maxLength={7}/></div>{c?<><div className="color-swatch" style={{background:c.hex,color:c.suggestedText}}><span>A little color.<br/>A lot of possibility.</span><small>{c.hex}</small></div><div className="color-values">{[c.hex,c.rgb,c.hsl].map(v=><button key={v} onClick={()=>copy(v)}>{v}<Copy size={14}/></button>)}</div><p className="tool-note">Relative luminance {c.luminance}. Suggested text: {c.suggestedText}. This is a luminance heuristic, not a WCAG compliance certification.</p></>:<p className="form-error">Enter a 3- or 6-digit HEX color.</p>}</>;})()}
            {tool==='text'&&<><label htmlFor="text-tool" className="field-label">YOUR WORDS</label><textarea id="text-tool" className="text-tool" placeholder="A good idea starts with a few words…" value={textInput} onChange={e=>setTextInput(e.target.value)}/><div className="text-stats">{Object.entries(textStats(textInput)).filter(([k])=>['words','chars','lines','minutes'].includes(k)).map(([k,v])=><div key={k}><strong>{v}</strong><small>{k==='chars'?'Characters':k==='minutes'?'Min. read':k}</small></div>)}</div><div className="example-chips"><button onClick={()=>setTextInput(s=>s.toUpperCase())}>UPPERCASE</button><button onClick={()=>setTextInput(s=>s.toLowerCase())}>lowercase</button><button onClick={()=>setTextInput(s=>s.replace(/\b\w/g,c=>c.toUpperCase()))}>Title Case</button><button onClick={()=>setTextInput(s=>s.trim().replace(/[ \t]+/g,' '))}>Clean spaces</button><button onClick={()=>copy(textInput)}><Copy size={13}/>Copy</button><button disabled={nativeAndroid} title={nativeAndroid?"Blob exports are web-only in this preview":undefined} onClick={()=>saveBlob(new Blob([textInput],{type:'text/plain'}),'loxiro-note.txt')}><Download size={13}/>Export .txt</button></div></>}
          </section>
          <section className="bang-section"><div className="section-heading"><h2>Go straight to the good stuff<span>Type a shortcut before your search.</span></h2><span className="pill">BANG SHORTCUTS</span></div><div className="bang-grid">{BANGS.map(b=><button key={b.key} onClick={()=>{go('home');setQuery(`${b.label} `);setTimeout(()=>searchRef.current?.focus(),30);}}><code>{b.label}</code><span>{b.description}</span><ArrowUpRight size={14}/></button>)}</div></section>
        </>}

        {screen==='spaces'&&<>
          {pageHeading('A HOME FOR GOOD FINDS','Keep your corner of the web.','Save what sparks something. Come back when the time is right.',<button className="primary-btn" onClick={()=>prepareSave()}><Plus size={17}/>Save a link</button>)}
          <div className="spaces-toolbar"><div className="space-tabs"><button className={activeSpace==='all'?'active':''} onClick={()=>setActiveSpace('all')}>All links <span>{saved.length}</span></button>{spaces.map(s=><button key={s.id} className={activeSpace===s.id?'active':''} onClick={()=>setActiveSpace(s.id)}><span className="space-dot" style={{background:s.color}}/>{s.name}<span>{saved.filter(x=>x.spaceId===s.id).length}</span></button>)}<button className="new-space-tab" aria-label="New space" onClick={()=>setModal('space')}><Plus size={18}/></button></div><label className="filter-input"><Search size={16}/><input placeholder="Find a saved link" aria-label="Filter saved links" value={savedFilter} onChange={e=>setSavedFilter(e.target.value)}/></label></div>
          {(()=>{const links=saved.filter(s=>(activeSpace==='all'||s.spaceId===activeSpace)&&`${s.title} ${s.url}`.toLowerCase().includes(savedFilter.toLowerCase()));return links.length?<div className="saved-grid">{links.map(s=><article className="saved-card" key={s.id}><div className="saved-card-top"><span className="saved-domain-icon">{new URL(s.url).hostname.replace(/^www\./,'')[0].toUpperCase()}</span><button className="icon-btn" aria-label={`Remove ${s.title}`} onClick={()=>{setSaved(xs=>xs.filter(x=>x.id!==s.id));setToast('Link removed.');}}><Trash2 size={15}/></button></div><a href={s.url} target={settings.openInNewTab?'_blank':undefined} rel="noopener noreferrer"><h3>{s.title}</h3><span>{new URL(s.url).hostname.replace(/^www\./,'')}<ArrowUpRight size={15}/></span></a><div className="saved-card-bottom"><span className="space-dot" style={{background:spaces.find(x=>x.id===s.spaceId)?.color}}/>{spaces.find(x=>x.id===s.spaceId)?.name}<button className="tiny-btn" aria-label={`Copy ${s.title} link`} onClick={()=>copy(s.url)}><Copy size={13}/></button></div></article>)}</div>:<div className="empty-state"><div className="empty-illustration"><Layers size={37} strokeWidth={1.3}/><span><Bookmark size={17}/></span></div><span className="eyebrow">ROOM FOR YOUR NEXT DISCOVERY</span><h2>{savedFilter?'Nothing by that name.':'Good finds deserve a home.'}</h2><p>{savedFilter?'Try another title or address.':'Articles for later. Ideas for someday. That one thing you don’t want to lose. Keep them all here.'}</p><button className="primary-btn" onClick={()=>prepareSave()}><Plus size={16}/>Save your first link</button><small>Private, local, and always yours.</small></div>;})()}
          {activeSpace!=='all'&&activeSpace!=='inbox'&&<button className="text-btn danger-text" onClick={()=>{if(confirm('Delete this space? Its saved links will move to Reading list.')){setSaved(s=>s.map(x=>x.spaceId===activeSpace?{...x,spaceId:'inbox'}:x));setSpaces(s=>s.filter(x=>x.id!==activeSpace));setActiveSpace('all');}}}><Trash2 size={14}/>Delete this space</button>}
        </>}

        {screen==='downloads'&&(nativeAndroid?<>
          {pageHeading('ANDROID BROWSER PREVIEW','Downloads, handled by Android','Confirm a direct file link, then follow it in Android’s download manager.',<button className="primary-btn" onClick={()=>setModal('download')}><Plus size={17}/>New download</button>)}
          <div className="empty-state"><Download size={38}/><h2>Your files. Your device.</h2><p>Use the native toolbar’s ⋮ menu → Android downloads to view progress and completed files.</p><button className="secondary-btn" onClick={()=>setModal('download')}><Link2 size={16}/>Add a file URL</button></div>
          <div className="download-disclaimer"><ShieldCheck size={21}/><div><strong>Native preview limits</strong><p>Direct HTTP(S) file downloads use Android’s system downloader after confirmation. The web app’s multipart downloader, blob exports, and session-authenticated downloads are not supported here yet. Some links open a page rather than a downloadable file. Use your external browser for unsupported sources.</p></div></div>
        </>:<>
          {pageHeading('LESS WAITING. MORE DOING.','Your next download, in flow.','One file. Multiple lanes. Real progress, straight from the source.',<button className="primary-btn" onClick={()=>setModal('download')}><Plus size={17}/>New download</button>)}
          <div className="download-smart-panel"><div><span className="overview-icon peach"><Zap size={22}/></span><div><strong>Smart parallel download</strong><p>Split compatible files into byte ranges. Use fewer parts for small files. Fall back safely when needed.</p></div></div><label className="parts-select">Parts per file<select aria-label="Parts per file" value={settings.downloadParts} onChange={e=>setSettings(s=>({...s,downloadParts:Number(e.target.value)}))}>{[8,16,32,1].map(n=><option key={n} value={n}>{n===1?'1 · single stream':`Up to ${n} parts${n===8?' · recommended':''}`}</option>)}</select></label></div>
          <div className="download-overview"><div><span className="overview-icon"><Download size={21}/></span><span><strong>{activeDownloads}</strong><small>In your queue</small></span></div><div><span className="overview-icon green"><CheckCircle2 size={21}/></span><span><strong>{downloads.tasks.filter(t=>t.status==='done').length}</strong><small>Completed</small></span></div><div><span className="overview-icon peach"><Zap size={21}/></span><span><strong>{formatBytes(downloads.tasks.reduce((n,t)=>n+t.speed,0))}<em>/s</em></strong><small>Current transfer speed</small></span></div></div>
          <div className="section-heading"><h2>Transfer activity<span>Files save to your browser’s download folder.</span></h2>{downloads.tasks.length>0&&<button className="text-btn" onClick={downloads.clear}>Clear finished</button>}</div>
          {downloads.tasks.length?<div className="download-list">{downloads.tasks.map(t=><article key={t.id} className="download-row"><span className={`file-icon ${t.status==='done'?'done':''}`}>{t.status==='done'?<Check size={21}/>:t.status==='error'?<AlertCircle size={21}/>:<FileDown size={21}/>}</span><div className="download-info"><strong>{t.filename}</strong><small>{new URL(t.url).hostname} <span>· {t.status==='done'?`Saved to browser${t.mode==='parallel'?` · ${t.parts} parts`:''}`:t.status==='downloading'?`${formatBytes(t.received)}${t.total?' / '+formatBytes(t.total):''} · ${formatBytes(t.speed)}/s`:t.status}</span></small>{t.status==='downloading'&&<div className={`progress ${!t.total?'indeterminate':''}`} role="progressbar" aria-label={`Downloading ${t.filename}`} aria-valuenow={t.total?Math.min(100,Math.round(t.received/t.total*100)):undefined} aria-valuemin={0} aria-valuemax={100}><span style={{width:t.total?`${Math.min(100,t.received/t.total*100)}%`:'30%'}}/></div>}{t.mode&&['downloading','done'].includes(t.status)&&<div className="transfer-detail"><span className={`transfer-mode ${t.mode}`}><Zap size={12}/>{t.mode==='checking'?'Checking source':t.mode==='parallel'?`${t.completedParts || 0}/${t.parts} parts complete`:'Single connection'}</span><span>{t.transferNote}</span></div>}{t.error&&<p className="download-error">{t.error}</p>}</div><div className="download-actions">{['downloading','queued'].includes(t.status)?<button className="icon-btn" aria-label={`Cancel ${t.filename}`} onClick={()=>downloads.cancel(t.id)}><X size={17}/></button>:t.status!=='done'?<button className="icon-btn" aria-label={`Retry ${t.filename}`} onClick={()=>downloads.retry(t.id)}><RefreshCw size={17}/></button>:null}<button className="icon-btn" aria-label={`Open source for ${t.filename}`} onClick={()=>open(t.url)}><ExternalLink size={17}/></button></div></article>)}</div>:<div className="empty-state download-empty"><div className="empty-illustration"><Download size={38} strokeWidth={1.3}/><span><Zap size={17}/></span></div><h2>Ready when you are.</h2><p>Add a direct file link and let Loxiro handle the queue. Progress stays clear. Your flow stays uninterrupted.</p><button className="secondary-btn" onClick={()=>setModal('download')}><Link2 size={16}/>Add a file URL</button><button className="text-btn" onClick={()=>{if(nativeAndroid){open(`${location.origin}/docs/loxiro-concept.png`);return;}downloads.add(`${location.origin}/docs/loxiro-concept.png`,'loxiro-concept.png');setToast('Example download added.');}}>Try it with the Loxiro concept<ArrowDownIcon/></button></div>}
          <div className="download-disclaimer"><ShieldCheck size={21}/><div><strong>Direct, not magic.</strong><p>Loxiro uses up to {settings.downloadParts} parts per file, with a shared 32-request budget across the queue. Browser connection limits also apply. More parts do not guarantee more speed. Parallel mode needs byte ranges, a strong ETag, and CORS access to response headers (Content-Range and ETag) plus permission for Range / If-Range requests. Unsupported sources use one connection; CORS-blocked sources need “Open source.” Files are buffered in memory: maximum 200 MB each. Keep Loxiro open.</p></div></div>
        </>)}

        {screen==='settings'&&<>
          {pageHeading('MAKE YOURSELF AT HOME','A little more you.','Thoughtful defaults. Just enough control.')}
          <div className="settings-layout"><section className="settings-card"><h2><Palette size={17}/>Appearance</h2><div className="setting-row"><div><strong>Your kind of light</strong><p>A calm palette, day or night.</p></div><div className="segmented">{[{id:'light',icon:Sun},{id:'dark',icon:Moon},{id:'system',icon:Monitor}].map(t=><button key={t.id} aria-label={`${t.id} theme`} aria-pressed={settings.theme===t.id} className={settings.theme===t.id?'active':''} onClick={()=>setSettings(s=>({...s,theme:t.id as Settings['theme']}))}><t.icon size={17}/><span>{t.id}</span></button>)}</div></div><Toggle title="Reduce motion" description="Keep things still and simple." checked={settings.reduceMotion} onChange={v=>setSettings(s=>({...s,reduceMotion:v}))}/></section>
          <section className="settings-card"><h2><Search size={17}/>Search & browsing</h2><Toggle title={nativeAndroid?"Open websites in a new native tab":"Open websites in a browser tab"} description={nativeAndroid?"Android’s compact toolbar and tab button stay visible above websites.":"External websites open in your browser, outside the Loxiro tab workspace."} checked={settings.openInNewTab} onChange={v=>setSettings(s=>({...s,openInNewTab:v}))}/><Toggle title="Remember recent searches" description="Recent-search list only. Open and closed tab queries are saved locally too." checked={settings.showRecents} onChange={v=>setSettings(s=>({...s,showRecents:v}))}/></section>
          {!nativeAndroid&&<section className="settings-card"><h2><Download size={17}/>Downloads</h2><div className="setting-row"><div><strong>Concurrent downloads</strong><p>Files at a time. Active files share a 32-request budget.</p></div><select aria-label="Concurrent downloads" value={settings.concurrency} onChange={e=>setSettings(s=>({...s,concurrency:Number(e.target.value)}))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} at a time</option>)}</select></div><div className="setting-row"><div><strong>Smart download parts</strong><p>Upper limit per file. Smaller files use fewer parts. Changes apply to new transfers.</p></div><select aria-label="Smart download parts" value={settings.downloadParts} onChange={e=>setSettings(s=>({...s,downloadParts:Number(e.target.value)}))}>{[8,16,32,1].map(n=><option key={n} value={n}>{n===1?'Single connection':`Up to ${n} parts`}</option>)}</select></div></section>}
          <section className="settings-card"><h2><ShieldCheck size={17}/>Your data</h2><div className="setting-row"><div><strong>Take it with you</strong><p>Export settings, spaces, searches, and tab sessions as JSON.</p></div><button className="secondary-btn small" disabled={nativeAndroid} title={nativeAndroid?"Blob exports are web-only in this preview":undefined} onClick={exportData}><Download size={15}/>Export</button></div><div className="setting-row"><div><strong>A fresh start</strong><p>{nativeAndroid?"Web-app data only. Clear native website tabs/cookies from Android’s ⋮ menu.":"Clear local searches, saved links, tabs, settings, and transfer history."}</p></div><button className="text-btn danger-text" onClick={()=>setModal('clear')}>{nativeAndroid?"Clear web-app data":"Clear all data"}</button></div></section>
          <section className="install-card"><span className="logo-icon"><span/></span><div><h3>A place on your home screen.</h3><p>Keep Loxiro a tap away. Install as a lightweight web app.</p></div><button className="secondary-btn" onClick={installApp}><Smartphone size={16}/>{install?'Install Loxiro':'How to install'}</button>{installHelp&&<p className="install-help">On iPhone: Safari → Share → Add to Home Screen. On Android or desktop: use your browser menu → Install app / Add to Home Screen. Installation requires HTTPS and a supported browser.</p>}</section>
          <div className="about-footer"><span className="wordmark">Loxiro<span className="wordmark-dot">.</span></span><p>A calmer corner of the internet.<br/>v0.7 · Search companion PWA, not a standalone rendering engine.</p><a href="/plan.html" target="_blank" rel="noopener noreferrer">The original plan<ArrowUpRight size={13}/></a></div></div>
        </>}
      </main>
    </div>

    <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(({id,label,icon:Icon})=><button key={id} className={screen===id||(id==='home'&&screen==='results')?'active':''} onClick={()=>go(id)}><Icon size={21}/><span>{label==='Smart tools'?'Smart':label}</span>{id==='downloads'&&activeDownloads>0&&<b>{activeDownloads}</b>}</button>)}<button className={screen==='settings'?'active':''} onClick={()=>go('settings')}><Settings2 size={21}/><span>Settings</span></button></nav>
    {toast&&<div className="toast" role="status"><CheckCircle2 size={17}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={14}/></button></div>}
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><ModalShell title={modal==='save'?'A good find, kept.':modal==='space'?'Room for something new.':modal==='download'?'Let’s get that file.':modal==='clear'?'Start with a clean slate?':modal==='tabs'?'Room for every idea.':'A few little shortcuts.'} wide={modal==='tabs'} onClose={()=>setModal(null)}>
      {modal==='tabs'&&<TabManager workspace={tabs} onNew={newTab} onSelect={id=>{tabs.activate(id);setModal(null);}} onClose={closeTab}/>}
      {modal==='save'&&<form onSubmit={addSaved}><p className="modal-description">Give that little corner of the web a home.</p><label className="form-label">Link<input autoFocus required type="text" placeholder="https://…" value={saveUrl} onChange={e=>setSaveUrl(e.target.value)}/></label><label className="form-label">Title <span>(optional)</span><input value={saveTitle} onChange={e=>setSaveTitle(e.target.value)} placeholder="Something worth coming back to" maxLength={180}/></label><label className="form-label">Space<select value={saveSpace} onChange={e=>setSaveSpace(e.target.value)}>{spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="primary-btn modal-submit"><Bookmark size={16}/>Save link</button></form>}
      {modal==='space'&&<form onSubmit={addSpace}><p className="modal-description">A collection for your ideas, interests, or next big thing.</p><label className="form-label">Name<input autoFocus required placeholder="Weekend reads, creative fuel…" value={spaceName} onChange={e=>setSpaceName(e.target.value)} maxLength={35}/></label><label className="form-label">A little color</label><div className="color-picker">{['#7A68D8','#3B5BFF','#D88959','#428C76','#D76583','#589AB4'].map(c=><button type="button" key={c} aria-label={`Choose ${c}`} aria-pressed={spaceColor===c} style={{background:c}} onClick={()=>setSpaceColor(c)}>{spaceColor===c&&<Check size={17}/>}</button>)}</div><button className="primary-btn modal-submit"><Plus size={16}/>Create space</button></form>}
      {modal==='download'&&<form onSubmit={addDownload}><p className="modal-description">{nativeAndroid?"Paste a direct HTTP(S) file URL, then confirm Android’s download prompt. The native preview uses Android’s system downloader, not multipart mode.":"Paste a direct file URL. Loxiro checks for safe parallel downloading, combines the parts, and sends the complete file to your browser’s downloads."}</p><label className="form-label">File URL<input autoFocus required type="url" placeholder="https://example.com/file.pdf" value={downloadUrl} onChange={e=>setDownloadUrl(e.target.value)}/></label>{!nativeAndroid&&<label className="form-label">Save as <span>(optional)</span><input placeholder="Leave blank to use the original filename" value={downloadName} onChange={e=>setDownloadName(e.target.value)}/></label>}<p className="tool-note">{nativeAndroid?"Keep Loxiro open until the Android prompt appears. Authenticated or blob links may require an external browser.":"Source must allow CORS. Maximum 200 MB per file. Keep Loxiro open during transfers."}</p>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="primary-btn modal-submit"><Download size={16}/>Add to queue</button></form>}
      {modal==='shortcuts'&&<><p className="modal-description">Less reaching. More doing.</p><div className="shortcut-help">{[['Focus search','⌘ / Ctrl + K'],['Focus search','/'],['Browse suggestions','↑ ↓'],['Search / select','Enter'],['Close dialog','Esc'],['New Loxiro tab','Alt + Shift + N'],['Close Loxiro tab','Alt + Shift + W'],['Reopen closed tab','Alt + Shift + T'],['Switch tab (focus tab strip)','← / → / Home / End'],['Show shortcuts','?']].filter(([label])=>!nativeAndroid||!['Focus search','Browse suggestions','Search / select','New Loxiro tab','Close Loxiro tab','Reopen closed tab','Switch tab (focus tab strip)'].includes(label)).map(([label,key],i)=><div key={i}><span>{label}</span><kbd>{key}</kbd></div>)}</div></>}
      {modal==='clear'&&<>{nativeAndroid&&<p className="tool-note">This clears web-app storage only. For native website tabs and cookies, use Android’s ⋮ menu → Clear browser data.</p>}<p className="modal-description">This removes your saved links, spaces, search history, open and recently closed tabs, download history, and settings from this device. Active transfers will stop. Downloaded files stay in your browser’s folder. This cannot be undone.</p><div className="modal-actions"><button className="secondary-btn" onClick={()=>setModal(null)}>Keep my data</button><button className="primary-btn danger-btn" onClick={()=>{downloads.cancelAll();for(const key of ['settings','recents','saved','spaces','downloads','tabs'])localStorage.removeItem(`loxiro:v2:${key}`);history.replaceState(null,'','#home');location.reload();}}>Clear everything</button></div></>}
    </ModalShell></div>}
  </div>;
}

function Toggle({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}) {return <div className="setting-row"><div><strong>{title}</strong><p>{description}</p></div><button className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={title} onClick={()=>onChange(!checked)}><span/></button></div>;}
function ArrowDownIcon(){return <Download size={13}/>;}
function ModalShell({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;const el=ref.current;const items=()=>el?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]');const first=el?.querySelector<HTMLElement>('input,textarea,select')||items()?.[0];first?.focus();const trap=(e:globalThis.KeyboardEvent)=>{if(e.key!=='Tab')return;const nodes=items();if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(!el?.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus();};},[]);
  return <div className={`modal ${wide?'wide-modal':''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><span className="modal-brand"><Sparkles size={19}/></span><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><h2 id="modal-title">{title}</h2>{children}</div>;
}
