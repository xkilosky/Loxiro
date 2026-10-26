import { describe, expect, it } from 'vitest';
import type { Settings } from '../types';
import { MAX_CLOSED_TABS, MAX_TABS, type TabSession, type WorkspaceTab } from './tabs';
import {
  MAX_RECENTS, MAX_SAVED, MAX_SPACES, applyBackup, describeSummary, parseBackup,
  type BackupData, type BackupParse, type RestoreInput,
} from './backup';

const settings: Settings = {
  theme: 'light', defaultEngine: 'duckduckgo', concurrency: 2, downloadParts: 8,
  openInNewTab: true, showRecents: true, reduceMotion: false, safeMode: true,
};

function tab(id: string, extra: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return { id, screen: 'home', q: '', draft: '', engine: 'duckduckgo', pinned: false, ...extra };
}

function session(tabs: WorkspaceTab[], closed: WorkspaceTab[] = []): TabSession {
  return { tabs: tabs.length ? tabs : [tab('blank')], activeId: (tabs[0] ?? tab('blank')).id, closed };
}

function current(over: Partial<RestoreInput> = {}): RestoreInput {
  return {
    settings,
    spaces: [{ id: 'inbox', name: 'Reading list', color: '#7A68D8', createdAt: 1 }],
    saved: [{ id: 's1', title: 'Existing', url: 'https://example.com/a', spaceId: 'inbox', createdAt: 10 }],
    recents: [{ id: 'r1', query: 'existing query', engine: 'duckduckgo', createdAt: 10 }],
    tabs: session([tab('t1')]),
    ...over,
  };
}

/** Asserts a rejection and returns its message, so the union narrows correctly. */
function failMessage(result: BackupParse): string {
  if (result.ok) throw new Error(`expected a rejection, got ${result.data.present.join(',')}`);
  return result.error;
}

const SECTIONS = ['settings', 'spaces', 'saved', 'recents', 'tabs'] as const;

/** Builds a parsed-backup value, deriving `present` exactly the way parseBackup does. */
function incomingOf(over: Partial<BackupData> = {}): BackupData {
  const data: BackupData = { settings: {}, spaces: [], saved: [], recents: [], tabs: null, exportedAt: null, present: [], ...over };
  data.present = SECTIONS.filter(k => k === 'settings' ? Object.keys(data.settings).length > 0
    : k === 'tabs' ? data.tabs !== null : data[k].length > 0) as unknown as BackupData['present'];
  return data;
}

/** Round-trips through parseBackup the way the UI does: stringify → parse. */
function parse(data: unknown) {
  const parsed = parseBackup(JSON.stringify(data));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  return { data: parsed.data, warnings: parsed.warnings };
}

