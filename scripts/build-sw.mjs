import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const assets = readdirSync('dist/assets').map(f=>`/assets/${f}`);
const hash = createHash('sha256').update(readFileSync('dist/index.html')).digest('hex').slice(0,12);
const files = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', ...assets];
writeFileSync('dist/sw.js', `
const CACHE = 'loxiro-${hash}';
const SHELL = ${JSON.stringify(files)};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('loxiro-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method!=='GET' || url.origin!==self.location.origin) return;
  if (event.request.mode==='navigate') {
    event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));
    return;
  }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true})).then(cached=>cached || fetch(event.request)));
});
`);
console.log(`Offline shell: ${files.length} files · ${hash}`);
