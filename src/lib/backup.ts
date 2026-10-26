import type { EngineId, RecentSearch, SavedLink, Settings, Space } from '../types';
import { WEB_ENGINES, VERTICAL_ENGINES } from '../data/engines';
import { safeUrl } from './storage';
import { MAX_CLOSED_TABS, MAX_TABS, sanitizeTabList, sortTabs, type TabSession, type WorkspaceTab } from './tabs';

/** Hard limits for a restored file. They bound memory use, not a promise that this many items are usable. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_SPACES = 50;
export const MAX_SAVED = 1000;
export const MAX_RECENTS = 40;
export const FALLBACK_SPACE = 'inbox';

const CONCURRENCY_CHOICES = [1, 2, 3, 4];
const PART_CHOICES = [1, 8, 16, 32];
const THEMES = ['light', 'dark', 'system'];
const BOOLEAN_KEYS = ['openInNewTab', 'showRecents', 'reduceMotion', 'safeMode'] as const;
const ID_RE = /^[\w-]{1,80}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isEngine = (v: unknown): v is EngineId => [...WEB_ENGINES, ...VERTICAL_ENGINES].some(e => e.id === v);
const timestamp = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Date.now();
const text = (v: unknown, max: number): string => typeof v === 'string' ? v.slice(0, max) : '';

export type BackupMode = 'merge' | 'replace';

export interface BackupData {
  settings: Partial<Settings>;
  spaces: Space[];
  saved: SavedLink[];
  recents: RecentSearch[];
  tabs: TabSession | null;
  exportedAt: string | null;
  /** Sections that were present in the file, even when sanitizing removed every entry. */
  present: ('settings' | 'spaces' | 'saved' | 'recents' | 'tabs')[];
}

export type BackupParse =
  | { ok: true; data: BackupData; warnings: string[] }
  | { ok: false; error: string };

export interface RestoreSummary {
  added: { spaces: number; saved: number; recents: number; tabs: number; closed: number };
  skipped: { spaces: number; saved: number; recents: number; tabs: number; closed: number; settings: number };
  settingsChanged: number;
}

export interface RestoreInput {
  settings: Settings;
  spaces: Space[];
  saved: SavedLink[];
  recents: RecentSearch[];
  tabs: TabSession;
}

export interface RestoreResult extends RestoreInput {
  summary: RestoreSummary;
}

function cleanSpaces(raw: unknown, warnings: string[]): Space[] {
  const seen = new Set<string>(); const out: Space[] = []; let dropped = 0;
  for (const item of asArray(raw)) {
    if (!isObject(item)) { dropped++; continue; }
    const id = typeof item.id === 'string' ? item.id : '';
    const name = text(item.name, 60).trim();
    const color = typeof item.color === 'string' && COLOR_RE.test(item.color) ? item.color : '#7A68D8';
    if (!ID_RE.test(id) || !name || seen.has(id)) { dropped++; continue; }
    seen.add(id); out.push({ id, name, color, createdAt: timestamp(item.createdAt) });
  }
  if (dropped) warnings.push(`${dropped} space${dropped === 1 ? '' : 's'} skipped: missing name or id.`);
  return out.slice(0, MAX_SPACES);
}

function cleanSaved(raw: unknown, warnings: string[]): { list: SavedLink[]; rejected: number } {
  const seen = new Set<string>(); const out: SavedLink[] = []; let dropped = 0;
  for (const item of asArray(raw)) {
    if (!isObject(item)) { dropped++; continue; }
    // safeUrl only allows http/https, so javascript:, data:, and blob: URLs cannot be restored.
    const url = safeUrl(typeof item.url === 'string' ? item.url : '');
    if (!url) { dropped++; continue; }
    const key = url.toLowerCase();
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    const note = text(item.note, 500);
    const id = typeof item.id === 'string' && ID_RE.test(item.id) ? item.id : `${seen.size}-${url.length}`;
    out.push({
      id,
      url,
      title: text(item.title, 180).trim() || new URL(url).hostname,
      ...(note ? { note } : {}),
      spaceId: typeof item.spaceId === 'string' ? item.spaceId : FALLBACK_SPACE,
      createdAt: timestamp(item.createdAt),
    });
  }
  if (dropped) warnings.push(`${dropped} saved link${dropped === 1 ? '' : 's'} skipped: unsupported address or duplicate.`);
  return { list: out, rejected: dropped };
}

