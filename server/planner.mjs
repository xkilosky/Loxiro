/** This is routing, not a claim that specialists index the entire web. */
const RULES={
  code:/\b(code|coding|programming|javascript|typescript|python|react|useeffect|rust|golang|java|sql|css|html|api|npm|error|exception|debug|docker|linux|github|repository|repositories|open.source|software|developer|framework|sdk)\b/i,
  research:/\b(research|paper|papers|study|studies|scientific|science|quantum|physics|biology|chemistry|mathematics|machine.learning|neural|climate|astronomy|genomics|doi|academic|computing|algorithm)\b/i,
  health:/\b(health|medical|medicine|clinical|cancer|diabetes|disease|treatment|vaccine|virus|covid|symptom|therapy|nutrition|gene|genetic|biomedical|patient|drug|protein)\b/i,
  books:/\b(book|books|novel|novels|author|isbn|literature|poetry|poem|read|reading|textbook|tolkien|shakespeare|austen|orwell)\b/i,
  media:/\b(music|song|songs|album|artist|podcast|movie|movies|film|films|cinema|soundtrack|singer|band|audiobook|taylor.swift|beatles)\b/i,
  archives:/\b(archive|historical|history|documentary|documentaries|public.domain|manuscript|recording|vintage|classic|classics|newspaper|library)\b/i,
  technology:/\b(technology|tech|startup|software|programming|computing|computer|artificial.intelligence|ai|open.source|developer|internet|browser|security|chip|semiconductor|innovation)\b/i,
};
export function queryTopics(query){return Object.entries(RULES).filter(([,rule])=>rule.test(query)).map(([topic])=>topic);}
export function planProviders(query, providers, env={}) {
  const topics=queryTopics(query);
  const eligible=providers.filter(p=>!p.key||env[p.key]).filter(p=>!p.paid||env.LOXIRO_ALLOW_PAID_PROVIDERS==='1');
  const scores=eligible.map(p=>({p,score:p.priority??(p.topics?.some(t=>topics.includes(t))?70:0)})).filter(v=>v.score>0);
  // A strict cap keeps one search from fanning out to every registered API.
  const selected=scores.sort((a,b)=>b.score-a.score).slice(0,8).map(v=>v.p.id);
  return {topics:topics.length?topics:['general'],selected};
}
