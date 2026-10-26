// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const backup = {
  settings: { theme: 'dark', concurrency: 4 },
  spaces: [{ id: 'restored-space', name: 'Restored space', color: '#123456', createdAt: 5 }],
  saved: [
    { id: 'restored-1', title: 'Restored link', url: 'https://example.com/restored', spaceId: 'restored-space', createdAt: 900 },
    { id: 'script-1', title: 'Script', url: 'javascript:alert(1)', spaceId: 'inbox', createdAt: 901 },
  ],
  recents: [{ id: 'restored-r', query: 'restored query', engine: 'google', createdAt: 900 }],
  tabs: { tabs: [{ id: 'restored-tab', screen: 'home', q: '', draft: '', engine: 'duckduckgo', pinned: false }], activeId: 'restored-tab', closed: [] },
  exportedAt: '2026-10-26T00:00:00.000Z',
};

function fileFor(payload: unknown, name = 'loxiro-backup.json') {
  return new File([JSON.stringify(payload)], name, { type: 'application/json' });
}

const stored = (key: string) => JSON.parse(localStorage.getItem(`loxiro:v2:${key}`) ?? 'null');

beforeEach(() => {
  localStorage.clear();
  location.hash = '#settings';
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
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => `id-${++n}` },
    });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('restore from backup', () => {
  it('opens a confirmation before changing anything', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), { target: { files: [fileFor(backup)] } });

    expect(await screen.findByRole('heading', { name: 'Restore this backup?' })).toBeTruthy();
    // Counts come from the parsed file, before anything is written. The javascript: link is already excluded.
    expect(document.querySelector('.restore-list')?.textContent).toContain('1 saved link');
    expect(document.querySelector('.restore-list')?.textContent).toContain('1 recent search');
    expect(screen.getByText('Merge into my data')).toBeTruthy();
    expect(stored('saved')).toHaveLength(0);

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Restore this backup?' })).toBeNull());
    expect(stored('saved')).toHaveLength(0);
    expect(stored('settings').theme).not.toBe('dark');
  });

  it('merges a backup into local storage and reports what it added', async () => {
    localStorage.setItem('loxiro:v2:saved', JSON.stringify([{ id: 'old', title: 'Old', url: 'https://example.com/old', spaceId: 'inbox', createdAt: 1 }]));
    render(<App />);

    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), { target: { files: [fileFor(backup)] } });
    fireEvent.click(await screen.findByText('Merge into my data'));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 link'));
    expect(screen.getByRole('status').textContent).toContain('2 settings');

    const saved = stored('saved');
    expect(saved.map((s: { url: string }) => s.url).sort()).toEqual(['https://example.com/old', 'https://example.com/restored']);
    // The javascript: entry is dropped by the sanitizer, and the restored space is kept.
    expect(saved.some((s: { url: string }) => s.url.startsWith('javascript:'))).toBe(false);
    expect(stored('spaces').some((s: { id: string }) => s.id === 'restored-space')).toBe(true);
    expect(stored('saved').find((s: { url: string }) => s.url === 'https://example.com/restored').spaceId).toBe('restored-space');
    expect(stored('recents').map((r: { query: string }) => r.query)).toContain('restored query');
    expect(stored('settings').theme).toBe('dark');
    expect(stored('settings').concurrency).toBe(4);
    expect(stored('tabs').tabs.some((t: { id: string }) => t.id === 'restored-tab')).toBe(true);
  });

  it('replace drops the previous saved links but keeps sections the file lacks', async () => {
    localStorage.setItem('loxiro:v2:saved', JSON.stringify([{ id: 'old', title: 'Old', url: 'https://example.com/old', spaceId: 'inbox', createdAt: 1 }]));
    localStorage.setItem('loxiro:v2:recents', JSON.stringify([{ id: 'old-r', query: 'untouched query', engine: 'google', createdAt: 1 }]));
    render(<App />);

    const { recents: _recents, ...withoutRecents } = backup;
    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), { target: { files: [fileFor(withoutRecents)] } });
    const mode = await screen.findByLabelText('Restore mode');
    fireEvent.change(mode, { target: { value: 'replace' } });
    fireEvent.click(await screen.findByText('Replace my data'));

    await waitFor(() => expect(stored('saved')?.length).toBe(1));
    expect(stored('saved')[0].url).toBe('https://example.com/restored');
    // The backup has no recents section, so replace leaves them alone.
    expect(stored('recents').map((r: { query: string }) => r.query)).toEqual(['untouched query']);
  });

  it('reports a broken file without touching stored data', async () => {
    localStorage.setItem('loxiro:v2:saved', JSON.stringify([{ id: 'old', title: 'Old', url: 'https://example.com/old', spaceId: 'inbox', createdAt: 1 }]));
    render(<App />);

    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), {
      target: { files: [new File(['{not json'], 'broken.json', { type: 'application/json' })] },
    });

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('not valid JSON'));
    expect(screen.queryByRole('heading', { name: 'Restore this backup?' })).toBeNull();
    expect(stored('saved')).toHaveLength(1);
  });

  it('rejects JSON that is not a Loxiro backup', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), {
      target: { files: [fileFor({ unrelated: true })] },
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('no Loxiro data'));
  });

  it('restores the tab session so the restored tab is open afterwards', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose a Loxiro backup file'), { target: { files: [fileFor(backup)] } });
    fireEvent.click(await screen.findByText('Merge into my data'));

    await waitFor(() => expect(stored('tabs')?.tabs.some((t: { id: string }) => t.id === 'restored-tab')).toBe(true));
    expect(stored('tabs').activeId).toBeTruthy();
  });
});