function cleanRecents(raw: unknown, warnings: string[]): RecentSearch[] {
  const seen = new Set<string>(); const out: RecentSearch[] = []; let dropped = 0;
  for (const item of asArray(raw)) {
    if (!isObject(item)) { dropped++; continue; }
    const query = text(item.query, 200).trim();
    if (!query || !isEngine(item.engine) || seen.has(query)) { dropped++; continue; }
    seen.add(query);
    out.push({
      id: typeof item.id === 'string' && ID_RE.test(item.id) ? item.id : `r-${seen.size}`,
      query,
      engine: item.engine,
      createdAt: timestamp(item.createdAt),
    });
  }
  if (dropped) warnings.push(`${dropped} recent search${dropped === 1 ? '' : 'es'} skipped: empty, unknown engine, or duplicate.`);
  return out.slice(0, MAX_RECENTS);
}

function cleanSettings(raw: unknown, warnings: string[]): Partial<Settings> {
  if (!isObject(raw)) return {};
  const out: Partial<Settings> = {}; let ignored = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (THEMES.includes(String(value)) && key === 'theme') { out.theme = value as Settings['theme']; continue; }
    if (key === 'defaultEngine' && isEngine(value)) { out.defaultEngine = value; continue; }
    if (key === 'concurrency' && CONCURRENCY_CHOICES.includes(Number(value))) { out.concurrency = Number(value); continue; }
    if (key === 'downloadParts' && PART_CHOICES.includes(Number(value))) { out.downloadParts = Number(value); continue; }
    if ((BOOLEAN_KEYS as readonly string[]).includes(key) && typeof value === 'boolean') {
      out[key as typeof BOOLEAN_KEYS[number]] = value; continue;
    }
    ignored++;
  }
  if (ignored) warnings.push(`${ignored} unrecognized setting${ignored === 1 ? '' : 's'} ignored.`);
  return out;
}

function cleanTabs(raw: unknown): TabSession | null {
  if (!isObject(raw)) return null;
  const tabs = sanitizeTabList(raw.tabs);
  if (!tabs.length) return null;
  const closed = sanitizeTabList(raw.closed).slice(0, MAX_CLOSED_TABS);
  const sorted = sortTabs(tabs.slice(0, MAX_TABS));
  const activeId = typeof raw.activeId === 'string' && sorted.some(t => t.id === raw.activeId) ? raw.activeId : sorted[0].id;
  return { tabs: sorted, activeId, closed };
}

/**
 * Parses and sanitizes a Loxiro backup file. Nothing here touches storage or the DOM:
 * callers decide what to do with the result.
 */
export function parseBackup(raw: string): BackupParse {
  if (!raw.trim()) return { ok: false, error: 'That file is empty.' };
  if (raw.length > MAX_BACKUP_BYTES) return { ok: false, error: 'That backup is larger than 5 MB. Export again or split it up.' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!isObject(parsed)) return { ok: false, error: 'A Loxiro backup is a JSON object.' };
  const known = ['settings', 'spaces', 'saved', 'recents', 'tabs'];
  const present = known.filter(k => parsed[k] !== undefined) as BackupData['present'];
  if (!present.length) return { ok: false, error: 'This JSON has no Loxiro data in it.' };

  const warnings: string[] = [];
  const tabs = cleanTabs(parsed.tabs);
  if (parsed.tabs !== undefined && !tabs) warnings.push('No usable tab session in the file.');
  return {
    ok: true,
    warnings,
    data: {
      settings: cleanSettings(parsed.settings, warnings),
      spaces: cleanSpaces(parsed.spaces, warnings),
      saved: cleanSaved(parsed.saved, warnings).list,
      recents: cleanRecents(parsed.recents, warnings),
      tabs,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
      present,
    },
  };
}

