import {describe,it,expect} from 'vitest';
import {resultLabel} from './resultLabels';
describe('honest result categories',()=>{
  it('distinguishes papers, registry records and documentation from generic websites',()=>{
    expect(resultLabel({domain:'doi.org',contentType:'paper'})).toBe('Research paper');
    expect(resultLabel({domain:'clinicaltrials.gov',contentType:'clinical-trial'})).toBe('Clinical study record');
    expect(resultLabel({domain:'developer.mozilla.org',contentType:'documentation'})).toBe('Documentation');
    expect(resultLabel({domain:'nasa.gov',contentType:'linked-source'})).toBe('Article-linked source');
  });
  it('retains compatibility with cached responses without new metadata',()=>{
    expect(resultLabel({domain:'en.wikipedia.org'})).toBe('Encyclopedia reference');expect(resultLabel({domain:'example.org'})).toBe('Web result');
  });
  it('labels web-search destinations differently from encyclopedia references',()=>{
    expect(resultLabel({domain:'nasa.gov',kind:'website'})).toBe('Web result');
    expect(resultLabel({domain:'en.wikipedia.org',kind:'reference'})).toBe('Encyclopedia reference');
  });
});
