import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The service worker is emitted from a template string, so its behaviour is only
 * observable in the generated file. These tests run the real generator against a
 * throwaway dist/ and read dist/sw.js back.
 */
function generate() {
  const dir = mkdtempSync(join(tmpdir(), 'veilix-sw-'));
  mkdirSync(join(dir, 'dist/assets'), { recursive: true });
  writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><title>Veilix</title>');
  writeFileSync(join(dir, 'dist/assets/index-test.js'), 'export default 1;');
  execFileSync(process.execPath, [join(process.cwd(), 'scripts/build-sw.mjs')], { cwd: dir });
  const sw = readFileSync(join(dir, 'dist/sw.js'), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return sw;
}

/** The cache-name regex the activate handler actually applies. */
function cleanupRegex(sw) {
  const match = sw.match(/keys\.filter\(k=>(\/\^.*?\/)\.test\(k\)/);
  if (!match) throw new Error('activate handler should filter cache keys with a regex');
  // eslint-disable-next-line no-eval
  return eval(match[1]);
}

describe('generated service worker', () => {
  const sw = generate();

  it('names its cache after the current brand', () => {
    expect(sw).toMatch(/const CACHE = 'veilix-[a-f0-9]{12}';/);
  });

  it('still deletes caches left behind by the pre-rename app', () => {
    // Users upgrading from Loxiro hold a `loxiro-<hash>` cache. The new worker only ever
    // reads `veilix-*`, so an uncollected legacy cache is wasted storage for good.
    const re = cleanupRegex(sw);
    expect(re.test('loxiro-c346c7eceaa7')).toBe(true);
    expect(re.test('veilix-51f5b2fdc506')).toBe(true);
    expect(re.test('some-other-app-1')).toBe(false);
  });

  it('excludes the cache it is about to use from that cleanup', () => {
    const current = sw.match(/const CACHE = '(veilix-[a-f0-9]{12})';/)[1];
    expect(cleanupRegex(sw).test(current)).toBe(true); // matches the prefix...
    expect(sw).toContain('&&k!==CACHE'); // ...but the handler excludes it explicitly
  });

  it('serves navigations network-first so updates reach returning users', () => {
    expect(sw).toContain("event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')))");
  });

  it('precaches the app shell including the hashed entry asset', () => {
    const shell = JSON.parse(sw.match(/const SHELL = (\[.*?\]);/s)[1]);
    expect(shell).toContain('/');
    expect(shell).toContain('/index.html');
    expect(shell).toContain('/manifest.webmanifest');
    expect(shell).toContain('/assets/index-test.js');
  });
});
