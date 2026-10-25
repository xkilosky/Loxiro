import { createHash } from 'node:crypto';
import { rankResults } from './rank.mjs';

const buckets=new Map();
function allow(ip) {
  const key=createHash('sha256').update(ip).digest('hex').slice(0,20);
  const now=Date.now();
  for(const [k,b] of buckets) if(now-b.start>60000)buckets.delete(k);
  if(buckets.size>2000)return false;
  const b=buckets.get(key)||{start:now,count:0};b.count++;buckets.set(key,b);
  return b.count<=12;
}
async function json(url, options={}) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(5500),headers:{'User-Agent':'Loxiro/0.3 (+https://github.com/xkilosky/Loxiro)',...options.headers}});
  if(!r.ok) throw new Error('Provider unavailable');
  return r.json();
}
const PROVIDERS=[
  {id:'google',label:'Google (via Serper)',kind:'web',key:'SERPER_API_KEY',async run(q,env){
    const data=await json('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q,num:10})});
    return (data.organic||[]).map(r=>({title:r.title,url:r.link,extract:r.snippet}));
  }},
  {id:'brave',label:'Brave Search',kind:'web',key:'BRAVE_SEARCH_API_KEY',async run(q,env){
    const data=await json(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&safesearch=moderate`,{headers:{'X-Subscription-Token':env.BRAVE_SEARCH_API_KEY,Accept:'application/json'}});
    return (data.web?.results||[]).map(r=>({title:r.title,url:r.url,extract:stripTags(r.description||'')}));
  }},
  {id:'wikipedia',label:'Wikipedia',kind:'knowledge',async run(q){
    const data=await json(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=8&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json`);
    return Object.values(data.query?.pages||{}).sort((a,b)=>a.index-b.index).map(p=>({title:p.title,url:`https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,extract:p.extract||''}));
  }},
  {id:'duckduckgo',label:'DuckDuckGo Instant Answers',kind:'knowledge',async run(q){
    // This API returns instant answers, NOT DuckDuckGo's full web result list.
    const data=await json(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=0`);
    const out=[];
    if(data.AbstractURL&&data.AbstractText)out.push({title:data.Heading||q,url:data.AbstractURL,extract:data.AbstractText});
    const topics=(data.RelatedTopics||[]).flatMap(t=>t.Topics||[t]);
    for(const t of topics.slice(0,8))if(t.FirstURL&&t.Text)out.push({title:t.Text.split(' - ')[0].slice(0,180),url:t.FirstURL,extract:t.Text});
    return out;
  }},
];
function stripTags(text){return String(text).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}

export async function aggregateSearch(query, {env=process.env,providers=PROVIDERS}={}) {
  const batches=await Promise.all(providers.map(async p=>{
    if(p.key&&!env[p.key])return {provider:p.label,id:p.id,kind:p.kind,status:'not_configured',results:[]};
    try {return {provider:p.label,id:p.id,kind:p.kind,status:'ok',results:await p.run(query,env)};}
    catch{return {provider:p.label,id:p.id,kind:p.kind,status:'unavailable',results:[]};}
  }));
  const successful=batches.filter(b=>b.status==='ok');
  const results=rankResults(successful,query);
  return {
    query,results,
    providers:batches.map(b=>({id:b.id,name:b.provider,kind:b.kind,status:b.status,count:rankResults([b],query,20).length})),
    limitedWebCoverage:!successful.some(b=>b.kind==='web'),
    ranking:'reciprocal-rank-fusion',
  };
}

export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;res.end(JSON.stringify({error:'Use GET.'}));return;}
  const q=new URL(req.url,'http://localhost').searchParams.get('q')?.trim()||'';
  if(!q||q.length>200){res.statusCode=400;res.end(JSON.stringify({error:'Search queries must be between 1 and 200 characters.'}));return;}
  if(!allow(String(req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown'))){res.statusCode=429;res.setHeader('Retry-After','60');res.end(JSON.stringify({error:'Too many searches. Please wait a minute and try again.'}));return;}
  try {res.end(JSON.stringify(await aggregateSearch(q)));}
  catch {res.statusCode=503;res.end(JSON.stringify({error:'Search is temporarily unavailable. Please try again.'}));}
}
