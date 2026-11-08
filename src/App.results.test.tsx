// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import App from './App';
import type { UnifiedSearchResponse } from './types';

const feed: UnifiedSearchResponse = {
  query: 'solar energy',
  ranking: 'reciprocal rank fusion',
  limitedWebCoverage: false,
  websiteCount: 1,
  referenceCount: 1,
  domainCount: 2,
  providers: [
    { id: 'duckduckgo_web', name: 'DuckDuckGo Web', kind: 'web', access: 'keyless', status: 'ok', count: 2 },
    { id: 'wikipedia', name: 'Wikipedia', kind: 'knowledge', access: 'keyless', status: 'ok', count: 1 },
  ],
  results: [
    {
      title: 'Solar Energy Technologies Office',
      url: 'https://www.energy.gov/eere/solar/solar-energy-technologies-office',
      domain: 'energy.gov',
      kind: 'website',
      extract: 'The Solar Energy Technologies Office funds early-stage research.',
      sources: ['DuckDuckGo Web'],
      reason: 'Top match from this source',
    },
    {
      title: 'Solar energy',
      url: 'https://en.wikipedia.org/wiki/Solar_energy',
      domain: 'en.wikipedia.org',
      kind: 'reference',
      extract: 'Solar energy is radiant light and heat from the Sun.',
      sources: ['Wikipedia'],
      reason: 'Found by related sources',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  // jsdom has no layout engine; TabBar scrolls the active tab into view on mount.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  if (!globalThis.crypto?.randomUUID) {
    let n = 0;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `id-${++n}` } });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function serve(payload: UnifiedSearchResponse) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('web results are presented as web results', () => {
  it('leads with the web destination and marks the reference as a reference', async () => {
    serve(feed);
    location.hash = '#results?q=solar%20energy';

    render(<App />);

    await waitFor(() => expect(document.querySelectorAll('.knowledge-result')).toHaveLength(2));
    const [first, second] = [...document.querySelectorAll('.knowledge-result')];
    expect(first.querySelector('a')?.textContent).toContain('Solar Energy Technologies Office');
    // Only the encyclopedia entry carries the reference treatment.
    expect(first.className).not.toContain('is-reference');
    expect(second.className).toContain('is-reference');
    // The badge distinguishes the two, so the feed does not read as one Wikipedia list.
    expect(first.querySelector('.result-kind')?.textContent).toBe('Web result');
    expect(second.querySelector('.result-kind')?.textContent).toBe('Encyclopedia reference');
    // The limited-coverage banner stays removed at the user's request; the badge and
    // the counts row are the only honest signal that a feed is thin.
    expect(document.querySelector('.coverage-note')).toBeNull();
  });
});
