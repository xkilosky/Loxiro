export function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(`loxiro:v2:${key}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function persist(key: string, value: unknown) {
  try { localStorage.setItem(`loxiro:v2:${key}`, JSON.stringify(value)); } catch { /* Storage may be disabled. Session state remains usable. */ }
}
export function uid() { return crypto.randomUUID(); }
export function safeUrl(raw: string): string | null {
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function formatBytes(n: number) {
  if (!n) return '0 B'; const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${['B','KB','MB','GB'][i]}`;
}
