import {canonicalUrl,isReferenceDomain} from './rank.mjs';
/** Bounded discovery from article external links, NOT a crawler or ownership verification. */
const KNOWN=/^(?:[^.]+\.)*(?:nasa\.gov|nih\.gov|cdc\.gov|noaa\.gov|usgs\.gov|who\.int|ipcc\.ch|un\.org|worldbank\.org|oecd\.org|nature\.com|science\.org|sciencedirect\.com|springer\.com|doi\.org|arxiv\.org|britannica\.com|reuters\.com|bbc\.com|bbc\.co\.uk|developer\.mozilla\.org)$/;
export function linkedSources(pages){
  const results=[],seen=new Set();
  for(const page of Object.values(pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).slice(0,3)){
    if(typeof page.title!=='string')continue;
    let count=0;
    for(const link of (page.extlinks||[]).slice(0,50)){
      const c=canonicalUrl(link.url||link['*']);if(!c||seen.has(c.key)||isReferenceDomain(c.domain))continue;
      const u=new URL(c.url);
      if(!KNOWN.test(c.domain)&&!/(?:^|\.)(?:gov|edu|(?:gov|gob|edu)\.[a-z]{2}|ac\.uk)$/.test(c.domain))continue;
      if(u.port||/\b(?:login|signin|signup|search|donate|subscribe|account)\b/i.test(u.pathname)||u.searchParams.has('token')||u.pathname==='/')continue;
      seen.add(c.key);count++;
      results.push({title:`${page.title} — source on ${c.domain}`,url:c.url,contentType:'linked-source',
        extract:`External source linked from the Wikipedia article “${page.title}”. Open the original page to check its evidence, date and context; the link is not an independent verification.`,
        discoveredFrom:`https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`});
      if(count>=2)break;
    }
  }
  return results.slice(0,6);
}
