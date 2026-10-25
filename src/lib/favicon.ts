/** Only the public hostname is sent to the icon service—never paths or queries. */
export function faviconUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!host.includes('.') || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return null;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;
  } catch { return null; }
}
