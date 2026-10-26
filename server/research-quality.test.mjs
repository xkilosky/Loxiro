import {afterEach,describe,it,expect,vi} from 'vitest';
import {PROVIDERS} from './providers.mjs';
import {planProviders} from './planner.mjs';
import {rankResults} from './rank.mjs';
import {linkedSources} from './linked-sources.mjs';
import {specialistQuery,tokenCoverage} from './relevance.mjs';
import {createProviderRuntime} from './runtime.mjs';
afterEach(()=>vi.unstubAllGlobals());
const item=(url,title,extract='')=>({url,title,extract,...(url.startsWith('https://doi.org/')?{contentType:'paper'}:{})});
describe('research quality regressions',()=>{
  it.each(['solar energy','photosynthesis','black holes','earthquake risk','agriculture','cambio climático'])('routes %s beyond Wikimedia',query=>{
    const plan=planProviders(query,PROVIDERS,{});expect(plan.selected).toContain('crossref');expect(plan.selected).toContain('openalex');expect(plan.selected.length).toBeLessThanOrEqual(8);
  });
  it('selects primary documentation and clinical records for matching topics',()=>{
    expect(planProviders('javascript fetch API',PROVIDERS,{}).selected).toContain('mdn');
    expect(planProviders('cancer treatment',PROVIDERS,{}).selected).toContain('clinicaltrials');
    expect(planProviders('medicina vacunas',PROVIDERS,{}).selected).toContain('europepmc');
    expect(planProviders('Tolkien books',PROVIDERS,{}).selected).not.toContain('clinicaltrials');
  });
  it.each([['What is solar energy?','solar energy'],['Latest research on solar energy','solar energy'],['quantum computing research papers','quantum computing'],['Qué es la fotosíntesis?','la fotosíntesis']])('removes question scaffolding: %s', (query,expected)=>expect(specialistQuery(query)).toBe(expected));
  it('matches words rather than unrelated substrings and ignores question filler',()=>{
    expect(tokenCoverage('what is React?','A chemical reaction')).toBe(0);expect(tokenCoverage('What is solar energy?','Solar energy systems')).toBe(1);
    expect(tokenCoverage('Qué es la fotosíntesis','Fotosintesis de plantas')).toBe(1);
  });
  it('never pads a thin response with eight encyclopedia pages',()=>{
    const r=rankResults([{provider:'Wikipedia',results:Array.from({length:8},(_,i)=>item(`https://en.wikipedia.org/wiki/Solar_${i}`,'Solar energy'))}],'solar energy');expect(r).toHaveLength(2);expect(r.every(r=>r.kind==='reference')).toBe(true);
  });
  it('does not turn related Wikimedia adapters into independent agreement',()=>{
    const r=rankResults([{provider:'Wikipedia',family:'wikimedia',results:[item('https://example.gov/solar','Solar energy')]},{provider:'Wikipedia-linked sources',family:'wikimedia',results:[item('https://example.gov/solar','Solar energy')]}],'solar energy');expect(r[0].reason).toBe('Found by related sources');expect(r[0].sources).toHaveLength(2);
  });
  it('prioritizes topical results over unrelated source consensus',()=>{
    const unrelated=item('https://wrong.example.org','General conference proceedings','A conference on computer systems');
    const r=rankResults([{provider:'A',results:[unrelated]},{provider:'B',results:[unrelated]},{provider:'Crossref',kind:'research',results:[item('https://doi.org/10.1234/solar','Solar energy storage systems','Solar energy storage review')]}],'solar energy');expect(r[0].domain).toBe('doi.org');expect(r[0].contentType).toBe('paper');
  });
  it('reserves space for relevant direct sources rather than a DOI-only replacement feed',()=>{
    const papers=Array.from({length:12},(_,i)=>item(`https://doi.org/10.${1000+i}/solar`,'Solar energy research'));
    const r=rankResults([{provider:'Papers',kind:'research',results:papers},{provider:'Originals',weight:.65,results:[item('https://www.energy.gov/solar','Solar energy guide'),item('https://www.nasa.gov/solar','Solar energy science')]}],'solar energy');
    expect(r).toHaveLength(10);expect(r.slice(0,6).map(r=>r.domain)).toContain('energy.gov');expect(r.slice(0,6).map(r=>r.domain)).toContain('nasa.gov');
  });
  it('distinguishes a community-shared article from a discussion page',()=>{
    const r=rankResults([{provider:'HN',kind:'community',results:[item('https://example.org/solar','Solar energy'),item('https://news.ycombinator.com/item?id=1','Solar energy discussion')]}],'solar energy');
    expect(r.find(r=>r.domain==='example.org').contentType).toBe('community-link');expect(r.find(r=>r.domain==='news.ycombinator.com').contentType).toBe('discussion');
  });
  it('keeps reference caps and website diversity in a mixed feed',()=>{
    const r=rankResults([{provider:'Wiki',family:'wikimedia',results:Array.from({length:8},(_,i)=>item(`https://en.wikipedia.org/wiki/Solar_${i}`,'Solar energy'))},{provider:'Papers',kind:'research',results:Array.from({length:8},(_,i)=>item(`https://doi.org/10.${1000+i}/solar`,'Solar energy review'))}],'solar energy');expect(r).toHaveLength(10);expect(r.filter(r=>r.kind==='reference')).toHaveLength(2);expect(r[0].contentType).toBe('paper');
  });
});
describe('transparent external source discovery',()=>{
  it('bounds discovery, retains its article trail, and never fetches discovered URLs',()=>{
    const r=linkedSources({1:{title:'Solar energy',extlinks:[{'*':'https://www.energy.gov/solar'},{'*':'https://www.nasa.gov/science/solar'},{'*':'https://www.noaa.gov/solar'}]}});expect(r).toHaveLength(2);expect(r[0].contentType).toBe('linked-source');expect(r[0].discoveredFrom).toBe('https://en.wikipedia.org/wiki/Solar_energy');expect(r[0].extract).toContain('not an independent verification');
  });
  it('rejects credentials, unsafe schemes, spoofed hosts, portals and duplicates',()=>{
    const urls=['javascript:alert(1)','https://user:pass@nasa.gov/solar','https://nasa.gov.attacker.test/solar','https://www.nasa.gov/','https://www.nasa.gov/login','https://www.nasa.gov/solar','https://www.nasa.gov/solar#duplicate'];expect(linkedSources({1:{title:'Solar energy',extlinks:urls.map(url=>({url}))}})).toHaveLength(1);
  });
  it('preserves provenance and category through runtime normalization',async()=>{
    const rt=createProviderRuntime();const p={id:'linked_sources',run:async()=>linkedSources({1:{title:'Solar energy',extlinks:[{url:'https://www.energy.gov/solar'}]}})};
    const data=await rt.run(p,'solar energy',{});expect(data.results[0].discoveredFrom).toContain('wikipedia.org');expect(data.results[0].contentType).toBe('linked-source');
  });
  it('restricts MDN responses to its actual documentation host',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({documents:[{title:'Valid',mdn_url:'/en-US/docs/Web/API/Fetch_API'},{title:'Spoofed',mdn_url:'https://attacker.example/en-US/docs/Fake'},{title:'Unsafe',mdn_url:'javascript:alert(1)'}]}))));
    const r=await PROVIDERS.find(p=>p.id==='mdn').run('fetch',{});expect(r).toHaveLength(1);expect(r[0].contentType).toBe('documentation');
  });
  it('does not call clinical registry records proven treatments',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({studies:[{protocolSection:{identificationModule:{nctId:'NCT12345678',briefTitle:'Cancer study'}}}]}))));
    const r=await PROVIDERS.find(p=>p.id==='clinicaltrials').run('cancer',{});expect(r[0].contentType).toBe('clinical-trial');expect(r[0].extract).toContain('not a treatment recommendation');
  });
});
