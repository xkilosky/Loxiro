// Browser-only transfers. No proxy, credentials, or cross-origin security bypass.
export const DOWNLOAD_LIMIT = 200 * 1024 * 1024;
export const MIN_PART_SIZE = 1024 * 1024;
export const REQUEST_BUDGET = 32;
export type DownloadMode = 'checking' | 'single' | 'parallel';
export interface TransferProgress {
  received: number;
  total: number;
  speed: number;
  mode: DownloadMode;
  parts: number;
  completedParts: number;
  transferNote: string;
}
interface Options {
  signal: AbortSignal;
  maxParts: number;
  onProgress: (progress: TransferProgress) => void;
}
export function normalizeParts(value: number) {
  return [1, 8, 16, 32].includes(value) ? value : 8;
}
export function planRanges(total: number, cap: number) {
  const count = Math.min(Math.max(1, Math.floor(cap)), 32, Math.max(1, Math.floor(total / MIN_PART_SIZE)));
  return Array.from({length: count}, (_, i) => ({
    start: Math.floor(i * total / count), end: Math.floor((i + 1) * total / count) - 1,
  }));
}
const limitError = () => new Error('File exceeds the 200 MB in-app memory limit. Use “Open source” to download directly.');
const identity = (response: Response) => !response.headers.get('content-encoding') || response.headers.get('content-encoding')?.toLowerCase() === 'identity';
const strongETag = (value: string | null): value is string => !!value && /^"[^"\r\n]*"$/.test(value);
const contentRange = (response: Response) => {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  return [start, end, total].every(Number.isSafeInteger) && total > 0 && start <= end && end < total ? {start, end, total} : null;
};
async function discard(response: Response) {
  try { await response.body?.cancel(); } catch { /* Already aborted/closed. */ }
}

// Enforce the byte limit while reading, even if Content-Length is missing or dishonest.
async function readBody(response: Response, signal: AbortSignal, max: number, onBytes: (bytes: number) => void, expected?: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('This source does not support streaming. Use “Open source”.');
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw expected === undefined ? limitError() : new Error('The source returned more bytes than expected.');
      chunks.push(value as BlobPart);
      onBytes(value.byteLength);
    }
    if (expected !== undefined && size !== expected) throw new Error('The source returned an incomplete file or range.');
    return {blob: new Blob(chunks), size};
  } finally {
    signal.removeEventListener('abort', abort);
    try { await reader.cancel(); } catch { /* Preserve the transfer error. */ }
    reader.releaseLock();
  }
}

export async function downloadFile(url: string, {signal, maxParts, onProgress}: Options): Promise<Blob> {
  let state: TransferProgress = {received: 0, total: 0, speed: 0, mode: 'checking', parts: 0, completedParts: 0, transferNote: 'Checking byte-range support…'};
  let last = performance.now(), previous = 0;
  const publish = (patch: Partial<TransferProgress> = {}) => { state = {...state, ...patch}; onProgress({...state}); };
  const bytes = (n: number) => {
    state.received += n;
    const now = performance.now();
    if (now - last >= 150) {
      publish({speed: (state.received - previous) / ((now - last) / 1000)});
      previous = state.received; last = now;
    }
  };
  const request = (requestSignal: AbortSignal, headers?: HeadersInit) => {
    requestSignal.throwIfAborted();
    return fetch(url, {signal: requestSignal, headers, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'});
  };
  async function single(note: string, existing?: Response) {
    signal.throwIfAborted();
    publish({received: 0, total: 0, speed: 0, mode: 'single', parts: 1, completedParts: 0, transferNote: note});
    previous = 0; last = performance.now();
    const response = existing || await request(signal);
    if (response.status !== 200) { await discard(response); throw new Error(`Server returned HTTP ${response.status}; a complete file response is required.`); }
    // Encoded bodies are decoded by fetch; their Content-Length may describe compressed bytes.
    // Cross-origin Content-Encoding may be hidden, so normal-stream length is only a progress hint.
    const declared = identity(response) ? Number(response.headers.get('content-length')) || 0 : 0;
    if (declared > DOWNLOAD_LIMIT) { await discard(response); throw limitError(); }
    publish({total: declared});
    const {blob, size} = await readBody(response, signal, DOWNLOAD_LIMIT, bytes);
    signal.throwIfAborted();
    publish({received: size, total: size, speed: 0, completedParts: 1});
    return new Blob([blob], {type: response.headers.get('content-type') || 'application/octet-stream'});
  }
  publish();
  if (maxParts <= 1) return single('Using one connection for this transfer.');

  let probe: Response;
  try { probe = await request(signal, {Range: 'bytes=0-0'}); }
  catch (error) {
    signal.throwIfAborted();
    // Some sources reject Range requests/preflights but permit an ordinary GET.
    return single('Range check unavailable; using a single connection.');
  }
  if (probe.status === 200) return single('Source did not provide byte ranges; using a single connection.', probe);
  const range = contentRange(probe);
  const etag = probe.headers.get('etag');
  const resolvedUrl = probe.url;
  const type = probe.headers.get('content-type') || 'application/octet-stream';
  if (probe.status !== 206 || !range || range.start !== 0 || range.end !== 0 || !identity(probe) || !strongETag(etag)) {
    await discard(probe);
    return single('Safe byte ranges or a strong file validator are unavailable; using a single connection.');
  }
  if (range.total > DOWNLOAD_LIMIT) { await discard(probe); throw limitError(); }
  // Read exactly one probe byte before trusting the range endpoint.
  try { await readBody(probe, signal, 1, () => {}, 1); }
  catch (error) { signal.throwIfAborted(); return single('Range check failed; using a single connection.'); }
  const ranges = planRanges(range.total, maxParts);
  if (ranges.length < 2) return single('Small file: a single connection avoids extra request overhead.');

  const group = new AbortController();
  const abortGroup = () => group.abort(signal.reason);
  signal.addEventListener('abort', abortGroup, {once: true});
  const parts: Blob[] = new Array(ranges.length);
  let failure: unknown;
  previous = 0; last = performance.now();
  publish({received: 0, total: range.total, mode: 'parallel', parts: ranges.length, completedParts: 0, speed: 0, transferNote: 'Verified byte ranges · parts combine in file order.'});
  const jobs = ranges.map(async ({start, end}, index) => {
    try {
      const response = await request(group.signal, {Range: `bytes=${start}-${end}`, 'If-Range': etag});
      const actual = contentRange(response);
      if (response.status !== 206 || !actual || actual.start !== start || actual.end !== end || actual.total !== range.total || response.headers.get('etag') !== etag || response.url !== resolvedUrl || !identity(response)) {
        await discard(response);
        throw new Error('Source changed or returned an invalid byte range.');
      }
      const {blob} = await readBody(response, group.signal, end - start + 1, bytes, end - start + 1);
      parts[index] = blob;
      publish({completedParts: state.completedParts + 1});
    } catch (error) {
      if (!failure) failure = error;
      group.abort();
    }
  });
  try {
    await Promise.all(jobs); // All siblings stop before fallback; no mixed versions or late progress.
    signal.throwIfAborted();
    if (failure) {
      parts.length = 0; // Release partial buffers before requesting a fresh complete representation.
      return await single('Parallel transfer could not be verified; restarted safely with one connection.');
    }
    publish({received: range.total, total: range.total, speed: 0});
    return new Blob(parts, {type});
  } finally { signal.removeEventListener('abort', abortGroup); }
}
