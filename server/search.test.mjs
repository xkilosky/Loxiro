import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalUrl, rankResults } from './rank.mjs';
import handler, { aggregateSearch } from './search.mjs';
import { createProviderRuntime } from './runtime.mjs';

afterEach(()=>vi.unstubAllGlobals());
const result=(url,title='Useful result',extract='A useful result')=>({url,title,extract});
describe('canonical links and safe results',()=>{
  it('merges HTTP/HTTPS, www, fragments, tracking and parameter ordering',()=>{
    expect(canonicalUrl('https://www.example.com/article/?utm_source=x&b=2&a=1#intro').key).toBe(canonicalUrl('http://example.com/article?a=1&b=2').key);
  });
  it('preserves meaningful query parameters',()=>expect(canonicalUrl('https://example.com/?id=1').key).not.toBe(canonicalUrl('https://example.com/?id=2').key));
  it.each(['javascript:alert(1)','file:///etc/passwd','data:text/html,test','https://user:password@example.com'])('rejects %s',url=>expect(canonicalUrl(url)).toBeNull());
});
describe('transparent rank fusion',()=>{
  it('deduplicates links and attributes all contributing providers',()=>{
    const ranked=rankResults([{provider:'A',results:[result('https://example.com/a?utm_source=a')]},{provider:'B',results:[result('http://www.example.com/a#top')]}],'useful');
    expect(ranked).toHaveLength(1);expect(ranked[0].sources).toEqual(['A','B']);expect(ranked[0].reason).toBe('Found by 2 sources');
  });
  it('promotes cross-source agreement over a single top result',()=>{
    const ranked=rankResults([{provider:'A',results:[result('https://solo.test'),result('https://shared.test')]},{provider:'B',results:[result('https://shared.test')]}],'useful');
    expect(ranked[0].domain).toBe('shared.test');
  });
  it('does not give extra votes to repeated provider results or batches',()=>{
    const r=result('https://example.com');
    expect(rankResults([{provider:'A',results:[r,r]},{provider:'A',results:[r]}],'useful')[0].sources).toEqual(['A']);
  });
  it('preserves domain diversity while filling the requested limit',()=>{
    const ranked=rankResults([{provider:'A',results:[result('https://same.test/a'),result('https://same.test/b'),result('https://same.test/c'),result('https://other.test')]}],'useful',4);
    expect(ranked[2].domain).toBe('other.test');expect(ranked).toHaveLength(4);
  });
  it('removes invalid links and empty titles',()=>expect(rankResults([{provider:'A',results:[result('javascript:alert(1)'),result('https://example.com','')]}],'useful')).toEqual([]));
  it('does not expose internal scores as fake confidence percentages',()=>expect(rankResults([{provider:'A',results:[result('https://example.com')]}],'useful')[0]).not.toHaveProperty('score'));
});
describe('parallel source aggregation',()=>{
  it('returns successful sources when another fails, and does not call unconfigured providers',async()=>{
    const missing=vi.fn();
    const data=await aggregateSearch('query',{env:{},providers:[
      {id:'a',label:'A',kind:'knowledge',run:async()=>[result('https://a.test')]},
      {id:'b',label:'B',kind:'web',run:async()=>{throw new Error('private provider diagnostic')}},
      {id:'c',label:'C',kind:'web',key:'PRIVATE_KEY',run:missing},
    ]});
    expect(data.results).toHaveLength(1);expect(data.providers.map(p=>p.status)).toEqual(['ok','unavailable','not_configured']);expect(missing).not.toHaveBeenCalled();expect(data.limitedWebCoverage).toBe(true);expect(JSON.stringify(data)).not.toContain('private provider diagnostic');
  });
  it('recognizes a responding full-web provider',async()=>{
    const data=await aggregateSearch('query',{env:{KEY:'secret'},providers:[{id:'a',label:'A',kind:'web',key:'KEY',run:async()=>[result('https://fullweb.test')]}]});
    expect(data.limitedWebCoverage).toBe(false);expect(JSON.stringify(data)).not.toContain('secret');
  });
  it('puts keyless web destinations ahead of the references behind them, with no keys set',async()=>{
    const page='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.energy.gov%2Fsolar&amp;rut=x">Solar Energy Technologies Office</a><a class="result__snippet">DOE funds early-stage solar research.</a><a class="result__a" href="https://en.wikipedia.org/wiki/Solar_energy">Solar energy - Wikipedia</a><a class="result__snippet">Radiant light and heat from the Sun.</a>';
    const fetcher=vi.fn(async url=>{
      const href=String(url);
      if(href.includes('html.duckduckgo.com'))return new Response(page,{headers:{'Content-Type':'text/html'}});
      if(href.includes('en.wikipedia.org/w/api.php'))return new Response(JSON.stringify({query:{search:[{title:'Solar energy',pageid:7,snippet:'radiant <span class="searchmatch">light</span>'}]}}),{headers:{'Content-Type':'application/json'}});
      if(href.includes('wikipedia.org/api/rest_v1/page/summary'))return new Response(JSON.stringify({title:'Solar energy',extract:'Solar energy is radiant light and heat from the Sun.'}),{headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify({Heading:'Solar energy',AbstractURL:'https://en.wikipedia.org/wiki/Solar_energy',AbstractText:'Radiant light and heat from the Sun.',RelatedTopics:[]}),{headers:{'Content-Type':'application/json'}});
    });
    vi.stubGlobal('fetch',fetcher);
    // No environment variables at all, which is the deployed default.
    // A fresh runtime keeps this test's circuit breakers and pacing out of the
    // module-level shared instance the other tests in this file rely on.
    const data=await aggregateSearch('solar energy',{env:{},runtime:createProviderRuntime()});
    expect(data.limitedWebCoverage).toBe(false);
    expect(data.webSearchConfigured).toBe(true);
    expect(data.websiteCount).toBeGreaterThan(0);
    expect(data.results[0].kind).toBe('website');
    expect(data.results[0].domain).toBe('energy.gov');
    // The encyclopedia entry is still present, but behind the web destination.
    const kinds=data.results.map(r=>r.kind);
    expect(kinds.indexOf('reference')).toBeGreaterThan(kinds.lastIndexOf('website'));
    expect(data.results[0].sources).toContain('DuckDuckGo Web');
  });
  it('normalizes real provider API shapes, keeps keys server-side',async()=>{
    const fetcher=vi.fn(async url=>new Response(JSON.stringify(String(url).includes('serper')?{organic:[{title:'Shared',link:'https://shared.test',snippet:'Google snippet'}]}:String(url).includes('brave')?{web:{results:[{title:'Shared',url:'https://shared.test',description:'<b>Brave</b> snippet'}]}}:String(url).includes('wikipedia')?{query:{pages:{1:{title:'Shared topic',extract:'An encyclopedia article',index:1}}}}:{Heading:'Shared topic',AbstractURL:'https://shared.test',AbstractText:'Instant answer',RelatedTopics:[]})));
    vi.stubGlobal('fetch',fetcher);
    const data=await aggregateSearch('shared',{env:{SERPER_API_KEY:'server-secret',BRAVE_SEARCH_API_KEY:'server-secret',LOXIRO_ALLOW_PAID_PROVIDERS:'1'}});
    expect(fetcher).toHaveBeenCalledTimes(7);expect(data.results[0].sources).toHaveLength(3);expect(data.providers.filter(p=>!['not_configured','skipped'].includes(p.status)).every(p=>p.status==='ok')).toBe(true);expect(JSON.stringify(data)).not.toContain('server-secret');
  });
});
describe('HTTP boundary',()=>{
  const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);},statusCode:200});
  it('rejects unsupported methods before making requests',async()=>{const r=res();await handler({method:'POST',url:'/api/search?q=test'},r);expect(r.statusCode).toBe(405);});
  it('rejects missing and oversized queries',async()=>{for(const q of ['', 'a'.repeat(201)]){const r=res();await handler({method:'GET',url:'/api/search?q='+q},r);expect(r.statusCode).toBe(400);expect(r.headers['Cache-Control']).toBe('private, no-store');}});
});
