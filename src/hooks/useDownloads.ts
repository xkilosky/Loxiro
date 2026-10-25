import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadTask } from '../types';
import { load, persist, uid, safeUrl, saveBlob } from '../lib/storage';

const LIMIT = 200 * 1024 * 1024;
export function useDownloads(concurrency: number) {
  const [tasks, setTasks] = useState<DownloadTask[]>(() => load<DownloadTask[]>('downloads', []).map(t =>
    ['queued','downloading'].includes(t.status) ? {...t, status: 'cancelled', error: 'Interrupted when the app closed.'} : t));
  const active = useRef(new Map<string, AbortController>());
  useEffect(() => () => { active.current.forEach(controller => controller.abort()); }, []);
  const update = useCallback((id: string, patch: Partial<DownloadTask>) => setTasks(ts => ts.map(t => t.id === id ? {...t, ...patch} : t)), []);
  useEffect(() => { persist('downloads', tasks.map(t => ({...t, speed: 0}))); }, [tasks]);

  useEffect(() => {
    const available = Math.max(0, concurrency - active.current.size);
    const queued = tasks.filter(t => t.status === 'queued' && !active.current.has(t.id)).slice(0, available);
    queued.forEach(task => {
      const controller = new AbortController(); active.current.set(task.id, controller);
      update(task.id, {status: 'downloading', startedAt: Date.now()});
      void (async () => {
        try {
          const response = await fetch(task.url, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
          if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
          const total = Number(response.headers.get('content-length')) || 0;
          if (total > LIMIT) throw new Error('File exceeds the 200 MB in-app memory limit. Use “Open source” to download directly.');
          update(task.id, {total});
          const reader = response.body?.getReader();
          if (!reader) throw new Error('This source does not support streaming. Use “Open source”.');
          const chunks: Uint8Array[] = []; let received = 0, last = performance.now(), previous = 0;
          while (true) {
            const {done, value} = await reader.read(); if (done) break;
            received += value.byteLength;
            if (received > LIMIT) { await reader.cancel(); throw new Error('File exceeds the 200 MB in-app limit. Download directly from the source.'); }
            chunks.push(value);
            const now = performance.now();
            if (now - last > 150) { update(task.id, {received, speed: (received - previous) / ((now-last)/1000)}); last = now; previous = received; }
          }
          if (controller.signal.aborted) return;
          saveBlob(new Blob(chunks as BlobPart[], {type: response.headers.get('content-type') || 'application/octet-stream'}), task.filename);
          update(task.id, {status: 'done', received, total: received, speed: 0, finishedAt: Date.now()});
        } catch (e) {
          update(task.id, {status: controller.signal.aborted ? 'cancelled' : 'error', speed: 0,
            error: controller.signal.aborted ? 'Cancelled' : e instanceof TypeError ? 'This source blocks cross-origin downloads (CORS), or is offline. Open the source to download in your browser.' : (e as Error).message});
        } finally { active.current.delete(task.id); setTasks(ts => [...ts]); }
      })();
    });
  }, [tasks, concurrency, update]);

  function add(raw: string, name: string) {
    const url = safeUrl(raw); if (!url) return false;
    let filename = name.trim();
    if (!filename) { try { filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'); } catch { filename = 'download'; } }
    filename = filename.replace(/[/\\<>:"|?*\x00-\x1F]/g, '_').slice(0, 180);
    setTasks(ts => [{id: uid(), url, filename, status: 'queued', received: 0, total: 0, speed: 0, createdAt: Date.now()}, ...ts]); return true;
  }
  function cancel(id: string) { active.current.get(id)?.abort(); update(id, {status: 'cancelled', speed: 0}); }
  function retry(id: string) { update(id, {status: 'queued', received: 0, total: 0, error: undefined}); }
  function clear() { setTasks(ts => ts.filter(t => ['queued','downloading'].includes(t.status))); }
  function cancelAll() { active.current.forEach(c => c.abort()); setTasks(ts => ts.map(t => ['queued','downloading'].includes(t.status) ? {...t, status:'cancelled', speed:0} : t)); }
  return {tasks, add, cancel, retry, clear, cancelAll};
}
