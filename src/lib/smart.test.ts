import { describe, it, expect } from 'vitest';
import { analyze, calculate, convert, normalizeUrl, parseColor, textStats } from './smart';
import { engineUrl } from '../data/engines';
import { safeUrl } from './storage';

describe('safe calculator',()=>{
  it.each([['sqrt(1764)',42],['(128 + 64) / 3',64],['2 ^ 16',65536],['sin(pi / 2)',1],['15 * 24 + 380',740],['pow(2, 3)',8],['max(1, 2, 3)',3],['10 % 3',1],['1 + 2 * 3',7],['2^3^2',512]])('%s → %s',(q,n)=>expect(calculate(q)).toBe(n));
  it.each(['alert(1)','window.location','1/0','sqrt(-1)','2 +','constructor(1)','just a search'])('rejects %s',q=>expect(calculate(q)).toBeNull());
  it('uses conventional unary precedence',()=>expect(calculate('-2^2')).toBe(-4));
});
describe('conversions',()=>{
  it.each([['100 km to mi','62.13711922 mi'],['72 f to c','22.222222°C'],['1 gb to mb','1,024 MB'],['48 hours to days','2 d'],['5 l to gal','1.32086026 gal']])('%s',(q,result)=>expect(convert(q)?.value).toBe(result));
  it('rejects incompatible units',()=>expect(convert('1 kg to km')).toBeNull());
});
describe('routing and safety',()=>{
  it.each([['!w quantum computing','wikipedia','quantum computing'],['quantum computing !w','wikipedia','quantum computing'],['cats !g','google','cats'],['!yt cats','youtube','cats']])('routes %s',(q,engine,clean)=>{const a=analyze(q);expect(a.engine).toBe(engine);expect(a.cleanQuery).toBe(clean);});
  it('encodes queries',()=>expect(engineUrl('google','a & b?')).toBe('https://www.google.com/search?q=a%20%26%20b%3F'));
  it.each(['javascript:alert(1)','data:text/html,hey','file:///etc/passwd'])('rejects %s',s=>{expect(safeUrl(s)).toBeNull();expect(normalizeUrl(s)).toBeNull();});
  it('recognizes URLs',()=>expect(normalizeUrl('github.com/xkilosky')).toBe('https://github.com/xkilosky'));
  it('recognizes questions',()=>expect(analyze('what is quantum computing').intent).toBe('question'));
  it('recognizes calculations',()=>expect(analyze('sqrt(1764)').value).toBe('42'));
  it('recognizes colors',()=>expect(parseColor('#fff')?.rgb).toBe('rgb(255, 255, 255)'));
  it('counts words',()=>expect(textStats('hello world').words).toBe(2));
});
