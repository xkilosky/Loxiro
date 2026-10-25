import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Search, ArrowUpRight, ArrowRight, ArrowLeft, Sparkles, Download, Layers, Settings2,
  Plus, X, Globe2, Clock3, ChevronRight, Command, MoreHorizontal, Trash2, Check,
  Bookmark, Zap, ShieldCheck, ExternalLink, Copy, Calculator, ArrowLeftRight,
  Palette, Type, RefreshCw, FileDown, Pause, CheckCircle2, AlertCircle, WifiOff,
  Sun, Moon, Monitor, Smartphone, Keyboard, Folder, Link2, LoaderCircle, Menu,
} from 'lucide-react';
import type { EngineId, Screen, Settings, SavedLink, Space, RecentSearch, KnowledgeAnswer } from './types';
import { WEB_ENGINES, VERTICAL_ENGINES, getEngine, engineUrl } from './data/engines';
import { BANGS } from './data/bangs';
import { QUICK_EXAMPLES, SUGGESTIONS } from './data/suggestions';
import { analyze, calculate, convert, formatNumber, parseColor, textStats, relatedSearches, normalizeUrl } from './lib/smart';
import { load, persist, uid, safeUrl, saveBlob, formatBytes } from './lib/storage';
import { useDownloads } from './hooks/useDownloads';

const DEFAULTS: Settings = {theme:'system', defaultEngine:'duckduckgo', concurrency:2, openInNewTab:true, showRecents:true, reduceMotion:false, safeMode:true};
const INITIAL_SPACES: Space[] = [{id:'inbox',name:'Reading list',color:'#7A68D8',createdAt:Date.now()}];
const NAV = [
  {id:'home',label:'Search',icon:Search}, {id:'smart',label:'Smart tools',icon:Sparkles},
  {id:'spaces',label:'Spaces',icon:Layers}, {id:'downloads',label:'Downloads',icon:Download},
] as const;
type InstallEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome:string}>};

function readRoute(): {screen: Screen; q: string; engine?: EngineId} {
  const [page, params] = location.hash.slice(1).split('?');
  const p = new URLSearchParams(params); const e = p.get('engine');
  const screen = ['results','smart','spaces','downloads','settings'].includes(page) ? page as Screen : 'home';
  const engine = [...WEB_ENGINES,...VERTICAL_ENGINES].some(v=>v.id===e) ? e as EngineId : undefined;
  return {screen, q:p.get('q') || '', engine};
}