/** Applies a parsed backup to current state. `merge` only adds; `replace` swaps whole sections. */
export function applyBackup(current: RestoreInput, incoming: BackupData, mode: BackupMode): RestoreResult {
  const summary: RestoreSummary = {
    added: { spaces: 0, saved: 0, recents: 0, tabs: 0, closed: 0 },
    skipped: { spaces: 0, saved: 0, recents: 0, tabs: 0, closed: 0, settings: 0 },
    settingsChanged: 0,
  };
  // `replace` only swaps sections the backup actually contains; absent sections stay as they are.
  const replaces = (section: BackupData['present'][number]) => mode === 'replace' && incoming.present.includes(section);

  // --- settings: only keys the backup carries; missing keys keep their current value ---
  const settings = { ...current.settings, ...incoming.settings };
  summary.settingsChanged = Object.keys(incoming.settings).length;

  // --- spaces: ids win first, then names (case-insensitive) ---
  const spaces = replaces('spaces') ? [] : [...current.spaces];
  const usedNames = new Set(spaces.map(s => s.name.toLowerCase()));
  for (const space of incoming.spaces) {
    if (spaces.some(s => s.id === space.id) || usedNames.has(space.name.toLowerCase())) { summary.skipped.spaces++; continue; }
    if (spaces.length >= MAX_SPACES) { summary.skipped.spaces++; continue; }
    spaces.push(space); usedNames.add(space.name.toLowerCase()); summary.added.spaces++;
  }
  const spaceIds = new Set(spaces.map(s => s.id));

  // --- saved links: one entry per URL, newest first ---
  const saved = replaces('saved') ? [] : [...current.saved];
  const seenUrls = new Set(saved.map(s => s.url.toLowerCase()));
  for (const link of incoming.saved) {
    const key = link.url.toLowerCase();
    if (seenUrls.has(key)) { summary.skipped.saved++; continue; }
    if (saved.length >= MAX_SAVED) { summary.skipped.saved++; continue; }
    seenUrls.add(key);
    saved.push(spaceIds.has(link.spaceId) ? link : { ...link, spaceId: FALLBACK_SPACE });
    summary.added.saved++;
  }
  if (summary.added.saved) saved.sort((a, b) => b.createdAt - a.createdAt);

  // --- recents: one entry per query, newest first ---
  const recents = replaces('recents') ? [] : [...current.recents];
  const seenQueries = new Set(recents.map(r => r.query));
  for (const recent of incoming.recents) {
    if (seenQueries.has(recent.query)) { summary.skipped.recents++; continue; }
    if (recents.length >= MAX_RECENTS) { summary.skipped.recents++; continue; }
    seenQueries.add(recent.query); recents.push(recent); summary.added.recents++;
  }
  if (summary.added.recents) recents.sort((a, b) => b.createdAt - a.createdAt);

  // --- tabs ---
  let tabs = current.tabs;
  const incomingTabs = incoming.tabs;
  if (incomingTabs) {
    const open: WorkspaceTab[] = replaces('tabs') ? [] : [...current.tabs.tabs];
    const openIds = new Set(open.map(t => t.id));
    for (const tab of incomingTabs.tabs) {
      if (openIds.has(tab.id)) { summary.skipped.tabs++; continue; }
      if (open.length >= MAX_TABS) { summary.skipped.tabs++; continue; }
      open.push(tab); openIds.add(tab.id); summary.added.tabs++;
    }
    const closed: WorkspaceTab[] = replaces('tabs') ? [] : [...current.tabs.closed];
    const closedIds = new Set([...closed.map(t => t.id), ...openIds]);
    for (const tab of incomingTabs.closed) {
      if (closedIds.has(tab.id)) { summary.skipped.closed++; continue; }
      if (closed.length >= MAX_CLOSED_TABS) { summary.skipped.closed++; continue; }
      closed.push(tab); closedIds.add(tab.id); summary.added.closed++;
    }
    const ordered = sortTabs(open);
    const prefer = replaces('tabs') ? incomingTabs.activeId : current.tabs.activeId;
    const activeId = ordered.some(t => t.id === prefer) ? prefer
      : ordered.some(t => t.id === incomingTabs.activeId) ? incomingTabs.activeId : ordered[0].id;
    tabs = { tabs: ordered, activeId, closed };
  }

  return { settings, spaces, saved, recents, tabs, summary };
}

/** Human-readable one-liner for the toast after a restore. */
export function describeSummary(summary: RestoreSummary): string {
  const parts: string[] = [];
  const push = (n: number, label: string) => { if (n) parts.push(`${n} ${label}${n === 1 ? '' : 's'}`); };
  push(summary.added.saved, 'link');
  push(summary.added.recents, 'recent search');
  push(summary.added.spaces, 'space');
  push(summary.added.tabs, 'tab');
  push(summary.added.closed, 'closed tab');
  push(summary.settingsChanged, 'setting');
  if (!parts.length) return 'Nothing new in that backup.';
  const dropped = Object.values(summary.skipped).reduce((a, b) => a + b, 0);
  return `Restored ${parts.join(', ')}.${dropped ? ` ${dropped} duplicate or over-limit item${dropped === 1 ? '' : 's'} skipped.` : ''}`;
}
