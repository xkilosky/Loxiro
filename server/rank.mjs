import {tokenCoverage} from './relevance.mjs';
import {websiteSubject} from './planner.mjs';
/** Wikimedia reference pages should not crowd out actual website destinations. */
export function isReferenceDomain(domain){return /(?:^|\.)(?:wikipedia\.org|wikidata\.org)$/.test(domain);}

/** Canonicalize links without discarding meaningful query parameters. */
export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|msclkid|ref_src)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '') || '/';
    return {key:`${host}${u.port ? ':'+u.port : ''}${path}${u.search}`, url:u.href, domain:host};
  } catch { return null; }
}

/** Reciprocal rank fusion + substantive textual relevance + domain diversity.
 * Consensus is not a truth guarantee. We expose reasons, not a fake confidence %. */
export function rankResults(batches, query, limit = 10) {
  const subject=websiteSubject(query);
  const merged = new Map();
  for (const batch of batches) {
    const seen = new Set();
    (batch.results || []).slice(0, 20).forEach((item, index) => {
      const c = canonicalUrl(item.url);
      if (!c || seen.has(c.key) || !item.title?.trim()) return;
      seen.add(c.key);
      let row = merged.get(c.key);
      if (!row) {
        row = {url:c.url, domain:c.domain, kind:isReferenceDomain(c.domain)?'reference':'website', title:String(item.title).slice(0,250), extract:String(item.extract || '').slice(0,1000), contentType:isReferenceDomain(c.domain)?'reference':item.contentType||({research:'research-record',code:c.domain==='github.com'?'project':'discussion',community:'discussion',books:'book',media:'media'}[batch.kind]||'website'), ...(item.discoveredFrom?{discoveredFrom:item.discoveredFrom}:{}), sources:[], votes:new Map(), score:0, bestRank:index+1};
        merged.set(c.key, row);
      }
      // One contribution per provider, even if a caller supplies repeated batches.
      if (row.sources.includes(batch.provider)) return;
      row.sources.push(batch.provider);
      // Multiple vendors returning the same Google index are not independent votes.
      const family=batch.family||batch.provider;
      const weight=Number.isFinite(batch.weight)?Math.max(.5,Math.min(1.2,batch.weight)):1;
      const vote=weight/(60+index+1), previous=row.votes.get(family)||0;
      row.score+=Math.max(0,vote-previous);
      row.votes.set(family,Math.max(previous,vote));
      row.bestRank = Math.min(row.bestRank, index+1);
      if (String(item.extract || '').length > row.extract.length) row.extract = String(item.extract).slice(0,1000);
    });
  }
  const rows = [...merged.values()].map(row => {
    const title = row.title.toLowerCase();
    const text = `${title} ${row.extract}`.toLowerCase();
    const relevance=tokenCoverage(subject,title)*.7+tokenCoverage(subject,text)*.3;
    return {...row, score:row.score*(.35+relevance), reason:row.votes.size>1 ? `Found by ${row.votes.size} sources` : row.sources.length>1 ? 'Found by related sources' : row.bestRank===1 ? 'Top match from this source' : 'Ranked by source position and query match'};
  }).sort((a,b)=>b.score-a.score || a.url.localeCompare(b.url));
  // When a real website candidate exists, lead with the strongest one. Keep
  // encyclopedia/directory pages as supporting references, not the whole feed.
  const website=rows.find(row=>row.kind==='website');
  const ordered=website?[website,...rows.filter(row=>row!==website)]:rows;
  const selected=[], deferred=[], domains=new Map();
  let referenceCount=0;
  for (const row of ordered) {
    if(row.kind==='reference'&&referenceCount>=2)continue;
    // DOI is a resolver for many publishers, not a single publishing domain.
    const prefix=row.domain==='doi.org'?new URL(row.url).pathname.split('/')[1].toLowerCase():'';
    const group=prefix?`doi.org/${prefix}`:row.domain;
    const count=domains.get(group)||0;
    if (count>=2) deferred.push(row);
    else { selected.push(row); domains.set(group,count+1);if(row.kind==='reference')referenceCount++; }
  }
  return [...selected,...deferred].slice(0,limit).map(({score,bestRank,votes,...row})=>row);
}