describe('backup parsing', () => {
  it('rejects files that are not a Loxiro backup', () => {
    expect(parseBackup('').ok).toBe(false);
    expect(parseBackup('   ').ok).toBe(false);
    expect(failMessage(parseBackup('not json{'))).toContain('not valid JSON');
    expect(failMessage(parseBackup('[1,2,3]'))).toContain('JSON object');
    expect(parseBackup('"a string"').ok).toBe(false);
    expect(failMessage(parseBackup('{"unrelated":true}'))).toContain('no Loxiro data');
  });

  it('rejects oversized files before parsing them', () => {
    const huge = `{"saved":[${'"x",'.repeat(3_000_000)}"y"]}`;
    expect(failMessage(parseBackup(huge))).toContain('5 MB');
  });

  it('round-trips an exported backup without losing data', () => {
    const exported = {
      settings,
      spaces: [{ id: 'work', name: 'Work', color: '#123456', createdAt: 5 }],
      saved: [{ id: 'a', title: 'Kept', url: 'https://example.com/kept', note: 'why', spaceId: 'work', createdAt: 99 }],
      recents: [{ id: 'r', query: 'solar energy', engine: 'google', createdAt: 42 }],
      tabs: { tabs: [tab('one', { screen: 'results', q: 'hello', pinned: true })], activeId: 'one', closed: [tab('two')] },
      exportedAt: '2026-10-26T00:00:00.000Z',
    };
    const { data } = parse(exported);
    expect(data.settings).toEqual(settings);
    expect(data.spaces).toHaveLength(1);
    expect(data.saved[0]).toMatchObject({ title: 'Kept', note: 'why', spaceId: 'work', createdAt: 99 });
    expect(data.recents[0].query).toBe('solar energy');
    expect(data.tabs?.tabs[0]).toMatchObject({ id: 'one', pinned: true, q: 'hello' });
    expect(data.tabs?.closed).toHaveLength(1);
    expect(data.exportedAt).toBe('2026-10-26T00:00:00.000Z');
    expect(data.present).toEqual(['settings', 'spaces', 'saved', 'recents', 'tabs']);
  });

  it('drops script URLs and non-http addresses instead of restoring them', () => {
    const { data, warnings } = parse({
      saved: [
        { id: 'a', title: 'XSS', url: 'javascript:alert(1)', spaceId: 'inbox', createdAt: 1 },
        { id: 'b', title: 'Data', url: 'data:text/html,<h1>hi</h1>', spaceId: 'inbox', createdAt: 2 },
        { id: 'c', title: 'File', url: 'file:///etc/passwd', spaceId: 'inbox', createdAt: 3 },
        { id: 'd', title: 'Good', url: 'https://example.com/ok', spaceId: 'inbox', createdAt: 4 },
      ],
    });
    expect(data.saved.map(s => s.url)).toEqual(['https://example.com/ok']);
    expect(warnings.join(' ')).toContain('3 saved links skipped');
  });

  it('falls back to the hostname when a saved title is missing', () => {
    const { data } = parse({ saved: [{ id: 'a', url: 'https://www.example.com/page', spaceId: 'inbox' }] });
    expect(data.saved[0].title).toBe('www.example.com');
  });

  it('ignores unknown settings and out-of-range values', () => {
    const { data, warnings } = parse({
      settings: { theme: 'neon', defaultEngine: 'not-an-engine', concurrency: 99, downloadParts: 7,
        openInNewTab: 'yes', reduceMotion: true, injected: 'x', __proto__: 1 },
    });
    expect(data.settings).toEqual({ reduceMotion: true });
    expect(warnings.join(' ')).toContain('unrecognized setting');
  });

  it('accepts only the engine and part choices the app itself offers', () => {
    const { data } = parse({ settings: { theme: 'dark', defaultEngine: 'youtube', concurrency: 4, downloadParts: 32 } });
    expect(data.settings).toEqual({ theme: 'dark', defaultEngine: 'youtube', concurrency: 4, downloadParts: 32 });
  });

  it('dedupes recents by query and caps the list', () => {
    const recents = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, query: `query ${i % 50}`, engine: 'google', createdAt: i }));
    const { data, warnings } = parse({ recents });
    expect(data.recents).toHaveLength(MAX_RECENTS);
    expect(new Set(data.recents.map(r => r.query)).size).toBe(data.recents.length);
    expect(warnings.join(' ')).toContain('recent searches skipped');
  });

  it('drops spaces with no name, a bad colour, or a duplicate id', () => {
    const { data } = parse({
      spaces: [
        { id: 'ok', name: 'Kept', color: '#abcdef', createdAt: 1 },
        { id: 'bad-color', name: 'Fallback colour', color: 'red', createdAt: 2 },
        { id: 'no-name', name: '   ', color: '#fff', createdAt: 3 },
        { id: 'ok', name: 'Duplicate id', color: '#fff', createdAt: 4 },
        null,
      ],
    });
    expect(data.spaces.map(s => s.id)).toEqual(['ok', 'bad-color']);
    expect(data.spaces[1].color).toBe('#7A68D8');
  });

  it('caps the tab session and warns when nothing in it is usable', () => {
    const { data } = parse({
      tabs: { tabs: Array.from({ length: 40 }, (_, i) => tab(`t${i}`)), closed: Array.from({ length: 30 }, (_, i) => tab(`c${i}`)) },
    });
    expect(data.tabs?.tabs).toHaveLength(MAX_TABS);
    expect(data.tabs?.closed).toHaveLength(MAX_CLOSED_TABS);

    const empty = parse({ tabs: { tabs: [null, { id: 'nope' }], closed: [] } });
    expect(empty.data.tabs).toBeNull();
    expect(empty.warnings.join(' ')).toContain('No usable tab session');
  });

  it('accepts a partial backup with only one section', () => {
    const { data } = parse({ saved: [{ id: 'a', title: 'Only', url: 'https://example.com/only', spaceId: 'inbox', createdAt: 1 }] });
    expect(data.present).toEqual(['saved']);
    expect(data.spaces).toEqual([]);
    expect(data.tabs).toBeNull();
  });
});

