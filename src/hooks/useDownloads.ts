import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadTask } from '../types';
import { load, persist, uid, safeUrl, saveBlob } from '../lib/storage';
import { REQUEST_BUDGET, downloadFile, normalizeParts } from '../lib/download';

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
          saveBlob(blob, task.filename);
          update(task.id, {status: 'done', received: blob.size, total: blob.size, speed: 0, finishedAt: Date.now()});
        } catch (e) {
          update(task.id, {status: controller.signal.aborted ? 'cancelled' : 'error', speed: 0,
            error: controller.signal.aborted ? 'Cancelled' : e instanceof TypeError ? 'This source blocks cross-origin downloads (CORS), or is offline. Open the source to download in your browser.' : (e as Error).message});
        } finally { active.current.delete(task.id); setTasks(ts => [...ts]); }
      })();
    });
  }, [tasks, concurrency, parts, update]);

  function add(raw: string, name: string) {
    const url = safeUrl(raw); if (!url) return false;
    let filename = name.trim();
    if (!filename) { try { filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'); } catch { filename = 'download'; } }
    filename = filename.replace(/[/\\<>:"|?*\x00-\x1F]/g, '_').slice(0, 180);
    setTasks(ts => [{id: uid(), url, filename, status: 'queued', received: 0, total: 0, speed: 0, createdAt: Date.now()}, ...ts]); return true;
  }
  function cancel(id: string) { active.current.get(id)?.controller.abort(); update(id, {status: 'cancelled', speed: 0}); }
  function retry(id: string) { if (active.current.has(id)) return; update(id, {status: 'queued', received: 0, total: 0, speed: 0, mode: undefined, parts: undefined, completedParts: undefined, transferNote: undefined, error: undefined}); }
  function clear() { setTasks(ts => ts.filter(t => ['queued','downloading'].includes(t.status))); }
  function cancelAll() { active.current.forEach(({controller}) => controller.abort()); setTasks(ts => ts.map(t => ['queued','downloading'].includes(t.status) ? {...t, status:'cancelled', speed:0} : t)); }
  return {tasks, add, cancel, retry, clear, cancelAll};
}
