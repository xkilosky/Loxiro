import type { Bang } from '../types';

/** DuckDuckGo-style bang shortcuts. Prefix-less: Loxiro resolves them instantly. */
export const BANGS: Bang[] = [
  { key: 'g', label: '!g', description: 'Google', engine: 'google' },
  { key: 'b', label: '!b', description: 'Bing', engine: 'bing' },
  { key: 'ddg', label: '!ddg', description: 'DuckDuckGo', engine: 'duckduckgo' },
  { key: 'br', label: '!br', description: 'Brave Search', engine: 'brave' },
  { key: 'p', label: '!p', description: 'Perplexity', engine: 'perplexity' },
  { key: 'ai', label: '!ai', description: 'AI answer', engine: 'perplexity' },
  { key: 'yt', label: '!yt', description: 'YouTube', engine: 'youtube' },
  { key: 'w', label: '!w', description: 'Wikipedia', engine: 'wikipedia' },
  { key: 'gh', label: '!gh', description: 'GitHub', engine: 'github' },
  { key: 'r', label: '!r', description: 'Reddit', engine: 'reddit' },
  { key: 'so', label: '!so', description: 'Stack Overflow', engine: 'stackoverflow' },
  { key: 'm', label: '!m', description: 'Maps', engine: 'maps' },
  { key: 'img', label: '!img', description: 'Images', engine: 'images' },
  { key: 'n', label: '!n', description: 'News', engine: 'news' },
];

const BANG_MAP = new Map(BANGS.map((b) => [b.key, b]));

export function findBang(key: string): Bang | undefined {
  return BANG_MAP.get(key.toLowerCase());
}
