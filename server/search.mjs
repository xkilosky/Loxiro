import { createHash } from 'node:crypto';
import { rankResults } from './rank.mjs';
import {PROVIDERS} from './providers.mjs';
import {planProviders,sourceWeight} from './planner.mjs';
import {createProviderRuntime} from './runtime.mjs';

const buckets=new Map();
function allow(ip) {
  const key=createHash('sha256').update(ip).digest('hex').slice(0,20);
  const now=Date.now();
  for(const [k,b] of buckets) if(now-b.start>60000)buckets.delete(k);
  if(buckets.size>2000)return false;
  const b=buckets.get(key)||{start:now,count:0};b.count++;buckets.set(key,b);
  return b.count<=12;
}
const sharedRuntime=createProviderRuntime();
export async function aggregateSearch(query, { env=process.env, providers=PROVIDERS, runtime=providers===PROVIDERS?sharedRuntime:createProviderRuntime() }={}) {
  const started=Date.now();
  const plan=planProviders(query,providers===PROVIDERS?providers:providers.map(p=>({...p,priority:p.priority??90})),env);
  const batches=await Promise.all(providers.map(async p=>{
    const meta={id:p.id,name:p.label,kind:p.kind,access:p.access||'keyless',family:p.family||p.id,count:0};
    if(p.key&&!env[p.key])return{...meta,status:'not_configured',results:[]};
    if(p.paid&&env.LOXIRO_ALLOW_PAID_PROVIDERS!=='1')return{...meta,status:'disabled',results:[]};
    if(!plan.selected.includes(p.id))return{...meta,status:'skipped',results:[]};
    const response=await runtime.run(p,query,env);
    return{...meta,...response,count:response.results.length};
  }));
  const results=rankResults(batches.map(p=>({provider:p.name,family:p.family,weight:sourceWeight(p,query),results:p.results})),query);
  return{query,results,providers:batches.map(({results,...p})=>p),topics:plan.topics,ranking:'reciprocal-rank-fusion',
    limitedWebCoverage:!batches.some(p=>p.kind==='web'&&p.status==='ok'&&p.count>0),durationMs:Date.now()-started};
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
