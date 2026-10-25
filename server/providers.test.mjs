import {afterEach,describe,expect,it,vi} from 'vitest';
import {PROVIDERS} from './providers.mjs';
import {planProviders,queryTopics} from './planner.mjs';
import {createProviderRuntime} from './runtime.mjs';
import {ProviderError,json,retryDelay} from './transport.mjs';
import {aggregateSearch} from './search.mjs';
import {rankResults} from './rank.mjs';
afterEach(()=>vi.unstubAllGlobals());
const item=(title='Quantum computing',url='https://example.org/paper')=>({title,url,extract:'Quantum computing research'});
const fixtures={
  wikipedia:{query:{pages:{1:{title:'Quantum computing',extract:'Encyclopedia',index:1}}}},
  wikidata:{search:[{id:'Q4640',label:'Quantum computing',description:'A computation paradigm'}]},
  duckduckgo:{Heading:'Quantum computing',AbstractURL:'https://example.org/duck',AbstractText:'Instant answer',RelatedTopics:[{Topics:[{Text:'Quantum topic - more',FirstURL:'https://example.org/topic'}]}]},
  crossref:{message:{items:[{DOI:'10.1000/quantum',title:['Quantum computing'],author:[{given:'Alice',family:'Example'}],published:{'date-parts':[[2026]]},'container-title':['Journal']}] }},
  openalex:{results:[{title:'Quantum computing',doi:'https://doi.org/10.1000/quantum',publication_year:2026,open_access:{is_oa:true}}]},
  europepmc:{resultList:{result:[{title:'Quantum computing',doi:'10.1000/quantum',authorString:'A Example',pubYear:'2026',isOpenAccess:'Y'},{title:'Medicine',source:'MED',id:'123'}]}},
  openlibrary:{docs:[{key:'/works/OL123W',title:'Quantum computing',author_name:['A Example'],first_publish_year:2026},{key:'//evil.test',title:'Bad'}]},
  archive:{response:{docs:[{identifier:'quantum-example',title:'Quantum computing',description:['<b>Quantum</b> computing','A collection'],mediatype:'texts',year:2026}]}},
  hackernews:{hits:[{title:'Quantum computing',url:'https://example.org/hn',points:42,num_comments:7},{title:'Quantum discussion',objectID:'123',story_text:'<p>Example</p>'}]},
  stackoverflow:{items:[{title:'Quantum &amp; computing',link:'https://stackoverflow.com/questions/123/example',is_answered:true,tags:['quantum'],answer_count:2}],backoff:5,quota_remaining:99},
  github:{items:[{full_name:'example/quantum',html_url:'https://github.com/example/quantum',description:'Quantum computing',language:'Python',stargazers_count:42}]},
  itunes:{results:[{trackName:'Quantum computing',trackViewUrl:'https://music.apple.com/example',artistName:'Example',kind:'podcast',artworkUrl100:'https://do-not-request.test/asset',previewUrl:'https://do-not-request.test/preview'}]},
  tavily:{results:[{title:'Quantum computing',url:'https://example.org/tavily',content:'A snippet'}]},
  serpapi:{organic_results:[{title:'Quantum computing',link:'https://example.org/serpapi',snippet:'A snippet'}]},
  zenserp:{organic:[{title:'Quantum computing',url:'https://example.org/zenserp',description:'A snippet'},{questions:[{question:'Not a link'}]}]},
  google:{organic:[{title:'Quantum computing',link:'https://example.org/google',snippet:'A snippet'}]},
  brave:{web:{results:[{title:'Quantum computing',url:'https://example.org/brave',description:'<b>Safe</b> snippet'}]}},
};
describe('provider registry and normalization',()=>{
  it('has twelve keyless sources, three optional free-key web adapters, and two paid opt-ins',()=>{
    expect(new Set(PROVIDERS.map(p=>p.id)).size).toBe(PROVIDERS.length);
    expect(PROVIDERS.filter(p=>p.access==='keyless')).toHaveLength(12);
    expect(PROVIDERS.filter(p=>p.access==='free-key')).toHaveLength(3);
    expect(PROVIDERS.filter(p=>p.paid)).toHaveLength(2);
  });
  it.each(PROVIDERS.map(p=>[p.id,p]))('normalizes the documented %s response',async(id,p)=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(fixtures[id])));vi.stubGlobal('fetch',fetcher);
    const output=await p.run('Quantum computing',{[p.key]:'secret-value'});
    const results=Array.isArray(output)?output:output.results;
    expect(results.length).toBeGreaterThan(0);expect(results[0].title.toLowerCase()).toContain('quantum');
    expect(results[0].url).toMatch(/^https:\/\//);
    expect(JSON.stringify(results)).not.toMatch(/secret-value|do-not-request|<b>/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps Tavily at basic, one-credit search with no generated answer',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify(fixtures.tavily)));vi.stubGlobal('fetch',fetcher);
    await PROVIDERS.find(p=>p.id==='tavily').run('test',{TAVILY_API_KEY:'server-only'});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({search_depth:'basic',auto_parameters:false,include_answer:false});
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer server-only');
  });
  it('does not treat upstream JSON API errors as successful empty searches',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"error":"Quota exceeded"}')));
    await expect(PROVIDERS.find(p=>p.id==='serpapi').run('test',{SERPAPI_API_KEY:'hidden'})).rejects.toThrow();
  });
});
describe('relevant and bounded query planning',()=>{
  it('keeps unrelated specialists idle',()=>{
    const p=planProviders('weather in Guatemala City',PROVIDERS,{});
    expect(p.selected).toEqual(['wikipedia','wikidata','duckduckgo']);expect(p.topics).toEqual(['general']);
  });
  it.each([['react useeffect error',['stackoverflow','github','hackernews']],['quantum computing research',['crossref','openalex']],['cancer treatment',['europepmc','crossref']],['Tolkien books',['openlibrary','archive']],['Beatles music',['itunes','archive']]])('routes %s to relevant sources',(q,ids)=>{
    const p=planProviders(q,PROVIDERS,{});for(const id of ids)expect(p.selected).toContain(id);
    expect(p.selected.length).toBeLessThanOrEqual(8);
  });
  it('caps complex queries at eight requests and never enables paid providers implicitly',()=>{
    const env=Object.fromEntries(PROVIDERS.filter(p=>p.key).map(p=>[p.key,'secret']));
    const p=planProviders('research cancer software books music history',PROVIDERS,env);
    expect(p.selected).toHaveLength(8);expect(p.selected).not.toContain('google');expect(p.selected).not.toContain('brave');
    expect(queryTopics('scarcity of capital')).not.toContain('code');
  });
  it('does not call skipped, disabled, or unconfigured services',async()=>{
    const run=vi.fn();const d=await aggregateSearch('general',{providers:[{id:'paid',label:'Paid',paid:true,key:'KEY',kind:'web',run}],env:{KEY:'secret'}});
    expect(run).not.toHaveBeenCalled();expect(d.providers[0].status).toBe('disabled');expect(JSON.stringify(d)).not.toContain('secret');
  });
});
describe('quota resilience and short-lived caching',()=>{
  it('shares in-flight requests and caches a query for sixty seconds',async()=>{
    let time=0;const rt=createProviderRuntime({now:()=>time}),run=vi.fn(async()=>[item()]),p={id:'a',run};
    const [a,b]=await Promise.all([rt.run(p,'quantum',{}),rt.run(p,'quantum',{})]);expect(run).toHaveBeenCalledTimes(1);expect(a.results).toEqual(b.results);
    expect((await rt.run(p,'QUANTUM',{})).cached).toBe(true);
    time=60001;await rt.run(p,'quantum',{});expect(run).toHaveBeenCalledTimes(2);
  });
  it('caches empty successes and bounds the cache with eviction',async()=>{
    const rt=createProviderRuntime({maxCache:2}),run=vi.fn(async()=>[]),p={id:'a',run};
    await rt.run(p,'one',{});await rt.run(p,'one',{});expect(run).toHaveBeenCalledTimes(1);
    await rt.run(p,'two',{});await rt.run(p,'three',{});await rt.run(p,'one',{});expect(run).toHaveBeenCalledTimes(4);
  });
  it('honors Stack Exchange backoff even after a successful response',async()=>{
    let time=0;const rt=createProviderRuntime({now:()=>time}),run=vi.fn(async()=>({results:[item()],backoffMs:120000})),p={id:'stack',run};
    await rt.run(p,'one',{});expect((await rt.run(p,'two',{})).status).toBe('rate_limited');expect((await rt.run(p,'one',{})).cached).toBe(true);
    time=120001;expect((await rt.run(p,'two',{})).status).toBe('ok');expect(run).toHaveBeenCalledTimes(2);
  });
  it('honors HTTP retry-after, recovers, and does not expose diagnostics',async()=>{
    let time=0;const rt=createProviderRuntime({now:()=>time}),run=vi.fn().mockRejectedValueOnce(new ProviderError('rate_limited',120000)).mockResolvedValue([item()]),p={id:'a',run};
    expect((await rt.run(p,'one',{})).status).toBe('rate_limited');expect((await rt.run(p,'two',{})).retryAfterSeconds).toBe(120);
    time=120001;expect((await rt.run(p,'two',{})).status).toBe('ok');
  });
  it('opens a circuit after repeated failures and recovers after cooldown',async()=>{
    let time=0;const rt=createProviderRuntime({now:()=>time}),run=vi.fn().mockRejectedValueOnce(new Error('private details')).mockRejectedValueOnce(new Error('private details')).mockResolvedValue([item()]),p={id:'a',run};
    const failed=await rt.run(p,'one',{});expect(JSON.stringify(failed)).not.toContain('private');
    await rt.run(p,'two',{});expect((await rt.run(p,'three',{})).status).toBe('rate_limited');
    time=60001;expect((await rt.run(p,'three',{})).status).toBe('ok');
  });
  it('does not retain rejected synchronous requests as pending promises',async()=>{
    const rt=createProviderRuntime(),run=vi.fn().mockImplementationOnce(()=>{throw new Error('failure');}).mockResolvedValue([item()]),p={id:'a',run};
    await rt.run(p,'one',{});expect((await rt.run(p,'one',{})).status).toBe('ok');expect(run).toHaveBeenCalledTimes(2);
  });
  it('filters irrelevant specialist results, rejects dangerous links and bounds text',async()=>{
    const rt=createProviderRuntime(),p={id:'a',lexical:true};
    p.run=async()=>[item(),{title:'Unrelated',url:'https://example.org/no',extract:'No match'},item('Unsafe','javascript:alert(1)'),{...item('Quantum'),extract:'x'.repeat(5000)}];
    const d=await rt.run(p,'quantum',{});expect(d.results).toHaveLength(2);expect(d.results[1].extract).toHaveLength(700);
  });
  it('does not call a source more quickly than its declared rate',async()=>{
    const rt=createProviderRuntime({now:()=>0}),run=vi.fn(async()=>[item()]),p={id:'github',minInterval:6500,run};
    await rt.run(p,'one',{});const second=await rt.run(p,'two',{});expect(second.status).toBe('rate_limited');expect(second.retryAfterSeconds).toBe(7);expect(run).toHaveBeenCalledTimes(1);
  });
});
describe('safe transport and index agreement',()=>{
  it('handles Retry-After seconds and dates with bounded fallback',()=>{
    expect(retryDelay('120',0)).toBe(120000);expect(retryDelay('Thu, 01 Jan 1970 00:02:00 GMT',0)).toBe(120000);expect(retryDelay('garbage',0)).toBe(60000);expect(retryDelay('-1',0)).toBe(1000);
  });
  it('recognizes 429 and GitHub quota-exhaustion 403 responses',async()=>{
    for(const status of [429,403]){
      vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status,headers:{'retry-after':'120','x-ratelimit-remaining':'0'}})));
      await expect(json('https://example.org')).rejects.toMatchObject({status:'rate_limited',retryMs:120000});
    }
  });
  it('rejects malformed or oversized JSON without returning it',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('not json')));await expect(json('https://example.org')).rejects.toThrow();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('x'.repeat(1500001))));await expect(json('https://example.org')).rejects.toThrow();
  });
  it('does not multiply ranking votes for the same Google index via different vendors',()=>{
    const rows=rankResults([{provider:'Vendor A',family:'google',results:[item('Same','https://same.test')]},{provider:'Vendor B',family:'google',results:[item('Same','https://same.test')]},{provider:'Independent A',results:[item('Other','https://other.test')]},{provider:'Independent B',results:[item('Other','https://other.test')]}],'quantum');
    expect(rows[0].domain).toBe('other.test');expect(rows[1].sources).toEqual(['Vendor A','Vendor B']);expect(rows[1]).not.toHaveProperty('votes');
  });
});
