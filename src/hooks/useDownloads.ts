import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadTask } from '../types';
import { load, persist, uid, safeUrl, saveBlob } from '../lib/storage';
import { nextVersionName, originOf } from '../lib/naming';
import { REQUEST_BUDGET, downloadFile, normalizeParts } from '../lib/download';

/**
 * Why a call to `add` did or did not start a transfer.
 *
 * `collision` is the interesting one: it means Veilix has already saved a file
 * under this name. Nothing has been queued yet, so the caller can ask the user
 * what to do before any bytes move -- which is the whole point, since "replace
 * existing" is a decision about the file that is already on disk, not about the
 * transfer that is about to start.
 *
 * `kind` separates the two things a name clash can mean. `update` is the same
 * filename from the same site as an earlier download, which is almost always a
 * newer build of the same thing. `duplicate` is the same filename from
 * somewhere else, which is just as likely to be a different file that happens to
 * share a name. The dialog asks either way, so a loose guess costs the user one
 * different sentence rather than a wrong file.
 */
export type AddResult =
  | {status: 'added'}
  | {status: 'invalid'}
  | {status: 'collision'; kind: 'update' | 'duplicate'; filename: string; replacement: string;
     prior: number; source?: string; finishedAt?: number};

export function useDownloads(concurrency: number, parts = 8) {
  const [tasks, setTasks] = useState<DownloadTask[]>(() => load<DownloadTask[]>('downloads', []).map(t =>
    ['queued','downloading'].includes(t.status) ? {...t, status: 'cancelled', error: 'Interrupted when the app closed.'} : t));
  const active = useRef(new Map<string, {controller: AbortController; slots: number}>());
  useEffect(() => () => { active.current.forEach(({controller}) => controller.abort()); }, []);
  const update = useCallback((id: string, patch: Partial<DownloadTask>) => setTasks(ts => ts.map(t => t.id === id ? {...t, ...patch} : t)), []);
  useEffect(() => { persist('downloads', tasks.map(t => ({...t, speed: 0}))); }, [tasks]);

  useEffect(() => {
    const available = Math.max(0, Math.min(4, Math.max(1, Math.floor(concurrency) || 1)) - active.current.size);
    let slots = REQUEST_BUDGET - [...active.current.values()].reduce((sum, job) => sum + job.slots, 0);
    const queued = tasks.filter(t => t.status === 'queued' && !active.current.has(t.id)).slice(0, available);
    queued.forEach(task => {
      if (slots < 1) return;
      const cap = Math.min(normalizeParts(parts), slots); slots -= cap;
      const controller = new AbortController(); active.current.set(task.id, {controller, slots: cap});
      update(task.id, {status: 'downloading', startedAt: Date.now()});
      void (async () => {
        try {
          const blob = await downloadFile(task.url, {signal: controller.signal, maxParts: cap,
            onProgress: progress => {
              // Release unused reservations after detection, so small/single-stream files do not block the queue.
              const job = active.current.get(task.id);
              if (job && progress.parts > 0) job.slots = progress.parts;
              if (!controller.signal.aborted) update(task.id, progress);
            }});
          controller.signal.throwIfAborted();
          // A zero-byte body is never a real file -- it is an error page, a
          // redirect or an empty response wearing the right status code.
          // Saving it would report "done" and leave the user with nothing.
          if (!blob.size) throw new Error('The source returned an empty file, so there was nothing to save. Open the source to check the link.');
          saveBlob(blob, task.filename);
          update(task.id, {status: 'done', received: blob.size, total: blob.size, speed: 0, finishedAt: Date.now()});
        } catch (e) {
          // finishedAt is set for every outcome, not just success, so the
          // history section can say when a failed transfer ended.
          update(task.id, {status: controller.signal.aborted ? 'cancelled' : 'error', speed: 0, finishedAt: Date.now(),
            error: controller.signal.aborted ? 'Cancelled' : e instanceof TypeError ? 'This source blocks cross-origin downloads (CORS), or is offline. Open the source to download in your browser.' : (e as Error).message});
        } finally { active.current.delete(task.id); setTasks(ts => [...ts]); }
      })();
    });
  }, [tasks, concurrency, parts, update]);

  /**
   * Queues a transfer.
   *
   * Without `resolve`, a name Veilix has already saved comes back as
   * `collision` and nothing is queued. Pass `resolve` once the user has chosen:
   * `'replace'` keeps the name as given, `'keep-both'` moves it to the next free
   * `_v2`/`_v3` name so the earlier file and this one both survive under names
   * the user can tell apart.
   */
  function add(raw: string, name: string, resolve?: 'replace' | 'keep-both'): AddResult {
    const url = safeUrl(raw); if (!url) return {status: 'invalid'};
    let filename = name.trim();
    if (!filename) { try { filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'); } catch { filename = 'download'; } }
    filename = filename.replace(/[/\\<>:"|?*\x00-\x1F]/g, '_').slice(0, 180);
    if (resolve === 'keep-both') filename = nextVersionName(filename, tasks.map(t => t.filename));
    else if (!resolve) {
      // Remembering the URL is what turns a name clash into something useful:
      // the same filename from the same site is a newer build of the same thing,
      // while the same filename from a different site is just a shared name.
      const earlier = tasks.filter(t => t.filename === filename);
      if (earlier.length) {
        const site = originOf(url);
        const fromSameSite = site !== null && earlier.some(t => originOf(t.url) === site);
        const latest = earlier.reduce((a, b) => (b.finishedAt ?? b.createdAt) > (a.finishedAt ?? a.createdAt) ? b : a);
        return {status: 'collision', kind: fromSameSite ? 'update' : 'duplicate', filename,
          replacement: nextVersionName(filename, tasks.map(t => t.filename)), prior: earlier.length,
          source: fromSameSite ? site ?? undefined : undefined, finishedAt: latest.finishedAt ?? latest.createdAt};
      }
    }
    setTasks(ts => [{id: uid(), url, filename, status: 'queued', received: 0, total: 0, speed: 0, createdAt: Date.now()}, ...ts]);
    return {status: 'added'};
  }
  function cancel(id: string) { active.current.get(id)?.controller.abort(); update(id, {status: 'cancelled', speed: 0, finishedAt: Date.now()}); }
  function retry(id: string) { if (active.current.has(id)) return; update(id, {status: 'queued', received: 0, total: 0, speed: 0, mode: undefined, parts: undefined, completedParts: undefined, transferNote: undefined, error: undefined}); }
  function clear() { setTasks(ts => ts.filter(t => ['queued','downloading'].includes(t.status))); }
  function cancelAll() { active.current.forEach(({controller}) => controller.abort()); const now = Date.now(); setTasks(ts => ts.map(t => ['queued','downloading'].includes(t.status) ? {...t, status:'cancelled', speed:0, finishedAt:now} : t)); }
  return {tasks, add, cancel, retry, clear, cancelAll};
}
