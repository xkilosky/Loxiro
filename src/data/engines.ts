import type { Engine, EngineId } from '../types';

const enc = encodeURIComponent;

export const ENGINES: Engine[] = [
  {
    id: 'google', name: 'Google', short: 'Google', letter: 'G', color: '#4285F4', kind: 'web',
    url: (q) => `https://www.google.com/search?q=${enc(q)}`,
  },
  {
    id: 'bing', name: 'Bing', short: 'Bing', letter: 'B', color: '#008373', kind: 'web',
    url: (q) => `https://www.bing.com/search?q=${enc(q)}`,
  },
  {
    id: 'duckduckgo', name: 'DuckDuckGo', short: 'DuckDuckGo', letter: 'D', color: '#DE5833', kind: 'web',
    url: (q) => `https://duckduckgo.com/?q=${enc(q)}`,
  },
  {
    id: 'brave', name: 'Brave', short: 'Brave', letter: 'B', color: '#FB542B', kind: 'web',
    url: (q) => `https://search.brave.com/search?q=${enc(q)}`,
  },
  {
    id: 'perplexity', name: 'Perplexity', short: 'Perplexity', letter: 'P', color: '#20B2AA', kind: 'web',
    url: (q) => `https://www.perplexity.ai/search?q=${enc(q)}`,
  },
  {
    id: 'youtube', name: 'YouTube', short: 'YouTube', letter: 'Y', color: '#FF0033', kind: 'vertical',
    url: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`,
  },
  {
    id: 'wikipedia', name: 'Wikipedia', short: 'Wikipedia', letter: 'W', color: '#72777D', kind: 'vertical',
    url: (q) => `https://en.wikipedia.org/w/index.php?search=${enc(q)}`,
  },
  {
    id: 'github', name: 'GitHub', short: 'GitHub', letter: 'G', color: '#24292F', kind: 'vertical',
    url: (q) => `https://github.com/search?q=${enc(q)}`,
  },
  {
    id: 'reddit', name: 'Reddit', short: 'Reddit', letter: 'R', color: '#FF4500', kind: 'vertical',
    url: (q) => `https://www.reddit.com/search/?q=${enc(q)}`,
  },
  {
    id: 'stackoverflow', name: 'Stack Overflow', short: 'Stack Overflow', letter: 'S', color: '#F48024', kind: 'vertical',
    url: (q) => `https://stackoverflow.com/search?q=${enc(q)}`,
  },
  {
    id: 'maps', name: 'Maps', short: 'Maps', letter: 'M', color: '#34A853', kind: 'vertical',
    url: (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`,
  },
  {
    id: 'images', name: 'Images', short: 'Images', letter: 'I', color: '#A142F4', kind: 'vertical',
    url: (q) => `https://www.google.com/search?tbm=isch&q=${enc(q)}`,
  },
  {
    id: 'news', name: 'News', short: 'News', letter: 'N', color: '#EA4335', kind: 'vertical',
    url: (q) => `https://news.google.com/search?q=${enc(q)}`,
  },
];

export const WEB_ENGINES = ENGINES.filter((e) => e.kind === 'web');
export const VERTICAL_ENGINES = ENGINES.filter((e) => e.kind === 'vertical');

const MAP = new Map<EngineId, Engine>(ENGINES.map((e) => [e.id, e]));

export function getEngine(id: EngineId): Engine {
  return MAP.get(id) ?? WEB_ENGINES[0];
}

export function engineUrl(id: EngineId, q: string): string {
  return getEngine(id).url(q);
}

export function favicon(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}