describe('merge restore', () => {
  it('adds new items and keeps existing ones untouched', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [{ id: 'n', title: 'New', url: 'https://example.com/new', spaceId: 'inbox', createdAt: 20 }],
      recents: [{ id: 'rn', query: 'new query', engine: 'google', createdAt: 20 }],
      spaces: [{ id: 'work', name: 'Work', color: '#123456', createdAt: 1 }],
    }), 'merge');
    expect(result.saved.map(s => s.url)).toEqual(['https://example.com/new', 'https://example.com/a']);
    expect(result.recents).toHaveLength(2);
    expect(result.spaces).toHaveLength(2);
    expect(result.summary.added).toMatchObject({ saved: 1, recents: 1, spaces: 1 });
    expect(result.settings).toEqual(settings);
  });

  it('skips links already saved, matching the app’s one-entry-per-URL rule', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [
        { id: 'dup', title: 'Same URL', url: 'https://EXAMPLE.com/a', spaceId: 'inbox', createdAt: 99 },
        { id: 'new', title: 'Fresh', url: 'https://example.com/b', spaceId: 'inbox', createdAt: 50 },
      ],
    }), 'merge');
    expect(result.saved).toHaveLength(2);
    expect(result.saved.find(s => s.url === 'https://example.com/a')?.title).toBe('Existing');
    expect(result.summary.skipped.saved).toBe(1);
  });

  it('reassigns saved links whose space does not exist to Reading list', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [{ id: 'x', title: 'Orphan', url: 'https://example.com/orphan', spaceId: 'deleted-space', createdAt: 30 }],
    }), 'merge');
    expect(result.saved.find(s => s.url === 'https://example.com/orphan')?.spaceId).toBe('inbox');
  });

  it('uses the backup’s spaces before remapping links into them', () => {
    const result = applyBackup(current(), incomingOf({
      spaces: [{ id: 'work', name: 'Work', color: '#123456', createdAt: 1 }],
      saved: [{ id: 'x', title: 'In work', url: 'https://example.com/work', spaceId: 'work', createdAt: 30 }],
    }), 'merge');
    expect(result.saved.find(s => s.url === 'https://example.com/work')?.spaceId).toBe('work');
  });

  it('never creates two spaces with the same name', () => {
    const result = applyBackup(current(), incomingOf({
      spaces: [{ id: 'other', name: 'reading LIST', color: '#000000', createdAt: 1 }],
    }), 'merge');
    expect(result.spaces).toHaveLength(1);
    expect(result.summary.skipped.spaces).toBe(1);
  });

  it('applies backup settings over the current ones without dropping unset keys', () => {
    const result = applyBackup(current(), incomingOf({ settings: { theme: 'dark', concurrency: 4 } }), 'merge');
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.concurrency).toBe(4);
    expect(result.settings.defaultEngine).toBe('duckduckgo');
    expect(result.summary.settingsChanged).toBe(2);
  });

  it('adds tabs without disturbing the current one, and respects the tab cap', () => {
    const busy = current({ tabs: session(Array.from({ length: MAX_TABS }, (_, i) => tab(`t${i}`))) });
    const result = applyBackup(busy, incomingOf({
      tabs: { tabs: [tab('incoming')], activeId: 'incoming', closed: [tab('c1')] },
    }), 'merge');
    expect(result.tabs.tabs).toHaveLength(MAX_TABS);
    expect(result.tabs.activeId).toBe('t0');
    expect(result.summary.skipped.tabs).toBe(1);
    expect(result.tabs.closed).toHaveLength(1);
  });

  it('keeps pinned tabs first after merging a tab session', () => {
    const result = applyBackup(current(), incomingOf({
      tabs: { tabs: [tab('pinned', { pinned: true })], activeId: 'pinned', closed: [] },
    }), 'merge');
    expect(result.tabs.tabs.map(t => t.id)).toEqual(['pinned', 't1']);
  });

  it('skips tabs whose id already exists rather than duplicating them', () => {
    const result = applyBackup(current(), incomingOf({
      tabs: { tabs: [tab('t1', { q: 'different' }), tab('t2')], activeId: 't2', closed: [] },
    }), 'merge');
    expect(result.tabs.tabs.map(t => t.id)).toEqual(['t1', 't2']);
    expect(result.tabs.tabs[0].q).toBe('');
    expect(result.summary.skipped.tabs).toBe(1);
    expect(result.summary.added.tabs).toBe(1);
  });

  it('leaves state unchanged when the backup is empty', () => {
    const before = current();
    const result = applyBackup(before, incomingOf(), 'merge');
    expect(result.saved).toEqual(before.saved);
    expect(result.recents).toEqual(before.recents);
    expect(result.spaces).toEqual(before.spaces);
    expect(result.tabs).toEqual(before.tabs);
    expect(describeSummary(result.summary)).toBe('Nothing new in that backup.');
  });

  it('caps saved links and recents at the documented limits', () => {
    const full = current({
      saved: Array.from({ length: MAX_SAVED }, (_, i) => ({ id: `s${i}`, title: `t${i}`, url: `https://e.com/${i}`, spaceId: 'inbox', createdAt: i })),
      recents: Array.from({ length: MAX_RECENTS }, (_, i) => ({ id: `r${i}`, query: `q${i}`, engine: 'google' as const, createdAt: i })),
    });
    const result = applyBackup(full, incomingOf({
      saved: [{ id: 'extra', title: 'Extra', url: 'https://e.com/extra', spaceId: 'inbox', createdAt: 9999 }],
      recents: [{ id: 'extra', query: 'extra', engine: 'google', createdAt: 9999 }],
    }), 'merge');
    expect(result.saved).toHaveLength(MAX_SAVED);
    expect(result.recents).toHaveLength(MAX_RECENTS);
    expect(result.summary.skipped.saved).toBe(1);
    expect(result.summary.skipped.recents).toBe(1);
  });

  it('describes what was restored, including skipped items', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [
        { id: 'a', title: 'New', url: 'https://example.com/new', spaceId: 'inbox', createdAt: 20 },
        { id: 'b', title: 'Dup', url: 'https://example.com/a', spaceId: 'inbox', createdAt: 20 },
      ],
      settings: { theme: 'dark' },
    }), 'merge');
    const text = describeSummary(result.summary);
    expect(text).toContain('1 link');
    expect(text).toContain('1 setting');
    expect(text).toContain('1 duplicate or over-limit item skipped');
  });
});

