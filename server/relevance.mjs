/** Shared lexical relevance for natural questions, not an authority/accuracy score. */
const STOP=new Set(('a an the is are was were be been of and or to in on for with how what why when where who which best find search fix please '+
 'can could does do about explain tell me give information research papers studies study latest recent official website '+
 'el la los las un una unos unas de del y o en para por con que qué como cómo cual cuál cuales es son sobre investigar investigacion investigación explicame explícame información').split(/\s+/));
export function normalizedWords(value){return String(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}+#]+/gu)||[];}
function stem(word){return word.length>5&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>4&&word.endsWith('s')?word.slice(0,-1):word;}
export function usefulTokens(query){return [...new Set(normalizedWords(query).filter(t=>t.length>1&&!STOP.has(t)).map(stem))];}
export function tokenCoverage(query,text){const tokens=usefulTokens(query),words=new Set(normalizedWords(text).map(stem));return tokens.length?tokens.filter(t=>words.has(t)).length/tokens.length:1;}
/** Remove request scaffolding for specialist catalogs; broad web queries stay untouched. */
export function specialistQuery(query){
  return String(query).replace(/^(?:(?:what|how|why)\s+(?:is|are|does|do)\s+|(?:please\s+)?(?:find|show|give|tell)(?:\s+me)?\s+|(?:latest|recent)\s+)?(?:research|papers?|studies|information)(?:\s+(?:about|on|for))?\s+/i,'')
    .replace(/^(?:what\s+(?:is|are)|tell\s+me\s+about|explain|que\s+es|qué\s+es|investiga(?:cion|ción)?\s+(?:sobre|de))\s+/i,'')
    .replace(/\s+(?:research|research\s+papers?|papers?|studies)\s*$/i,'').replace(/[?¿]+/g,'').trim()||query;
}
