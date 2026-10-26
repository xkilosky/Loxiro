import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD_LIMIT, MIN_PART_SIZE, downloadFile, normalizeParts, planRanges, type TransferProgress } from './download';

afterEach(() => vi.unstubAllGlobals());
const URL = 'https://files.example.org/file.bin';
const data = (start: number, length: number) => { const bytes = new Uint8Array(length); for (let i = 0; i < length; i++) bytes[i] = (start + i) % 251; return bytes; };
const options = (maxParts = 8, controller = new AbortController()) => ({maxParts, signal: controller.signal, onProgress: vi.fn<(p: TransferProgress) => void>()});
function source(total: number, alter?: (response: Response, start: number, end: number, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (_url: string, init: RequestInit = {}) => {
    const range = new Headers(init.headers).get('Range');
    if (!range) return new Response(new Uint8Array([9, 8, 7]));
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!;
    const start = Number(a), end = Number(b);
    const response = new Response(data(start, end - start + 1), {status: 206, headers: {
      'Content-Range': `bytes ${start}-${end}/${total}`, 'ETag': '"version-1"', 'Content-Type': 'application/octet-stream',
    }});
    return alter?.(response, start, end, init) || response;
  });
}

describe('smart byte-range downloads', () => {
  it.each([8, 16, 32])('plans %i adjacent, non-overlapping parts with exact complete coverage', cap => {
    const total = cap * MIN_PART_SIZE + 177;
    const ranges = planRanges(total, cap);
    expect(ranges).toHaveLength(cap); expect(ranges[0].start).toBe(0); expect(ranges.at(-1)!.end).toBe(total - 1);
    expect(ranges.reduce((sum, p, i) => {
      if (i) expect(p.start).toBe(ranges[i - 1].end + 1);
      expect(p.end - p.start + 1).toBeGreaterThanOrEqual(MIN_PART_SIZE);
      return sum + p.end - p.start + 1;
    }, 0)).toBe(total);
  });
  it('uses fewer parts on small files and clamps unsafe settings', () => {
    expect(planRanges(2 * MIN_PART_SIZE + 123, 32)).toHaveLength(2);
    expect(planRanges(100, 32)).toHaveLength(1);
    expect(planRanges(100 * MIN_PART_SIZE, 999)).toHaveLength(32);
    expect(normalizeParts(999)).toBe(8); expect(normalizeParts(NaN)).toBe(8); expect(normalizeParts(1)).toBe(1);
  });
  it.each([8, 16, 32])('actually requests %i parts concurrently and assembles exact bytes in file order', async cap => {
    const total = cap * MIN_PART_SIZE + 19;
    const releases: (() => void)[] = [];
    const completions: number[] = [];
    const fetcher = source(total, (response, start, end, init) => {
      if (!new Headers(init.headers).has('If-Range')) return response;
      expect(new Headers(init.headers).get('If-Range')).toBe('"version-1"');
      return new Promise<Response>(resolve => {
        releases.push(() => {completions.push(start); resolve(response);});
        if (releases.length === cap) releases.reverse().forEach(release => release());
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const opts = options(cap);
    const blob = await downloadFile(URL, opts);
    expect(releases).toHaveLength(cap); expect(completions[0]).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(cap + 1);
    expect(blob.size).toBe(total); expect(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toEqual(await crypto.subtle.digest('SHA-256', data(0, total).buffer as ArrayBuffer));
    expect(opts.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'parallel', parts: cap, completedParts: cap, received: total, total, speed: 0}));
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe('omit'); expect(init?.referrerPolicy).toBe('no-referrer'); expect(init?.cache).toBe('no-store');
    }
  });
  it('reuses the ordinary response if the server ignores Range, without a duplicate full GET', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {headers: {'Content-Length': '3'}}));
    vi.stubGlobal('fetch', fetcher); const opts = options();
    expect(await (await downloadFile(URL, opts)).arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(fetcher).toHaveBeenCalledOnce(); expect(opts.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'single', parts: 1}));
  });
  it('single mode makes no probe or Range / If-Range request', async () => {
    const fetcher = source(100); vi.stubGlobal('fetch', fetcher);
    await downloadFile(URL, options(1));
    expect(fetcher).toHaveBeenCalledOnce(); expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('Range')).toBe(false);
  });
  it('avoids multipart overhead for a small range-capable file', async () => {
    const fetcher = source(500); vi.stubGlobal('fetch', fetcher); const opts = options(32);
    await downloadFile(URL, opts); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(opts.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'single', transferNote: expect.stringContaining('Small file')}));
  });
  it.each(['missing range', 'weak validator', 'missing validator', 'encoding', 'wrong probe', 'wildcard total'])('uses a single stream when the probe has %s', async problem => {
    const fetcher = source(8 * MIN_PART_SIZE, response => {
      if (problem === 'missing range') response.headers.delete('Content-Range');
      if (problem === 'weak validator') response.headers.set('ETag', 'W/"weak"');
      if (problem === 'missing validator') response.headers.delete('ETag');
      if (problem === 'encoding') response.headers.set('Content-Encoding', 'gzip');
      if (problem === 'wrong probe') response.headers.set('Content-Range', 'bytes 1-1/8388608');
      if (problem === 'wildcard total') response.headers.set('Content-Range', 'bytes 0-0/*');
      return response;
    });
    vi.stubGlobal('fetch', fetcher); const opts = options();
    const blob = await downloadFile(URL, opts);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 8, 7]);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(opts.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'single', parts: 1}));
  });
  it.each(['200', 'wrong start', 'wrong end', 'changed total', 'changed tag', 'missing tag', 'truncated', 'oversized', 'encoded', '503', 'redirect'])('discards every partial buffer and falls back on %s in a part', async problem => {
    const total = 2 * MIN_PART_SIZE;
    let siblingsAborted = false;
    const fetcher = source(total, (response, start, end, init) => {
      if (!new Headers(init.headers).has('If-Range')) return response;
      init.signal!.addEventListener('abort', () => {siblingsAborted = true;});
      if (start !== 0) return response;
      if (problem === '200') return new Response('complete, not a range');
      if (problem === '503') return new Response('busy', {status: 503});
      if (problem === 'wrong start') response.headers.set('Content-Range', `bytes 1-${end}/${total}`);
      if (problem === 'wrong end') response.headers.set('Content-Range', `bytes 0-${end - 1}/${total}`);
      if (problem === 'changed total') response.headers.set('Content-Range', `bytes 0-${end}/${total + 1}`);
      if (problem === 'changed tag') response.headers.set('ETag', '"version-2"');
      if (problem === 'missing tag') response.headers.delete('ETag');
      if (problem === 'encoded') response.headers.set('Content-Encoding', 'gzip');
      if (problem === 'redirect') Object.defineProperty(response, 'url', {value: 'https://other.example.org/file'});
      if (problem === 'truncated' || problem === 'oversized') return new Response(data(0, problem === 'truncated' ? end : end + 2), {status: 206, headers: response.headers});
      return response;
    });
    vi.stubGlobal('fetch', fetcher); const opts = options();
    const blob = await downloadFile(URL, opts);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 8, 7]); expect(siblingsAborted).toBe(true);
    expect(opts.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({mode: 'single', parts: 1, received: 3, transferNote: expect.stringContaining('restarted safely')}));
  });
  it('recovers when a range preflight fails but a plain request works', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('CORS')).mockResolvedValueOnce(new Response('full file'));
    vi.stubGlobal('fetch', fetcher); expect(await (await downloadFile(URL, options())).text()).toBe('full file'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not fall back or save after cancellation during multipart transfer', async () => {
    const controller = new AbortController(); let started = 0, aborted = 0;
    const fetcher = source(8 * MIN_PART_SIZE, (response, _start, _end, init) => {
      if (!new Headers(init.headers).has('If-Range')) return response;
      started++;
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {aborted++; reject(new DOMException('Aborted', 'AbortError'));});
        if (started === 8) controller.abort();
      });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(downloadFile(URL, options(8, controller))).rejects.toMatchObject({name: 'AbortError'});
    expect(started).toBe(8); expect(aborted).toBe(8); expect(fetcher).toHaveBeenCalledTimes(9);
  });
  it('does not request anything for an already cancelled task', async () => {
    const controller = new AbortController(); controller.abort(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(downloadFile(URL, options(8, controller))).rejects.toMatchObject({name: 'AbortError'}); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['range', 'plain'])('rejects an advertised oversized %s file without buffering it', async mode => {
    const response = mode === 'range' ? new Response('x', {status: 206, headers: {'Content-Range': `bytes 0-0/${DOWNLOAD_LIMIT + 1}`, 'ETag': '"big"'}}) : new Response('x', {headers: {'Content-Length': String(DOWNLOAD_LIMIT + 1)}});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(downloadFile(URL, options())).rejects.toThrow('200 MB'); expect(response.body!.locked).toBe(false);
  });
  it('enforces the limit even with no Content-Length', async () => {
    const chunk = new Uint8Array(MIN_PART_SIZE); let cancelled = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({pull(c) {c.enqueue(chunk);}, cancel() {cancelled = true;}}))));
    await expect(downloadFile(URL, options(1))).rejects.toThrow('200 MB'); expect(cancelled).toBe(true);
  });
  it('does not treat a partial plain response as a complete file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('partial', {status: 206})));
    await expect(downloadFile(URL, options(1))).rejects.toThrow('complete file response');
  });
});