describe('replace restore', () => {
  it('swaps whole sections and drops the previous contents', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [{ id: 'n', title: 'Only this', url: 'https://example.com/only', spaceId: 'inbox', createdAt: 20 }],
      recents: [{ id: 'rn', query: 'only this query', engine: 'google', createdAt: 20 }],
    }), 'replace');
    expect(result.saved.map(s => s.url)).toEqual(['https://example.com/only']);
    expect(result.recents.map(r => r.query)).toEqual(['only this query']);
    expect(result.summary.added).toMatchObject({ saved: 1, recents: 1 });
  });

  it('keeps sections the backup did not contain', () => {
    const before = current();
    const result = applyBackup(before, incomingOf({ saved: [{ id: 'n', title: 'Only', url: 'https://e.com/only', spaceId: 'inbox', createdAt: 1 }] }), 'replace');
    expect(result.recents).toEqual(before.recents);
    expect(result.spaces).toEqual(before.spaces);
    expect(result.tabs).toEqual(before.tabs);
  });

  it('adopts the backup tab session and its active tab', () => {
    const result = applyBackup(current(), incomingOf({
      tabs: { tabs: [tab('a'), tab('b', { pinned: true })], activeId: 'a', closed: [tab('c')] },
    }), 'replace');
    expect(result.tabs.tabs.map(t => t.id)).toEqual(['b', 'a']);
    expect(result.tabs.activeId).toBe('a');
    expect(result.tabs.closed.map(t => t.id)).toEqual(['c']);
  });

  it('still enforces one entry per URL when the backup repeats itself', () => {
    const result = applyBackup(current(), incomingOf({
      saved: [
        { id: 'a', title: 'First', url: 'https://e.com/same', spaceId: 'inbox', createdAt: 1 },
        { id: 'b', title: 'Second', url: 'https://e.com/same', spaceId: 'inbox', createdAt: 2 },
      ],
    }), 'replace');
    expect(result.saved).toHaveLength(1);
    expect(result.summary.skipped.saved).toBe(1);
  });

  it('caps spaces on replace as well', () => {
    const result = applyBackup(current(), incomingOf({
      spaces: Array.from({ length: MAX_SPACES + 10 }, (_, i) => ({ id: `s${i}`, name: `Space ${i}`, color: '#ffffff', createdAt: i })),
    }), 'replace');
    expect(result.spaces).toHaveLength(MAX_SPACES);
    expect(result.summary.skipped.spaces).toBe(10);
  });
});
