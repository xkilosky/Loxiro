import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The Veilix mark used to exist three times over -- as an app icon, as a
 * favicon, and as a div-built .logo-icon inside the UI -- and the three had
 * drifted apart. It is now one master PNG (docs/assets/veilix-mark-source.png)
 * that scripts/build-icons.py recolours and exports, so every surface shares
 * the same geometry by construction.
 *
 * These assertions pin the outputs of that build: the files exist at the sizes
 * the manifest and index.html promise, and every one of them is drawn in the
 * Arctic palette and nothing else.
 */
const ARCTIC = ['#080B14', '#5FD9F0', '#A9EEFA'];

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

/** Width and height straight out of a PNG's IHDR, no decoder needed. */
const pngSize = (relative) => {
  const buf = readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

describe('app icons', () => {
  it('ships every raster size the manifest and favicon links promise', () => {
    const expected = {
      'public/icons/icon-16.png': [16, 16],
      'public/icons/icon-32.png': [32, 32],
      'public/icons/icon-192.png': [192, 192],
      'public/icons/icon-512.png': [512, 512],
    };
    for (const [file, [width, height]] of Object.entries(expected)) {
      expect(pngSize(file), file).toEqual({ width, height });
    }
  });

  it('draws the vector master only in Arctic palette colours', () => {
    const svg = read('public/icons/icon.svg');
    const fills = [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(ARCTIC, `unexpected fill ${fill}`).toContain(fill);
    }
  });

  it('draws the Android launcher icon only in Arctic palette colours', () => {
    const vector = read('android/app/src/main/res/drawable/ic_veilix.xml');
    const fills = [...vector.matchAll(/android:fillColor="(#[0-9A-Fa-f]{6})"/g)]
      .map((m) => m[1].toUpperCase());
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(ARCTIC, `unexpected fill ${fill}`).toContain(fill);
    }
  });

  it('keeps the mark geometry identical across the web and Android vectors', () => {
    // One path per traced shape, in the mark colours, in each file. If these
    // ever disagree, one of them was edited by hand instead of regenerated.
    const svgMarks = (read('public/icons/icon.svg').match(/fill="#(5FD9F0|A9EEFA)"/g) || []).length;
    const androidMarks = (read('android/app/src/main/res/drawable/ic_veilix.xml')
      .match(/android:fillColor="#(5FD9F0|A9EEFA)"/g) || []).length;
    expect(svgMarks).toBeGreaterThan(0);
    expect(androidMarks).toBe(svgMarks);
  });

  it('scales the mark identically into the Android viewport', () => {
    // The Android drawable is the same geometry at 108/512 of the SVG's
    // viewBox, so a vertex in one divided by the ratio is the other's.
    // The background tile is skipped: it is a rect in the SVG and a path in
    // the drawable, and its coordinates are unrelated to the mark.
    const svg = read('public/icons/icon.svg');
    const vector = read('android/app/src/main/res/drawable/ic_veilix.xml');
    const first = (text, re) => text.match(re)[1].split(/[ ,]+/).slice(0, 2).map(Number);
    const [sx, sy] = first(svg, /<path d="M([^"]*)" fill="#(?:5FD9F0|A9EEFA)"/);
    const [ax, ay] = first(vector,
      /android:fillColor="#(?:5FD9F0|A9EEFA)" android:pathData="M([^"]*)"/);
    const ratio = 108 / 512;
    expect(sx).toBeGreaterThan(0);
    expect(ax).toBeCloseTo(sx * ratio, 2);
    expect(ay).toBeCloseTo(sy * ratio, 2);
  });

  it('registers the icons in the manifest', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    const srcs = manifest.icons.map((i) => i.src);
    for (const src of ['/icons/icon-192.png', '/icons/icon-512.png']) {
      expect(srcs).toContain(src);
    }
    // A maskable entry must exist so Android has a safe-zone-cropped variant.
    expect(manifest.icons.some((i) => (i.purpose || '').includes('maskable'))).toBe(true);
  });

  it('points the favicon at the vector master', () => {
    const html = read('index.html');
    expect(html).toContain('href="/icons/icon.svg"');
    expect(html).toContain('href="/icons/icon-32.png"');
    expect(html).toContain('href="/icons/icon-16.png"');
  });

  it('renders the mark in the UI from the asset, not from divs', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('src="/icons/icon.svg"');
    expect(app).not.toContain('className="logo-icon"');
  });
});
