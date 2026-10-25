import {afterEach,describe,expect,it,vi} from 'vitest';
import {listedWebsites} from './websites.mjs';
import {rankResults} from './rank.mjs';
import {PROVIDERS} from './providers.mjs';
import {aggregateSearch} from './search.mjs';
const match={id:'Q123',label:'Example Agency',description:'Space research organization'};
const claim=(value,rank='normal',qualifiers={})=>({rank,qualifiers,mainsnak:{snaktype:'value',datatype:'url',datavalue:{value}}});
const entities=claims=>({Q123:{claims:{P856:claims}}});
const link=(url,title='Space research')=>({url,title,extract:'Space research resources'});
afterEach(()=>vi.unstubAllGlobals());
describe('keyless real website discovery',()=>{
  it('returns listed HTTP(S) website URLs, not invented domains or reference pages',()=>{
    const rows=listedWebsites([match],entities([claim('https://agency.example.org') ]));
    expect(rows[0]).toMatchObject({title:'Example Agency — Website',url:'https://agency.example.org/'});
    expect(rows[0].extract).toContain('not an independent verification');
  });
  it('prefers current preferred statements over old normal URLs',()=>{
    const rows=listedWebsites([match],entities([claim('https://old.example.org'),claim('https://current.example.org','preferred')]));
    expect(rows).toHaveLength(1);expect(rows[0].url).toContain('current.example.org');
  });
  it('excludes ended, deprecated, missing, dangerous, reference, and private network URLs',()=>{
    const rows=listedWebsites([match],entities([
      claim('https://ended.example.org','normal',{P582:[{}]}),claim('https://deprecated.example.org','deprecated'),
      claim('https://hijacked.example.org','normal',{P1534:[{}]}),claim('javascript:alert(1)'),claim('https://user:password@example.org'),
      claim('https://en.wikipedia.org/wiki/Example'),claim('http://127.0.0.1'),claim('http://192.168.1.1'),claim('http://localhost'),claim('https://intranet.local'),claim('http://[::1]'),
      {rank:'normal',mainsnak:{snaktype:'novalue',datatype:'url'}},
    ]));expect(rows).toEqual([]);
  });
  it('deduplicates and caps website statements at two per entity',()=>{
    const rows=listedWebsites([match],entities([claim('https://example.org?utm_source=one'),claim('http://www.example.org#two'),claim('https://second.example.org'),claim('https://third.example.org')]));
    expect(rows).toHaveLength(2);
  });
  it('enriches named-site queries with a single batched entity lookup',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({search:[match]}))).mockResolvedValueOnce(new Response(JSON.stringify({entities:entities([claim('https://agency.example.org')])})));
    vi.stubGlobal('fetch',fetcher);
    const rows=await PROVIDERS.find(p=>p.id==='wikidata').run('Example Agency official website',{});
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('search')).toBe('Example Agency');
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('ids')).toBe('Q123');
    expect(rows[0].url).toBe('https://agency.example.org/');expect(rows[1].url).toBe('https://www.wikidata.org/wiki/Q123');
  });
  it('prefers an exact entity alias over similarly named towns in named-site searches',async()=>{
    const nasa={id:'Q1',label:'National Aeronautics and Space Administration',match:{text:'NASA'},description:'Space agency'};
    const town={id:'Q2',label:'Nasavrky',match:{text:'Nasavrky'},description:'A town'};
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({search:[nasa,town]}))).mockResolvedValueOnce(new Response(JSON.stringify({entities:{Q1:{claims:{P856:[claim('https://www.nasa.gov')]}}}})));
    vi.stubGlobal('fetch',fetcher);
    const rows=await PROVIDERS.find(p=>p.id==='wikidata').run('NASA official website',{});
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('ids')).toBe('Q1');
    expect(rows[0].title).toContain('(NASA)');expect(rows[0].url).toBe('https://www.nasa.gov/');expect(JSON.stringify(rows)).not.toContain('Nasavrky');
  });
  it('does not suggest guessed near-match sites when an explicit name has no exact match',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({search:[{id:'Q2',label:'Nasavrky',match:{text:'Nasavrky'}}]})));vi.stubGlobal('fetch',fetcher);
    const rows=await PROVIDERS.find(p=>p.id==='wikidata').run('NASA official website',{});
    expect(rows.every(r=>r.url.startsWith('https://www.wikidata.org/'))).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains references when the directory enrichment times out',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({search:[match]}))).mockRejectedValueOnce(new Error('private upstream failure')));
    const rows=await PROVIDERS.find(p=>p.id==='wikidata').run('Example Agency',{});
    expect(rows).toHaveLength(1);expect(rows[0].url).toBe('https://www.wikidata.org/wiki/Q123');
    expect(JSON.stringify(rows)).not.toContain('private upstream failure');
  });
  it('does not request entity claims when the named search has no matches',async()=>{
    const fetcher=vi.fn(async()=>new Response('{"search":[]}'));vi.stubGlobal('fetch',fetcher);
    expect(await PROVIDERS.find(p=>p.id==='wikidata').run('unknown',{})).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe('website-first combined feed',()=>{
  it('leads with a website even when an encyclopedia has more rank votes',()=>{
    const rows=rankResults([
      {provider:'A',results:[link('https://en.wikipedia.org/wiki/Space')]},
      {provider:'B',results:[link('https://en.wikipedia.org/wiki/Space')]},
      {provider:'Directory',weight:.65,results:[link('https://agency.example.org')]},
    ],'space');
    expect(rows[0].domain).toBe('agency.example.org');expect(rows[0].kind).toBe('website');expect(rows[1].kind).toBe('reference');
  });
  it('does not let generic website suffix words demote the requested subject',()=>{
    const rows=rankResults([{provider:'Directory',results:[link('https://www.nasa.gov/','National Aeronautics and Space Administration (NASA) — Website'),link('https://town.example.org','Nasavrky — Website')]}],'NASA official website');
    expect(rows[0].domain).toBe('nasa.gov');
  });
  it('keeps supporting references to two before filling from additional website domains',()=>{
    const rows=rankResults([{provider:'Reference',weight:1.2,results:Array.from({length:6},(_,i)=>link(`https://${i%2?'www.wikidata.org':'en.wikipedia.org'}/wiki/Space${i}`))},{provider:'Web',weight:.5,results:Array.from({length:9},(_,i)=>link(`https://website${i}.example.org`))}],'space');
    expect(rows).toHaveLength(10);expect(rows.filter(r=>r.kind==='reference').length).toBeLessThanOrEqual(2);expect(rows[0].kind).toBe('website');
  });
  it('does not invent website matches when only references exist',()=>{
    const rows=rankResults([{provider:'Wikipedia',results:[link('https://en.wikipedia.org/wiki/Space')]}],'space');
    expect(rows).toHaveLength(1);expect(rows[0].kind).toBe('reference');
  });
  it('counts website links but keeps directory-only coverage distinct from full-web search',async()=>{
    const data=await aggregateSearch('space',{env:{},providers:[{id:'directory',label:'Directory',kind:'knowledge',run:async()=>[link('https://agency.example.org'),link('https://en.wikipedia.org/wiki/Space')]}]});
    expect(data.websiteCount).toBe(1);expect(data.referenceCount).toBe(1);expect(data.webSearchConfigured).toBe(false);expect(data.limitedWebCoverage).toBe(true);
  });
  it('keeps general web results in the same feed and discloses a configured source outage',async()=>{
    const data=await aggregateSearch('space',{env:{KEY:'hidden'},providers:[{id:'web',label:'Web',kind:'web',key:'KEY',run:async()=>[link('https://news.example.org/article')]},{id:'encyclopedia',label:'Wikipedia',kind:'knowledge',run:async()=>[link('https://en.wikipedia.org/wiki/Space')]}]});
    expect(data.webSearchConfigured).toBe(true);expect(data.limitedWebCoverage).toBe(false);expect(data.results[0].kind).toBe('website');
    const failed=await aggregateSearch('space',{env:{KEY:'hidden'},providers:[{id:'web',label:'Web',kind:'web',key:'KEY',run:async()=>{throw new Error('failed');}}]});
    expect(failed.webSearchConfigured).toBe(true);expect(failed.limitedWebCoverage).toBe(true);
  });
});
