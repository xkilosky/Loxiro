// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import type { DownloadTask } from './types';

/**
 * The collision dialog.
 *
 * A web page cannot see the Downloads folder, so Veilix cannot know whether a
 * file is still on disk -- the browser's download manager owns that and silently
 * appends "(1)" to a name it considers taken. What Veilix does know is what it
 * has saved itself. These tests pin the narrower promise: a name it has saved
 * before is surfaced as a choice before any bytes move, and the choice is
 * honoured rather than guessed.
 */
function seed(tasks: DownloadTask[]) {
  localStorage.setItem('loxiro:v2:downloads', JSON.stringify(tasks));
}

function task(filename: string, id: string): DownloadTask {
  return {
    id, url: `https://example.com/${filename}`, filename, status: 'done',
    received: 3, total: 3, speed: 0, createdAt: 1, finishedAt: 2,
  };
}

/** Submit the New download modal with a URL and an explicit "Save as" name. */
function submit(url: string, name: string) {
  fireEvent.click(screen.getByRole('button', {name: /New download/}));
  fireEvent.change(screen.getByLabelText('File URL'), {target: {value: url}});
  fireEvent.change(screen.getByLabelText(/Save as/), {target: {value: name}});
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
    Object.defineProperty(globalThis.crypto, 'randomUUID', {configurable: true, value: () => `id-${++n}`});
  }
  URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('file already exists', () => {
  it('asks before queueing when the name has been saved before', () => {
    seed([task('App.pdf', 'a')]);
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');

    expect(screen.getByRole('heading', {name: 'File already exists'})).toBeTruthy();
    // Nothing was queued, so cancelling costs nothing.
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText('App_v2.pdf')).toBeTruthy();
  });

  it('says how many times the name was already used', () => {
    seed([task('App.pdf', 'a'), task('App.pdf', 'b')]);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');

    expect(document.querySelector('.modal-description')?.textContent).toContain('App.pdf 2 times');
  });

  it('names the "(1)" the browser would have chosen instead', () => {
    seed([task('App.pdf', 'a')]);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');

    // The whole point of the dialog: not App(1).pdf, but a name the user picked.
    expect(screen.queryByText(/App\(1\)\.pdf/)).toBeTruthy();
  });

  it('queues under the original name when the user replaces', () => {
    seed([task('App.pdf', 'a')]);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');
    fireEvent.click(screen.getByRole('button', {name: /Replace existing/}));

    expect(screen.queryByRole('heading', {name: 'File already exists'})).toBeNull();
    // The earlier file keeps its name; this one joins the queue under the same name.
    const names = [...document.querySelectorAll('.download-row .download-info>strong')].map(n => n.textContent);
    expect(names).toEqual(['App.pdf', 'App.pdf']);
  });

  it('queues under a versioned name when the user keeps both', () => {
    seed([task('App.pdf', 'a')]);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');
    fireEvent.click(screen.getByRole('button', {name: /Keep both/}));

    const names = [...document.querySelectorAll('.download-row .download-row, .download-row')]
      .map(n => n.querySelector('.download-info>strong')?.textContent);
    expect(names).toContain('App_v2.pdf');
    expect(names).toContain('App.pdf');
  });

  it('queues nothing and closes when the user cancels', () => {
    seed([task('App.pdf', 'a')]);
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

    expect(screen.queryByRole('heading', {name: 'File already exists'})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const names = [...document.querySelectorAll('.download-row .download-info>strong')].map(n => n.textContent);
    expect(names).toEqual(['App.pdf']);
  });

  it('does not interrupt a first download of a fresh name', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/fresh.pdf', 'fresh.pdf');

    expect(screen.queryByRole('heading', {name: 'File already exists'})).toBeNull();
    await waitFor(() => expect(document.querySelectorAll('.download-row').length).toBe(1));
  });

  it('keeps the URL and name filled in after a cancel, so the choice is retryable', () => {
    seed([task('App.pdf', 'a')]);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<App />);

    submit('https://example.com/App.pdf', 'App.pdf');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    fireEvent.click(screen.getByRole('button', {name: /New download/}));

    expect((screen.getByLabelText('File URL') as HTMLInputElement).value).toBe('https://example.com/App.pdf');
    expect((screen.getByLabelText(/Save as/) as HTMLInputElement).value).toBe('App.pdf');
  });
});
