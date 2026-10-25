import {canonicalUrl,isReferenceDomain} from './rank.mjs';

/** P856 is crowdsourced directory metadata, not an independent site verification. */
export function listedWebsites(matches,entities){
  return matches.flatMap(match=>{
    const claims=(entities?.[match.id]?.claims?.P856||[]).filter(claim=>
      claim.rank!=='deprecated'&&claim.mainsnak?.snaktype==='value'&&
      claim.mainsnak?.datatype==='url'&&!claim.qualifiers?.P582?.length&&!claim.qualifiers?.P1534?.length
    ).map(claim=>({rank:claim.rank,url:canonicalUrl(claim.mainsnak.datavalue?.value)})).filter(claim=>{
      if(!claim.url||isReferenceDomain(claim.url.domain))return false;
      const host=claim.url.domain;
      // Never suggest local-network or reserved-address destinations as public sites.
      return host.includes('.')&&!host.includes(':')&&!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
    });
    const preferred=claims.filter(c=>c.rank==='preferred');
    const unique=new Set();
    return(preferred.length?preferred:claims).filter(c=>!unique.has(c.url.key)&&unique.add(c.url.key)).slice(0,2).map(c=>({
      title:`${match.label||match.id} — Website`,url:c.url.url,
      extract:[match.description,'Website address listed in Wikidata. This directory entry is not an independent verification of the site.'].filter(Boolean).join(' · '),
    }));
  });
}