export default function App() {
  const initial = useRef(readRoute());
  const [screen,setScreen] = useState<Screen>(initial.current.screen);
  const [query,setQuery] = useState(initial.current.q);
  const [submitted,setSubmitted] = useState(initial.current.q);
  const [settings,setSettings] = useState<Settings>(()=>({...DEFAULTS,...load('settings',{})}));
  const [engine,setEngine] = useState<EngineId>(initial.current.engine || settings.defaultEngine);
  const [recents,setRecents] = useState<RecentSearch[]>(()=>load('recents',[]));
  const [saved,setSaved] = useState<SavedLink[]>(()=>load('saved',[]));
  const [spaces,setSpaces] = useState<Space[]>(()=>load('spaces',INITIAL_SPACES));
  const [toast,setToast] = useState('');
  const [modal,setModal] = useState<'save'|'space'|'download'|'shortcuts'|'clear'|null>(null);
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
  const [knowledge,setKnowledge] = useState<KnowledgeAnswer[]>([]);
  const [knowledgeStatus,setKnowledgeStatus] = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [tool,setTool] = useState('calculator'); const [toolInput,setToolInput] = useState('');
  const [convertInput,setConvertInput] = useState('100 km to mi');
  const [colorInput,setColorInput] = useState('#3B5BFF'); const [textInput,setTextInput] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const downloads = useDownloads(settings.concurrency);
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
    const change=()=>{const r=readRoute();setScreen(r.screen);setQuery(r.q);setSubmitted(r.q);if(r.engine)setEngine(r.engine);setFocused(false);};
    window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);
  },[]);
  useEffect(()=>{
    const key=(e:globalThis.KeyboardEvent)=>{
      const typing=['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName);
      if ((e.key==='k'&&(e.ctrlKey||e.metaKey))||(!typing&&e.key==='/')) {e.preventDefault();go('home');setTimeout(()=>searchRef.current?.focus(),20);}
      if (e.key==='Escape') {setModal(null);setFocused(false);searchRef.current?.blur();}
      if (!typing && e.key==='?') setModal('shortcuts');
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });
  useEffect(()=>{setFormError('');},[modal]);

  // A public, real knowledge source. We never scrape or fabricate engine results.
  useEffect(()=>{
    if(screen!=='results'||!submitted.trim())return;
    const controller=new AbortController();setKnowledge([]);setKnowledgeStatus('loading');
    const timer=setTimeout(()=>controller.abort(),10000);
    const clean=analyze(submitted,engine).cleanQuery;
    const api=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(clean)}&gsrlimit=5&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&piprop=thumbnail&pithumbsize=100&format=json&origin=*`;
    fetch(api,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{
      if(controller.signal.aborted)return;
      const pages=Object.values(data.query?.pages||{}) as {title:string;extract:string;pageid:number;index:number;thumbnail?:{source:string}}[];
      setKnowledge(pages.sort((a,b)=>a.index-b.index).map(p=>({title:p.title,extract:p.extract,url:`https://en.wikipedia.org/?curid=${p.pageid}`,source:'Wikipedia',thumbnail:p.thumbnail?.source})));
      setKnowledgeStatus('done');
    }).catch(()=>{if(!controller.signal.aborted)setKnowledgeStatus('error');else if(!disposed)setKnowledgeStatus('error');}).finally(()=>clearTimeout(timer));
    let disposed=false;
    return()=>{disposed=true;clearTimeout(timer);controller.abort();};
  },[screen,submitted]);

  function go(next:Screen,q='',e=engine) {
    setScreen(next);setFocused(false);setSuggestionIndex(-1);
    const params=new URLSearchParams();if(q){params.set('q',q);params.set('engine',e);}
    location.hash=next==='home'?'home':`${next}${q?'?'+params:''}`;
  }
  function open(url:string) {const safe=safeUrl(url);if(!safe){setToast('Only HTTP and HTTPS links are supported.');return;}if(settings.openInNewTab)window.open(safe,'_blank','noopener,noreferrer');else location.assign(safe);}
  function search(q=query,e=engine) {
    q=q.trim();if(!q)return;
    const a=analyze(q,e);
    if(a.intent==='url'&&a.url){open(a.url);remember(q,e);return;}
    const chosen=a.bang?a.engine:e;
    remember(q,chosen);setQuery(q);setSubmitted(q);setEngine(chosen);go('results',q,chosen);searchRef.current?.blur();
  }
  function remember(q:string,e:EngineId){if(settings.showRecents)setRecents(rs=>[{id:uid(),query:q,engine:e,createdAt:Date.now()},...rs.filter(r=>r.query!==q)].slice(0,40));}
  function switchEngine(e:EngineId){setEngine(e);if(screen==='results'){const p=new URLSearchParams({q:submitted,engine:e});history.replaceState(null,'',`#results?${p}`);}}
  function prepareSave(url='',title=''){setSaveUrl(url);setSaveTitle(title);setSaveSpace(activeSpace==='all'?'inbox':activeSpace);setModal('save');}
  function addSaved(e:FormEvent){e.preventDefault();const url=safeUrl(saveUrl.trim())||normalizeUrl(saveUrl.trim());if(!url){setFormError('Enter a valid http:// or https:// address.');return;}if(saved.some(s=>s.url===url)){setFormError('This link is already in your Spaces.');return;}setSaved(s=>[{id:uid(),url,title:saveTitle.trim()||new URL(url).hostname,spaceId:saveSpace,createdAt:Date.now()},...s]);setModal(null);setToast('Saved to your space.');}
  function addSpace(e:FormEvent){e.preventDefault();if(!spaceName.trim())return;const id=uid();setSpaces(s=>[...s,{id,name:spaceName.trim(),color:spaceColor,createdAt:Date.now()}]);setActiveSpace(id);setSpaceName('');setModal(null);}
  async function copy(text:string){try{await navigator.clipboard.writeText(text);setToast('Copied to clipboard.');}catch{setToast('Clipboard unavailable. Select and copy the text manually.');}}
  function exportData(){saveBlob(new Blob([JSON.stringify({settings,spaces,saved,recents,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),'loxiro-backup.json');setToast('Backup saved.');}
  function addDownload(e:FormEvent){e.preventDefault();if(!downloads.add(downloadUrl.trim(),downloadName)){setFormError('Enter a valid HTTP or HTTPS file URL.');return;}setModal(null);setDownloadUrl('');setDownloadName('');setToast('Added to the download queue.');}
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
        placeholder="Search anything, or enter a URL" aria-label="Search the web or enter a URL" autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={focused&&suggestions.length>0} aria-controls="suggestions" aria-activedescendant={suggestionIndex>=0?`suggestion-${suggestionIndex}`:undefined}/>
      {query&&<button type="button" className="icon-btn clear-search" aria-label="Clear search" onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={17}/></button>}
      {!query&&<kbd className="search-key">⌘ K</kbd>}
      <button className="search-submit" aria-label="Search"><ArrowRight size={21}/></button>
    </form>
    {focused&&suggestions.length>0&&<div className="suggestions" id="suggestions" role="listbox">{suggestions.map((s,i)=><button id={`suggestion-${i}`} key={s} type="button" role="option" aria-selected={suggestionIndex===i} className={suggestionIndex===i?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(bangSuggestions.length){setQuery(s);setSuggestionIndex(-1);searchRef.current?.focus();}else search(s);}}><Search size={16}/><span>{s}{bangSuggestions.length&&<small>{bangSuggestions[i]?.description}</small>}</span><ArrowUpRight size={15}/></button>)}</div>}
    {query.trim()&&smart.value&&smart.intent!=='search'&&smart.intent!=='question'&&smart.intent!=='code'&&<button className="instant-preview" onClick={()=>smart.intent==='url'&&smart.url?open(smart.url):search()}><Sparkles size={16}/><span><small>{smart.headline}</small><strong>{smart.value}</strong></span><ArrowUpRight size={17}/></button>}
  </div>;}
  function engineChips(){return <div className="engine-chips" aria-label="Search engine">{WEB_ENGINES.map(e=><button key={e.id} aria-pressed={e.id===engine} className={`engine-chip ${engine===e.id?'active':''}`} onClick={()=>switchEngine(e.id)}><span className="engine-dot" style={{background:e.color}}/>{e.short}{engine===e.id&&<Check size={12}/>}</button>)}</div>;}
  function pageHeading(eyebrow:string,title:string,description:string,action?:React.ReactNode){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span className="title-dot">.</span></h1><p>{description}</p></div>{action}</div>;}

  return <div className="app-shell" onClick={()=>{if(focused&&document.activeElement!==searchRef.current)setFocused(false);}}>
    <aside className="sidebar">
      <button className="wordmark" onClick={()=>go('home')} aria-label="Loxiro home"><span className="logo-icon"><span/></span>Loxiro<span className="wordmark-dot">.</span></button>
      <div className="sidebar-label">YOUR EVERYDAY, REFINED</div>
      <nav className="desktop-nav" aria-label="Main navigation">{NAV.map(({id,label,icon:Icon})=><button key={id} className={(screen===id||(id==='home'&&screen==='results'))?'active':''} onClick={()=>go(id)}><Icon size={19} strokeWidth={1.8}/><span>{label}</span>{id==='downloads'&&activeDownloads>0?<b className="nav-count">{activeDownloads}</b>:id==='smart'?<span className="nav-new">NEW</span>:null}{id==='home'&&<kbd>⌘ K</kbd>}</button>)}</nav>
      <div className="sidebar-spaces"><div className="sidebar-section"><span>YOUR SPACES</span><button className="tiny-btn" aria-label="Create a space" onClick={()=>setModal('space')}><Plus size={16}/></button></div>{spaces.slice(0,5).map(s=><button key={s.id} onClick={()=>{setActiveSpace(s.id);go('spaces');}}><span className="space-dot" style={{background:s.color}}/>{s.name}<span className="quiet">{saved.filter(x=>x.spaceId===s.id).length}</span></button>)}<button className="create-space" onClick={()=>setModal('space')}><Plus size={15}/>New space</button></div>
      <div className="sidebar-bottom"><div className="local-badge"><ShieldCheck size={15}/><span>Your space. Your data.</span><span className="status-dot"/></div><button className={`settings-nav ${screen==='settings'?'active':''}`} onClick={()=>go('settings')}><Settings2 size={18}/>Settings<span className="version">v0.2</span></button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span className="mini-logo">l<span>•</span></span><span>Loxiro</span><span className="slash">/</span><strong>{screen==='home'?'Your search starts here':screen==='results'?'Search results':screen==='smart'?'Smart tools':screen==='spaces'?'Spaces':screen==='downloads'?'Downloads':'Settings'}</strong></div><div className="topbar-actions"><span className="privacy-label"><ShieldCheck size={14}/>Local-first by design</span><button className="icon-btn" aria-label="Keyboard shortcuts" onClick={()=>setModal('shortcuts')}><Command size={17}/></button><button className="icon-btn" aria-label="Toggle light and dark theme" onClick={()=>setSettings(s=>({...s,theme:document.documentElement.dataset.theme==='dark'?'light':'dark'}))}>{document.documentElement.dataset.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div></header>
      {!online&&<div className="offline-banner" role="status"><WifiOff size={15}/>You're offline. Smart tools and saved spaces still work.</div>}
      <main className={`main-content ${screen==='home'?'home-content':''}`}>
        {screen==='home'&&<>
          <section className="hero">
            <div className="hero-badge"><span/>LESS NOISE. MORE DISCOVERY.<ArrowUpRight size={12}/></div>
            <h1>A little curiosity.<br/>A world of <span>possibility.</span></h1>
            <p className="hero-subtitle">One beautiful place to search, explore, and keep what matters.</p>
            {searchBox()}{engineChips()}
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
                {settings.showRecents&&recents.length>0?<div className="recent-list">{recents.slice(0,4).map(r=><div className="recent-row" key={r.id}><button onClick={()=>search(r.query,r.engine)}><Clock3 size={17}/><span>{r.query}<small>{getEngine(r.engine).name} · {new Date(r.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></span><ArrowUpRight size={16}/></button><button className="tiny-btn delete-recent" aria-label={`Remove ${r.query} from history`} onClick={()=>setRecents(rs=>rs.filter(x=>x.id!==r.id))}><X size={13}/></button></div>)}</div>:<div className="recents-empty"><Clock3 size={21}/><p>{settings.showRecents?'Your next discovery starts here.':'A clean slate, every time.'}<span>{settings.showRecents?'Recent searches will appear here, only on this device.':'Recent searches are turned off in Settings.'}</span></p></div>}
              </section>
              <section className="discovery-card"><div className="discovery-top"><span className="sparkle-box"><Sparkles size={21}/></span><span className="pill">A LITTLE SMARTER</span></div><h3>Your search box.<br/>With a few superpowers.</h3><p>Calculate, convert, or jump straight to a site. All without missing a beat.</p><button onClick={()=>go('smart')}>Meet smart tools<ArrowRight size={16}/></button><span className="decor-orbit orbit-one"/><span className="decor-orbit orbit-two"/></section>
            </div>
            <div className="home-foot"><span><Zap size={13}/>Built for your flow.</span><span>Fast search. Open possibilities.<span className="tiny-star">✳</span></span></div>
          </section>
        </>}

        {screen==='results'&&<div className="results-page">
          <div className="results-search"><button className="icon-btn" aria-label="Back to search" onClick={()=>go('home')}><ArrowLeft size={20}/></button>{searchBox(true)}</div>{engineChips()}
          <div className="results-meta"><span>Explore the web</span><span><Zap size={12}/>One query. Every perspective.</span></div>
          <div className="engine-launch-card"><div className="large-engine" style={{color:getEngine(engine).color}}>{getEngine(engine).letter}</div><div><span className="eyebrow">YOUR CHOSEN ENGINE</span><h2>Search with {getEngine(engine).name}</h2><p>Full, live web results. Open directly — no scraping, no imitation.</p></div><button className="primary-btn" onClick={()=>open(engineUrl(engine,analyze(submitted,engine).cleanQuery))}>Open results<ArrowUpRight size={17}/></button></div>
          {(()=>{const a=analyze(submitted,engine);return a.value&&['calculation','conversion','color','time'].includes(a.intent)?<div className="answer-card"><div className="eyebrow"><Sparkles size={14}/>{a.headline} · ON DEVICE</div><p>{a.detail}</p><div className="answer-value">{a.intent==='color'&&<span className="color-inline" style={{background:a.value}}/>}{a.value}</div><button className="text-btn" onClick={()=>copy(a.value!)}><Copy size={14}/>Copy answer</button></div>:a.engine!==engine?<button className="route-tip" onClick={()=>switchEngine(a.engine)}><Sparkles size={17}/><span>{a.headline}. Try <strong>{getEngine(a.engine).name}</strong>.</span><ArrowRight size={16}/></button>:null;})()}
          <div className="results-grid"><section><div className="section-heading"><h2>Knowledge, at a glance</h2><span className="source-label">LIVE · WIKIPEDIA</span></div>
            {knowledgeStatus==='loading'?<div aria-live="polite" aria-label="Loading knowledge results">{[1,2,3].map(n=><div key={n} className="result-skeleton"><span/><span/><span/></div>)}</div>:knowledge.length?<div className="knowledge-list">{knowledge.map(k=><article className="knowledge-result" key={k.url}><div className="result-source"><span className="wiki-icon">W</span><span>Wikipedia<small>en.wikipedia.org</small></span><button className="icon-btn" aria-label={`Save ${k.title}`} onClick={()=>prepareSave(k.url,k.title)}><Bookmark size={16}/></button></div><a href={k.url} target={settings.openInNewTab?'_blank':undefined} rel="noopener noreferrer">{k.title}<ArrowUpRight size={17}/></a><p>{k.extract||'Explore this topic on Wikipedia.'}</p></article>)}</div>:<div className="empty-state compact-empty"><Globe2 size={27}/><h3>{knowledgeStatus==='error'?'Knowledge source unavailable':'No encyclopedia matches'}</h3><p>{knowledgeStatus==='error'?'We couldn’t reach Wikipedia. Your selected search engine is still one tap away.':'Try a broader topic, or open your search engine for complete web results.'}</p><button className="secondary-btn" onClick={()=>open(engineUrl(engine,submitted))}>Search the web<ArrowUpRight size={15}/></button></div>}
          </section><aside className="results-aside"><div className="section-heading"><h2>Look a little further</h2></div><div className="vertical-links">{VERTICAL_ENGINES.map(e=><button key={e.id} onClick={()=>open(engineUrl(e.id,analyze(submitted,engine).cleanQuery))}><span className="engine-dot" style={{background:e.color}}/><span>{e.name}</span><ArrowUpRight size={15}/></button>)}</div><div className="privacy-note"><ShieldCheck size={20}/><strong>A clearer kind of search.</strong><p>Searches fetch public Wikipedia summaries. Full results open at your chosen engine, which has its own privacy policy.</p></div></aside></div>
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
            {tool==='text'&&<><label htmlFor="text-tool" className="field-label">YOUR WORDS</label><textarea id="text-tool" className="text-tool" placeholder="A good idea starts with a few words…" value={textInput} onChange={e=>setTextInput(e.target.value)}/><div className="text-stats">{Object.entries(textStats(textInput)).filter(([k])=>['words','chars','lines','minutes'].includes(k)).map(([k,v])=><div key={k}><strong>{v}</strong><small>{k==='chars'?'Characters':k==='minutes'?'Min. read':k}</small></div>)}</div><div className="example-chips"><button onClick={()=>setTextInput(s=>s.toUpperCase())}>UPPERCASE</button><button onClick={()=>setTextInput(s=>s.toLowerCase())}>lowercase</button><button onClick={()=>setTextInput(s=>s.replace(/\b\w/g,c=>c.toUpperCase()))}>Title Case</button><button onClick={()=>setTextInput(s=>s.trim().replace(/[ \t]+/g,' '))}>Clean spaces</button><button onClick={()=>copy(textInput)}><Copy size={13}/>Copy</button><button onClick={()=>saveBlob(new Blob([textInput],{type:'text/plain'}),'loxiro-note.txt')}><Download size={13}/>Export .txt</button></div></>}
          </section>
          <section className="bang-section"><div className="section-heading"><h2>Go straight to the good stuff<span>Type a shortcut before your search.</span></h2><span className="pill">BANG SHORTCUTS</span></div><div className="bang-grid">{BANGS.map(b=><button key={b.key} onClick={()=>{go('home');setQuery(`${b.label} `);setTimeout(()=>searchRef.current?.focus(),30);}}><code>{b.label}</code><span>{b.description}</span><ArrowUpRight size={14}/></button>)}</div></section>
        </>}

        {screen==='spaces'&&<>
          {pageHeading('A HOME FOR GOOD FINDS','Keep your corner of the web.','Save what sparks something. Come back when the time is right.',<button className="primary-btn" onClick={()=>prepareSave()}><Plus size={17}/>Save a link</button>)}
          <div className="spaces-toolbar"><div className="space-tabs"><button className={activeSpace==='all'?'active':''} onClick={()=>setActiveSpace('all')}>All links <span>{saved.length}</span></button>{spaces.map(s=><button key={s.id} className={activeSpace===s.id?'active':''} onClick={()=>setActiveSpace(s.id)}><span className="space-dot" style={{background:s.color}}/>{s.name}<span>{saved.filter(x=>x.spaceId===s.id).length}</span></button>)}<button className="new-space-tab" aria-label="New space" onClick={()=>setModal('space')}><Plus size={18}/></button></div><label className="filter-input"><Search size={16}/><input placeholder="Find a saved link" aria-label="Filter saved links" value={savedFilter} onChange={e=>setSavedFilter(e.target.value)}/></label></div>
          {(()=>{const links=saved.filter(s=>(activeSpace==='all'||s.spaceId===activeSpace)&&`${s.title} ${s.url}`.toLowerCase().includes(savedFilter.toLowerCase()));return links.length?<div className="saved-grid">{links.map(s=><article className="saved-card" key={s.id}><div className="saved-card-top"><span className="saved-domain-icon">{new URL(s.url).hostname.replace(/^www\./,'')[0].toUpperCase()}</span><button className="icon-btn" aria-label={`Remove ${s.title}`} onClick={()=>{setSaved(xs=>xs.filter(x=>x.id!==s.id));setToast('Link removed.');}}><Trash2 size={15}/></button></div><a href={s.url} target={settings.openInNewTab?'_blank':undefined} rel="noopener noreferrer"><h3>{s.title}</h3><span>{new URL(s.url).hostname.replace(/^www\./,'')}<ArrowUpRight size={15}/></span></a><div className="saved-card-bottom"><span className="space-dot" style={{background:spaces.find(x=>x.id===s.spaceId)?.color}}/>{spaces.find(x=>x.id===s.spaceId)?.name}<button className="tiny-btn" aria-label={`Copy ${s.title} link`} onClick={()=>copy(s.url)}><Copy size={13}/></button></div></article>)}</div>:<div className="empty-state"><div className="empty-illustration"><Layers size={37} strokeWidth={1.3}/><span><Bookmark size={17}/></span></div><span className="eyebrow">ROOM FOR YOUR NEXT DISCOVERY</span><h2>{savedFilter?'Nothing by that name.':'Good finds deserve a home.'}</h2><p>{savedFilter?'Try another title or address.':'Articles for later. Ideas for someday. That one thing you don’t want to lose. Keep them all here.'}</p><button className="primary-btn" onClick={()=>prepareSave()}><Plus size={16}/>Save your first link</button><small>Private, local, and always yours.</small></div>;})()}
          {activeSpace!=='all'&&activeSpace!=='inbox'&&<button className="text-btn danger-text" onClick={()=>{if(confirm('Delete this space? Its saved links will move to Reading list.')){setSaved(s=>s.map(x=>x.spaceId===activeSpace?{...x,spaceId:'inbox'}:x));setSpaces(s=>s.filter(x=>x.id!==activeSpace));setActiveSpace('all');}}}><Trash2 size={14}/>Delete this space</button>}
        </>}

        {screen==='downloads'&&<>
          {pageHeading('LESS WAITING. MORE DOING.','Your next download, in flow.','A streamlined queue. Live progress. No unnecessary middleman.',<button className="primary-btn" onClick={()=>setModal('download')}><Plus size={17}/>New download</button>)}
          <div className="download-overview"><div><span className="overview-icon"><Download size={21}/></span><span><strong>{activeDownloads}</strong><small>In your queue</small></span></div><div><span className="overview-icon green"><CheckCircle2 size={21}/></span><span><strong>{downloads.tasks.filter(t=>t.status==='done').length}</strong><small>Completed</small></span></div><div><span className="overview-icon peach"><Zap size={21}/></span><span><strong>{formatBytes(downloads.tasks.reduce((n,t)=>n+t.speed,0))}<em>/s</em></strong><small>Current transfer speed</small></span></div></div>
          <div className="section-heading"><h2>Transfer activity<span>Files save to your browser’s download folder.</span></h2>{downloads.tasks.length>0&&<button className="text-btn" onClick={downloads.clear}>Clear finished</button>}</div>
          {downloads.tasks.length?<div className="download-list">{downloads.tasks.map(t=><article key={t.id} className="download-row"><span className={`file-icon ${t.status==='done'?'done':''}`}>{t.status==='done'?<Check size={21}/>:t.status==='error'?<AlertCircle size={21}/>:<FileDown size={21}/>}</span><div className="download-info"><strong>{t.filename}</strong><small>{new URL(t.url).hostname} <span>· {t.status==='done'?'Saved to browser':t.status==='downloading'?`${formatBytes(t.received)}${t.total?' / '+formatBytes(t.total):''} · ${formatBytes(t.speed)}/s`:t.status}</span></small>{t.status==='downloading'&&<div className={`progress ${!t.total?'indeterminate':''}`} role="progressbar" aria-label={`Downloading ${t.filename}`} aria-valuenow={t.total?Math.round(t.received/t.total*100):undefined} aria-valuemin={0} aria-valuemax={100}><span style={{width:t.total?`${t.received/t.total*100}%`:'30%'}}/></div>}{t.error&&<p className="download-error">{t.error}</p>}</div><div className="download-actions">{['downloading','queued'].includes(t.status)?<button className="icon-btn" aria-label={`Cancel ${t.filename}`} onClick={()=>downloads.cancel(t.id)}><X size={17}/></button>:t.status!=='done'?<button className="icon-btn" aria-label={`Retry ${t.filename}`} onClick={()=>downloads.retry(t.id)}><RefreshCw size={17}/></button>:null}<button className="icon-btn" aria-label={`Open source for ${t.filename}`} onClick={()=>open(t.url)}><ExternalLink size={17}/></button></div></article>)}</div>:<div className="empty-state download-empty"><div className="empty-illustration"><Download size={38} strokeWidth={1.3}/><span><Zap size={17}/></span></div><h2>Ready when you are.</h2><p>Add a direct file link and let Loxiro handle the queue. Progress stays clear. Your flow stays uninterrupted.</p><button className="secondary-btn" onClick={()=>setModal('download')}><Link2 size={16}/>Add a file URL</button><button className="text-btn" onClick={()=>{downloads.add(`${location.origin}/docs/loxiro-concept.png`,'loxiro-concept.png');setToast('Example download added.');}}>Try it with the Loxiro concept<ArrowDownIcon/></button></div>}
          <div className="download-disclaimer"><ShieldCheck size={21}/><div><strong>Direct, not magic.</strong><p>Loxiro streams files straight from their source with up to {settings.concurrency} concurrent transfers. Speed depends on your connection and the server. Sources must allow cross-origin access; for others, use “Open source.” In-app transfers are limited to 200 MB and require this app to stay open.</p></div></div>
        </>}

        {screen==='settings'&&<>
          {pageHeading('MAKE YOURSELF AT HOME','A little more you.','Thoughtful defaults. Just enough control.')}
          <div className="settings-layout"><section className="settings-card"><h2><Palette size={17}/>Appearance</h2><div className="setting-row"><div><strong>Your kind of light</strong><p>A calm palette, day or night.</p></div><div className="segmented">{[{id:'light',icon:Sun},{id:'dark',icon:Moon},{id:'system',icon:Monitor}].map(t=><button key={t.id} aria-label={`${t.id} theme`} aria-pressed={settings.theme===t.id} className={settings.theme===t.id?'active':''} onClick={()=>setSettings(s=>({...s,theme:t.id as Settings['theme']}))}><t.icon size={17}/><span>{t.id}</span></button>)}</div></div><Toggle title="Reduce motion" description="Keep things still and simple." checked={settings.reduceMotion} onChange={v=>setSettings(s=>({...s,reduceMotion:v}))}/></section>
          <section className="settings-card"><h2><Search size={17}/>Search & browsing</h2><div className="setting-row"><div><strong>Your default engine</strong><p>Where every new search begins.</p></div><select aria-label="Default search engine" value={settings.defaultEngine} onChange={e=>{const v=e.target.value as EngineId;setSettings(s=>({...s,defaultEngine:v}));setEngine(v);}}>{WEB_ENGINES.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div><Toggle title="Open links in a new tab" description="Keep Loxiro right where you left it." checked={settings.openInNewTab} onChange={v=>setSettings(s=>({...s,openInNewTab:v}))}/><Toggle title="Remember recent searches" description="Saved on this device. Never sent to us." checked={settings.showRecents} onChange={v=>setSettings(s=>({...s,showRecents:v}))}/></section>
          <section className="settings-card"><h2><Download size={17}/>Downloads</h2><div className="setting-row"><div><strong>Concurrent downloads</strong><p>Balance your queue with your connection.</p></div><select aria-label="Concurrent downloads" value={settings.concurrency} onChange={e=>setSettings(s=>({...s,concurrency:Number(e.target.value)}))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} at a time</option>)}</select></div></section>
          <section className="settings-card"><h2><ShieldCheck size={17}/>Your data</h2><div className="setting-row"><div><strong>Take it with you</strong><p>Export settings, spaces, and searches as JSON.</p></div><button className="secondary-btn small" onClick={exportData}><Download size={15}/>Export</button></div><div className="setting-row"><div><strong>A fresh start</strong><p>Clear local searches, saved links, settings, and transfer history.</p></div><button className="text-btn danger-text" onClick={()=>setModal('clear')}>Clear all data</button></div></section>
          <section className="install-card"><span className="logo-icon"><span/></span><div><h3>A place on your home screen.</h3><p>Keep Loxiro a tap away. Install as a lightweight web app.</p></div><button className="secondary-btn" onClick={installApp}><Smartphone size={16}/>{install?'Install Loxiro':'How to install'}</button>{installHelp&&<p className="install-help">On iPhone: Safari → Share → Add to Home Screen. On Android or desktop: use your browser menu → Install app / Add to Home Screen. Installation requires HTTPS and a supported browser.</p>}</section>
          <div className="about-footer"><span className="wordmark">Loxiro<span className="wordmark-dot">.</span></span><p>A calmer corner of the internet.<br/>v0.2 · Search companion PWA, not a standalone rendering engine.</p><a href="/plan.html" target="_blank" rel="noopener noreferrer">The original plan<ArrowUpRight size={13}/></a></div></div>
        </>}
      </main>
    </div>

    <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(({id,label,icon:Icon})=><button key={id} className={screen===id||(id==='home'&&screen==='results')?'active':''} onClick={()=>go(id)}><Icon size={21}/><span>{label==='Smart tools'?'Smart':label}</span>{id==='downloads'&&activeDownloads>0&&<b>{activeDownloads}</b>}</button>)}<button className={screen==='settings'?'active':''} onClick={()=>go('settings')}><Settings2 size={21}/><span>Settings</span></button></nav>
    {toast&&<div className="toast" role="status"><CheckCircle2 size={17}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={14}/></button></div>}
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><ModalShell title={modal==='save'?'A good find, kept.':modal==='space'?'Room for something new.':modal==='download'?'Let’s get that file.':modal==='clear'?'Start with a clean slate?':'A few little shortcuts.'} onClose={()=>setModal(null)}>
      {modal==='save'&&<form onSubmit={addSaved}><p className="modal-description">Give that little corner of the web a home.</p><label className="form-label">Link<input autoFocus required type="text" placeholder="https://…" value={saveUrl} onChange={e=>setSaveUrl(e.target.value)}/></label><label className="form-label">Title <span>(optional)</span><input value={saveTitle} onChange={e=>setSaveTitle(e.target.value)} placeholder="Something worth coming back to" maxLength={180}/></label><label className="form-label">Space<select value={saveSpace} onChange={e=>setSaveSpace(e.target.value)}>{spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="primary-btn modal-submit"><Bookmark size={16}/>Save link</button></form>}
      {modal==='space'&&<form onSubmit={addSpace}><p className="modal-description">A collection for your ideas, interests, or next big thing.</p><label className="form-label">Name<input autoFocus required placeholder="Weekend reads, creative fuel…" value={spaceName} onChange={e=>setSpaceName(e.target.value)} maxLength={35}/></label><label className="form-label">A little color</label><div className="color-picker">{['#7A68D8','#3B5BFF','#D88959','#428C76','#D76583','#589AB4'].map(c=><button type="button" key={c} aria-label={`Choose ${c}`} aria-pressed={spaceColor===c} style={{background:c}} onClick={()=>setSpaceColor(c)}>{spaceColor===c&&<Check size={17}/>}</button>)}</div><button className="primary-btn modal-submit"><Plus size={16}/>Create space</button></form>}
      {modal==='download'&&<form onSubmit={addDownload}><p className="modal-description">Paste a direct file URL. Loxiro will stream it to your browser’s downloads.</p><label className="form-label">File URL<input autoFocus required type="url" placeholder="https://example.com/file.pdf" value={downloadUrl} onChange={e=>setDownloadUrl(e.target.value)}/></label><label className="form-label">Save as <span>(optional)</span><input placeholder="Leave blank to use the original filename" value={downloadName} onChange={e=>setDownloadName(e.target.value)}/></label><p className="tool-note">Source must allow CORS. Maximum 200 MB per file. Keep Loxiro open during transfers.</p>{formError&&<p className="form-error" role="alert">{formError}</p>}<button className="primary-btn modal-submit"><Download size={16}/>Add to queue</button></form>}
      {modal==='shortcuts'&&<><p className="modal-description">Less reaching. More doing.</p><div className="shortcut-help">{[['Focus search','⌘ / Ctrl + K'],['Focus search','/'],['Browse suggestions','↑ ↓'],['Search / select','Enter'],['Close dialog','Esc'],['Show shortcuts','?']].map(([label,key],i)=><div key={i}><span>{label}</span><kbd>{key}</kbd></div>)}</div></>}
      {modal==='clear'&&<><p className="modal-description">This removes your saved links, spaces, search history, download history, and settings from this device. Active transfers will stop. Downloaded files stay in your browser’s folder. This cannot be undone.</p><div className="modal-actions"><button className="secondary-btn" onClick={()=>setModal(null)}>Keep my data</button><button className="primary-btn danger-btn" onClick={()=>{downloads.cancelAll();for(const key of ['settings','recents','saved','spaces','downloads'])localStorage.removeItem(`loxiro:v2:${key}`);location.hash='home';location.reload();}}>Clear everything</button></div></>}
    </ModalShell></div>}
  </div>;
}

function Toggle({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}) {return <div className="setting-row"><div><strong>{title}</strong><p>{description}</p></div><button className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={title} onClick={()=>onChange(!checked)}><span/></button></div>;}
function ArrowDownIcon(){return <Download size={13}/>;}
function ModalShell({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;const el=ref.current;const items=()=>el?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]');const first=el?.querySelector<HTMLElement>('[autofocus]')||items()?.[0];first?.focus();const trap=(e:globalThis.KeyboardEvent)=>{if(e.key!=='Tab')return;const nodes=items();if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus();};},[]);
  return <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><span className="modal-brand"><Sparkles size={19}/></span><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><h2 id="modal-title">{title}</h2>{children}</div>;
}
