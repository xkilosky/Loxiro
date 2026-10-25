import {json,stripTags,describe,ProviderError} from './transport.mjs';
import {queryTopics} from './planner.mjs';
import {listedWebsites} from './websites.mjs';
const enc=encodeURIComponent;
const params=(base,values)=>{const u=new URL(base);for(const [k,v]of Object.entries(values))if(v!==undefined&&v!=='')u.searchParams.set(k,String(v));return u.href;};

export const PROVIDERS=[
  {id:'wikipedia',label:'Wikipedia',kind:'knowledge',access:'keyless',priority:95,minInterval:250,async run(q,env){
    const d=await json(params('https://en.wikipedia.org/w/api.php',{action:'query',generator:'search',gsrsearch:q,gsrlimit:8,prop:'extracts',exintro:1,explaintext:1,exsentences:2,format:'json'}),{env});
    if(d.error)throw new Error('Wikipedia unavailable');
    return Object.values(d.query?.pages||{}).sort((a,b)=>a.index-b.index).map(p=>({title:p.title,url:`https://en.wikipedia.org/wiki/${enc(p.title.replace(/ /g,'_'))}`,extract:p.extract||''}));
  }},
  {id:'wikidata',label:'Wikidata',kind:'knowledge',access:'keyless',priority:75,minInterval:500,async run(q,env){
    const search=q.replace(/\s+(?:(?:official\s+)?(?:websites?|sites?|homepages?))\s*$/i,'').trim()||q;
    const d=await json(params('https://www.wikidata.org/w/api.php',{action:'wbsearchentities',search,language:'en',uselang:'en',type:'item',limit:6,format:'json'}),{env});
    if(d.error)throw new Error('Wikidata unavailable');
    const matches=(d.search||[]).filter(r=>/^Q\d+$/.test(r.id));
    const references=matches.map(r=>({title:r.label||r.id,url:`https://www.wikidata.org/wiki/${r.id}`,extract:r.description||'Structured knowledge record on Wikidata.'}));
    if(!matches.length)return references;
    try{
      const data=await json(params('https://www.wikidata.org/w/api.php',{action:'wbgetentities',ids:matches.map(r=>r.id).join('|'),props:'claims',format:'json'}),{env});
      // Directory enrichment can fail independently: retain successful references.
      return [...listedWebsites(matches,data.entities),...references];
    }catch{return references;}

  }},
  {id:'duckduckgo',label:'DuckDuckGo Instant Answers',kind:'knowledge',access:'keyless',priority:30,minInterval:1000,async run(q,env){
    const d=await json(params('https://api.duckduckgo.com/',{q,format:'json',no_html:1,skip_disambig:0}),{env});
    const out=[];
    if(d.AbstractURL&&d.AbstractText)out.push({title:d.Heading||q,url:d.AbstractURL,extract:d.AbstractText});
    for(const t of (d.RelatedTopics||[]).flatMap(t=>t.Topics||[t]).slice(0,8))if(t.FirstURL&&t.Text)out.push({title:t.Text.split(' - ')[0].slice(0,180),url:t.FirstURL,extract:t.Text});
    return out;
  }},
  {id:'crossref',label:'Crossref',kind:'research',access:'keyless',topics:['research','health'],minInterval:1000,lexical:true,async run(q,env){
    const d=await json(params('https://api.crossref.org/works',{query:q,rows:8,select:'DOI,title,author,published,container-title,URL',mailto:env.PROVIDER_CONTACT_EMAIL}),{env});
    return(d.message?.items||[]).filter(r=>r.DOI).map(r=>({title:r.title?.[0],url:`https://doi.org/${enc(r.DOI).replace(/%2F/gi,'/')}`,extract:describe(r['container-title']?.[0],r.author?.slice(0,3).map(a=>describe(a.given,a.family).replace(' · ',' ')).join(', '),r.published?.['date-parts']?.[0]?.[0],'Scholarly publication metadata; full text may require access.')}));
  }},
  {id:'openalex',label:'OpenAlex',kind:'research',access:'keyless',topics:['research','health'],minInterval:1000,lexical:true,async run(q,env){
    const d=await json(params('https://api.openalex.org/works',{search:q,per_page:8,select:'id,doi,title,publication_year,primary_location,open_access'}),{env,headers:env.OPENALEX_API_KEY?{Authorization:`Bearer ${env.OPENALEX_API_KEY}`}:{}});
    return(d.results||[]).map(r=>({title:r.title,url:r.doi||r.primary_location?.landing_page_url||r.id,extract:describe(r.primary_location?.source?.display_name,r.publication_year,r.open_access?.is_oa?'Open-access work':'Scholarly work; access varies')}));
  }},
  {id:'europepmc',label:'Europe PMC',kind:'research',access:'keyless',topics:['health'],minInterval:1000,lexical:true,async run(q,env){
    const d=await json(params('https://www.ebi.ac.uk/europepmc/webservices/rest/search',{query:q,format:'json',pageSize:8,resultType:'lite'}),{env});
    return(d.resultList?.result||[]).map(r=>({title:r.title,url:r.doi?`https://doi.org/${enc(r.doi).replace(/%2F/gi,'/')}`:`https://europepmc.org/article/${enc(r.source)}/${enc(r.id)}`,extract:describe(r.authorString,r.journalTitle,r.pubYear,r.isOpenAccess==='Y'?'Open access':'Biomedical publication')}));
  }},
  {id:'openlibrary',label:'Open Library',kind:'books',access:'keyless',topics:['books'],minInterval:1100,lexical:true,async run(q,env){
    const d=await json(params('https://openlibrary.org/search.json',{q,limit:8,fields:'key,title,author_name,first_publish_year'}),{env});
    return(d.docs||[]).filter(r=>/^\/works\/OL\d+W$/.test(r.key)).map(r=>({title:r.title,url:`https://openlibrary.org${r.key}`,extract:describe(r.author_name?.join(', '),r.first_publish_year,'Book discovery and edition information from Open Library.')}));
  }},
  {id:'archive',label:'Internet Archive',kind:'archives',access:'keyless',topics:['archives','books','media'],minInterval:1100,lexical:true,async run(q,env){
    const topics=queryTopics(q);
    const medium=topics.includes('books')?'texts':/\b(music|songs?|albums?|podcast|recording)\b/i.test(q)?'audio':/\b(movies?|films?|documentary)\b/i.test(q)?'movies':null;
    // Focus media/book discovery on title/creator instead of incidental credits in descriptions.
    const core=q.replace(/\s+(?:books?|music|songs?|albums?|podcasts?|movies?|films?)\s*$/i,'').trim()||q;
    const quoted='"'+core.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
    const search=medium?`(title:${quoted} OR creator:${quoted}) AND mediatype:${medium}`:q;
    const u=params('https://archive.org/advancedsearch.php',{q:search,rows:8,page:1,output:'json'});
    const d=await json(u+'&fl[]=identifier&fl[]=title&fl[]=description&fl[]=mediatype&fl[]=year',{env});
    return(d.response?.docs||[]).filter(r=>r.identifier).map(r=>({title:r.title,url:`https://archive.org/details/${enc(r.identifier)}`,extract:stripTags(describe(r.mediatype,r.year,Array.isArray(r.description)?r.description.join(' '):r.description)).slice(0,700)}));
  }},
  {id:'hackernews',label:'Hacker News',kind:'community',access:'keyless',topics:['technology','code'],minInterval:500,lexical:true,async run(q,env){
    const d=await json(params('https://hn.algolia.com/api/v1/search',{query:q,tags:'story',hitsPerPage:8}),{env});
    return(d.hits||[]).map(r=>({title:r.title,url:r.url||`https://news.ycombinator.com/item?id=${enc(r.objectID)}`,extract:stripTags(r.story_text)||describe('Discussed on Hacker News',r.points!==undefined?`${r.points} points`:null,r.num_comments!==undefined?`${r.num_comments} comments`:null)}));
  }},
  {id:'stackoverflow',label:'Stack Overflow',kind:'code',access:'keyless',topics:['code'],minInterval:1100,lexical:true,async run(q,env){
    const d=await json(params('https://api.stackexchange.com/2.3/search/advanced',{q,site:'stackoverflow',order:'desc',sort:'relevance',pagesize:8}),{env});
    const results=(d.items||[]).map(r=>({title:stripTags(r.title),url:r.link,extract:describe(r.is_answered?'Has an answer':'Community question',r.tags?.join(', '),`${r.answer_count||0} answers`)}));
    return {results,backoffMs:Math.max(Number(d.backoff||0)*1000,d.quota_remaining===0?86400000:0),error:!!d.error_id};
  }},
  {id:'github',label:'GitHub repositories',kind:'code',access:'keyless',topics:['code'],minInterval:6500,lexical:true,async run(q,env){
    // Public repository search only. Code search requires authentication.
    const repositoryQuery=q.replace(/(^|\s)(?:github|repositories|repository|repos?)(?=\s|$)/gi,' ').replace(/\s+/g,' ').trim()||q;
    const d=await json(params('https://api.github.com/search/repositories',{q:repositoryQuery,per_page:8}),{env,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    return(d.items||[]).map(r=>({title:r.full_name,url:r.html_url,extract:describe(r.description,r.language,`${r.stargazers_count||0} stars`)}));
  }},
  {id:'itunes',label:'Apple iTunes',kind:'media',access:'keyless',topics:['media'],minInterval:3100,lexical:true,async run(q,env){
    const media=/\b(podcasts?)\b/i.test(q)?'podcast':/\b(audiobooks?)\b/i.test(q)?'audiobook':/\b(movies?|films?|cinema)\b/i.test(q)?'movie':'music';
    const term=q.replace(/\s+(?:music|songs?|albums?|podcasts?|movies?|films?|audiobooks?)\s*$/i,'').trim()||q;
    const d=await json(params('https://itunes.apple.com/search',{term,limit:8,country:'US',media,explicit:'No'}),{env});
    // Only metadata and direct store links; no preview audio/artwork is reused.
    return(d.results||[]).slice(0,8).map(r=>({title:r.trackName||r.collectionName||r.artistName,url:r.trackViewUrl||r.collectionViewUrl||r.artistViewUrl,extract:describe(r.artistName,r.kind||r.wrapperType,r.primaryGenreName,'View in Apple’s store; purchases may cost money.')}));
  }},
  {id:'tavily',label:'Tavily',kind:'web',access:'free-key',key:'TAVILY_API_KEY',priority:100,minInterval:1000,async run(q,env){
    const d=await json('https://api.tavily.com/search',{env,method:'POST',headers:{Authorization:`Bearer ${env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:q,search_depth:'basic',max_results:8,include_answer:false,include_raw_content:false,auto_parameters:false,safe_search:true})});
    return(d.results||[]).map(r=>({title:r.title,url:r.url,extract:r.content}));
  }},
  {id:'serpapi',label:'Google (via SerpApi)',family:'google',kind:'web',access:'free-key',key:'SERPAPI_API_KEY',priority:100,minInterval:73000,async run(q,env){
    const d=await json(params('https://serpapi.com/search.json',{engine:'google',q,api_key:env.SERPAPI_API_KEY,safe:'active'}),{env});
    if(d.error)throw new ProviderError();
    return(d.organic_results||[]).slice(0,8).map(r=>({title:r.title,url:r.link,extract:r.snippet}));
  }},
  {id:'zenserp',label:'Google (via Zenserp)',family:'google',kind:'web',access:'free-key',key:'ZENSERP_API_KEY',priority:100,minInterval:3100,async run(q,env){
    const d=await json(params('https://app.zenserp.com/api/v2/search',{engine:'google',q}),{env,headers:{apikey:env.ZENSERP_API_KEY}});
    if(d.error||d.errors)throw new ProviderError();
    return(d.organic||[]).filter(r=>r.title&&r.url).slice(0,8).map(r=>({title:r.title,url:r.url,extract:r.description}));
  }},
  {id:'google',label:'Google (via Serper)',family:'google',kind:'web',access:'paid-key',key:'SERPER_API_KEY',paid:true,priority:100,minInterval:1000,async run(q,env){
    const d=await json('https://google.serper.dev/search',{env,method:'POST',headers:{'X-API-KEY':env.SERPER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({q,num:10})});
    return(d.organic||[]).map(r=>({title:r.title,url:r.link,extract:r.snippet}));
  }},
  {id:'brave',label:'Brave Search',kind:'web',access:'paid-key',key:'BRAVE_SEARCH_API_KEY',paid:true,priority:100,minInterval:1000,async run(q,env){
    const d=await json(params('https://api.search.brave.com/res/v1/web/search',{q,count:10,safesearch:'moderate'}),{env,headers:{'X-Subscription-Token':env.BRAVE_SEARCH_API_KEY}});
    return(d.web?.results||[]).map(r=>({title:r.title,url:r.url,extract:stripTags(r.description)}));
  }},
];
