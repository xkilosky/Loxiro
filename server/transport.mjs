/** Bounded, deadline-controlled JSON transport shared by the public API adapters. */
export class ProviderError extends Error {
  constructor(status='unavailable', retryMs=60000) { super('Provider temporarily unavailable'); this.status=status; this.retryMs=retryMs; }
}
export function retryDelay(value, now=Date.now()) {
  if(!value)return 60000;
  const seconds=Number(value);
  const ms=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
  return Math.max(1000,Math.min(86400000,Number.isFinite(ms)?ms:60000));
}
export async function json(url, options={}) {
  const {env={},...request}=options;
  const contact=env.PROVIDER_CONTACT_EMAIL;
  const response=await fetch(url,{
    ...request,signal:AbortSignal.timeout(4200),
    headers:{'User-Agent':`Loxiro/0.4 (+https://github.com/xkilosky/Loxiro${contact?`; mailto:${contact}`:''})`,Accept:'application/json',...request.headers},
  });
  if(!response.ok){
    const limited=response.status===429||(response.status===403&&response.headers.get('x-ratelimit-remaining')==='0');
    const reset=Number(response.headers.get('x-ratelimit-reset'))*1000-Date.now();
    throw new ProviderError(limited?'rate_limited':'unavailable',limited&&reset>0?Math.min(reset,86400000):retryDelay(response.headers.get('retry-after')));
  }
  // Don't buffer arbitrarily large upstream responses in a serverless function.
  if(Number(response.headers.get('content-length'))>1500000)throw new ProviderError();
  const reader=response.body?.getReader();
  if(!reader)throw new ProviderError();
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw new ProviderError();}chunks.push(value);}
  const body=Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body);
}
export function stripTags(text) {
  return String(text||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
}
export function describe(...parts){return parts.filter(v=>v!==undefined&&v!==null&&v!=='').join(' · ');}
