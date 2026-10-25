export type EngineId =
  | 'google' | 'bing' | 'duckduckgo' | 'brave' | 'perplexity'
  | 'youtube' | 'wikipedia' | 'github' | 'reddit' | 'stackoverflow'
  | 'maps' | 'images' | 'news';

export interface Engine {
  id: EngineId;
  name: string;
  short: string;
  color: string;
  letter: string;
  kind: 'web' | 'vertical';
  url: (q: string) => string;
}

export interface Bang {
  key: string;
  label: string;
  description: string;
  engine: EngineId;
  prefix?: string;
}

export type Screen = 'home' | 'results' | 'smart' | 'spaces' | 'downloads' | 'settings';

export interface Route {
  screen: Screen;
  q?: string;
  e?: EngineId;
}

export interface RecentSearch {
  id: string;
  query: string;
  engine: EngineId;
  createdAt: number;
}

export interface SavedLink {
  id: string;
  title: string;
  url: string;
  note?: string;
  spaceId: string;
  createdAt: number;
}

export interface Space {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  theme: Theme;
  defaultEngine: EngineId;
  concurrency: number;
  openInNewTab: boolean;
  showRecents: boolean;
  reduceMotion: boolean;
  safeMode: boolean;
}

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'delegated' | 'error' | 'cancelled';

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  status: DownloadStatus;
  received: number;
  total: number;
  speed: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  generated?: boolean;
  size?: number;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'default' | 'success' | 'error';
}

export interface KnowledgeAnswer {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
  source: string;
}

export type SmartIntent =
  | 'url' | 'calculation' | 'conversion' | 'color' | 'time'
  | 'bang' | 'question' | 'code' | 'search' | 'empty';

export interface SmartAnalysis {
  intent: SmartIntent;
  headline: string;
  value?: string;
  detail?: string;
  engine: EngineId;
  url?: string;
  confidence: number;
  tokens: string[];
  bang?: Bang;
  cleanQuery: string;
}
