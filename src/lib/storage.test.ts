// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {formatBytes, load, persist, safeUrl, saveBlob} from './storage';

/**
 * saveBlob is the last step of every transfer, and it used to click an anchor
 * that was never attached to the document. Some browsers ignore a click on a
 * detached element, so a download could report "done" while nothing reached
 * disk -- the failure was invisible in the UI and in the task's own status.
 * These assertions pin the parts that made it work.
 */
describe('saveBlob', () => {
  let created: string[] = [];
  let revoked: string[] = [];
  let clicked: HTMLAnchorElement[] = [];
  let attachedAtClick: boolean[] = [];
  let realClick: () => void;

  beforeEach(() => {
    created = []; revoked = []; clicked = []; attachedAtClick = [];
    // jsdom implements neither end of the object-URL lifecycle.
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); }) as unknown as typeof URL.revokeObjectURL;
    realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push(this);
      // Record it here, not after saveBlob returns: the anchor is removed
      // again once the click has been delivered.
      attachedAtClick.push(document.body.contains(this));
    };
  });

  afterEach(() => { HTMLAnchorElement.prototype.click = realClick; });

  it('clicks an anchor that is attached to the document', () => {
    saveBlob(new Blob(['hello']), 'note.txt');
    expect(clicked).toHaveLength(1);
    expect(attachedAtClick).toEqual([true]);
  });

  it('names the file and points the anchor at the blob', () => {
    saveBlob(new Blob(['hello']), 'my report.pdf');
    expect(clicked[0].download).toBe('my report.pdf');
    expect(clicked[0].href).toBe(created[0]);
    expect(created).toHaveLength(1);
  });

  it('removes the anchor once the click has happened', () => {
    saveBlob(new Blob(['hello']), 'note.txt');
    expect(document.body.contains(clicked[0])).toBe(false);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('holds the object URL open long enough for the browser to read it', () => {
    vi.useFakeTimers();
    try {
      saveBlob(new Blob(['hello']), 'note.txt');
      expect(revoked).toHaveLength(0);
      vi.advanceTimersByTime(60000);
      expect(revoked).toEqual(created);
    } finally { vi.useRealTimers(); }
  });
});

describe('formatBytes', () => {
  it('reports zero and byte-scale sizes without a decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('switches unit at each power of 1024', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('safeUrl', () => {
  it('accepts only http and https', () => {
    expect(safeUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects every other scheme and anything unparseable', () => {
    for (const raw of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com',
                       'file:///etc/passwd', 'not a url', '']) {
      expect(safeUrl(raw), raw).toBeNull();
    }
  });
});

describe('the loxiro:v2 namespace', () => {
  it('keeps reading and writing under the pre-rename key', () => {
    // Renaming this would silently orphan every existing user's saved data.
    localStorage.clear();
    persist('settings', {theme: 'light'});
    expect(localStorage.key(0)).toBe('loxiro:v2:settings');
    expect(load('settings', null)).toEqual({theme: 'light'});
    expect(load('missing', 'fallback')).toBe('fallback');
  });
});
