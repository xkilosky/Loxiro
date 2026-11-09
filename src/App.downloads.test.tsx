// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import type { DownloadStatus, DownloadTask } from './types';

/**
 * The downloads screen used to be one flat list: an in-flight transfer and a
 * file saved an hour ago sat in the same column with the same weight. These
 * tests pin the split into an active "Downloading" section and a "Download
 * history" section, including that a cancelled transfer is no longer styled as
 * a failure.
 */
function task(overrides: Partial<DownloadTask> & {id: string; status: DownloadStatus}): DownloadTask {
  return {
    url: 'https://example.com/file.bin',
    filename: 'file.bin',
    received: 0,
    total: 0,
    speed: 0,
    createdAt: 1,
    ...overrides,
  } as DownloadTask;
}

function seed(tasks: DownloadTask[]) {
  localStorage.setItem('loxiro:v2:downloads', JSON.stringify(tasks));
}

/** Filenames in the nth .download-section, in DOM order. */
function sectionFiles(index: number): string[] {
  const sections = document.querySelectorAll('.download-section');
  return [...sections[index].querySelectorAll('.download-row .download-info>strong')].map(n => n.textContent ?? '');
}

function sectionText(index: number): string {
  return document.querySelectorAll('.download-section')[index]?.textContent ?? '';
}

/** Start a transfer through the New download modal. fetch is stubbed to hang. */
async function startTransfer(url = 'https://example.com/hanging.bin') {
  fireEvent.click(screen.getByRole('button', {name: /New download/}));
  fireEvent.change(screen.getByLabelText('File URL'), {target: {value: url}});
  fireEvent.click(screen.getByRole('button', {name: /Add to queue/}));
}

beforeEach(() => {
  localStorage.clear();
  location.hash = '#downloads';
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
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true, value: () => `id-${++n}`,
    });
  }
  // jsdom implements neither end of the object-URL lifecycle.
  URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('downloads screen sections', () => {
  it('splits in-flight transfers from finished ones', async () => {
    // A response that never arrives keeps the task in the Downloading section
    // for as long as the test needs it.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    seed([
      task({id: 'a', status: 'done', filename: 'saved.bin', received: 2048, total: 2048, finishedAt: Date.now()}),
      task({id: 'b', status: 'error', filename: 'broken.bin', error: 'Server returned HTTP 404', finishedAt: Date.now()}),
    ]);
    render(<App />);

    // The empty state only covers "nothing has ever transferred", so it must
    // not be hiding the two sections.
    expect(document.querySelectorAll('.download-section')).toHaveLength(2);
    expect(screen.getByRole('heading', {name: /^Downloading/})).toBeTruthy();
    expect(screen.getByRole('heading', {name: /^Download history/})).toBeTruthy();

    // Nothing is active, so the Downloading section says so rather than showing
    // an empty list, and the finished pair is in history only.
    expect(sectionFiles(0)).toEqual([]);
    expect(sectionText(0)).toContain('Nothing is transferring right now');
    expect(sectionFiles(1)).toEqual(['saved.bin', 'broken.bin']);
    expect(sectionText(0)).not.toContain('saved.bin');
  });

  it('moves a new transfer into the Downloading section as it runs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    // No tasks at all yet: the "ready when you are" state, not the sections.
    expect(document.querySelectorAll('.download-section')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', {name: /Try it with the Veilix concept/}));

    await waitFor(() => expect(sectionFiles(0)).toContain('veilix-concept.png'));
    // It is still running, so it must not appear in history.
    expect(sectionFiles(1)).toEqual([]);
    expect(sectionText(1)).toContain('Nothing has finished yet');
    expect(screen.getByRole('progressbar', {name: /Downloading veilix-concept.png/})).toBeTruthy();
  });

  it('offers the action that matches each section', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    seed([task({id: 'a', status: 'done', filename: 'saved.bin', received: 10, total: 10, finishedAt: Date.now()})]);
    render(<App />);

    // Nothing active -> no "Cancel all"; one finished row -> "Clear history".
    expect(screen.queryByRole('button', {name: 'Cancel all'})).toBeNull();
    expect(screen.getByRole('button', {name: 'Clear history'})).toBeTruthy();

    await startTransfer();
    await waitFor(() => expect(screen.getByRole('button', {name: 'Cancel all'})).toBeTruthy());
    // Adding a transfer must not have touched the finished one.
    expect(sectionFiles(1)).toEqual(['saved.bin']);
  });

  it('says when each finished transfer ended', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    seed([
      task({id: 'a', status: 'done', filename: 'saved.bin', received: 10, total: 10, finishedAt: fiveMinAgo}),
      task({id: 'b', status: 'error', filename: 'broken.bin', error: 'Server returned HTTP 404', finishedAt: fiveMinAgo}),
    ]);
    render(<App />);

    const rows = [...document.querySelectorAll('.download-row')];
    const saved = rows.find(r => r.textContent?.includes('saved.bin'))!;
    const broken = rows.find(r => r.textContent?.includes('broken.bin'))!;
    // Both outcomes get a timestamp; only success is described as saved.
    expect(saved.textContent).toContain('5 min ago');
    expect(saved.textContent).toContain('Saved to browser');
    expect(broken.textContent).toContain('5 min ago');
    expect(broken.textContent).toContain('Failed');
  });

  it('does not style a cancelled transfer as a failure', () => {
    seed([task({id: 'a', status: 'cancelled', filename: 'stopped.bin', finishedAt: Date.now()})]);
    render(<App />);

    const row = document.querySelector('.download-row')!;
    expect(row.className).toContain('cancelled');
    expect(row.textContent).toContain('Cancelled');
    // The old code printed the literal string "Cancelled" in the red error slot,
    // which reads as a fault rather than a choice.
    expect(row.querySelector('.download-error')).toBeNull();
    // Cancelled is retryable; done is not.
    expect(screen.getByRole('button', {name: 'Retry stopped.bin'})).toBeTruthy();
  });

  it('keeps a failed transfer’s reason and offers a retry', () => {
    seed([task({id: 'a', status: 'error', filename: 'broken.bin', error: 'Server returned HTTP 404; a complete file response is required.', finishedAt: Date.now()})]);
    render(<App />);

    expect(document.querySelector('.download-error')?.textContent).toContain('HTTP 404');
    expect(screen.getByRole('button', {name: 'Retry broken.bin'})).toBeTruthy();
  });

  it('clears only finished transfers, leaving active ones alone', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    seed([task({id: 'a', status: 'done', filename: 'saved.bin', received: 10, total: 10, finishedAt: Date.now()})]);
    render(<App />);

    await startTransfer();
    await waitFor(() => expect(sectionFiles(0)).toContain('hanging.bin'));

    fireEvent.click(screen.getByRole('button', {name: 'Clear history'}));
    await waitFor(() => expect(sectionFiles(1)).toEqual([]));
    expect(sectionFiles(0)).toEqual(['hanging.bin']);
  });

  it('marks an interrupted transfer as cancelled instead of leaving it running', () => {
    // The hook must not resurrect a transfer that died with the previous
    // session: a stale "downloading" row would sit in the active section
    // forever with nothing behind it.
    seed([task({id: 'a', status: 'downloading', filename: 'stale.bin'})]);
    render(<App />);

    expect(sectionFiles(0)).toEqual([]);
    expect(sectionText(1)).toContain('stale.bin');
    expect(sectionText(1)).toContain('Interrupted when the app closed.');
  });
});
