import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The Arctic Cyan palette and the radius/elevation scale live only in
 * src/styles/app.css, so regressions there are invisible to the component
 * tests. These assertions pin the parts other work depends on: the tokens the
 * components consume, the values theme-smoke.mjs checks in a real browser, and
 * a floor on legibility.
 */
const css = readFileSync(fileURLToPath(new URL('../src/styles/app.css', import.meta.url)), 'utf8');

const ruleFor = (selector) => {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`));
  return match ? match[0] : '';
};

describe('design tokens', () => {
  it('defines one radius scale that components can share', () => {
    for (const token of ['--radius-sm:10px', '--radius-md:14px', '--radius-lg:18px']) {
      expect(css).toContain(token);
    }
  });

  it('defines elevation and focus-ring tokens for both themes', () => {
    // Two definitions each: Arctic dark and White light.
    for (const token of ['--shadow-sm:', '--shadow-md:', '--shadow-ring:']) {
      expect(css.split(token)).toHaveLength(3);
    }
  });

  it('keeps the palette values the browser smoke suite asserts', () => {
    expect(css).toContain('--bg:#080B14'); // Arctic
    expect(css).toContain('--accent:#5FD9F0');
    expect(css).toContain('--on-accent:#04222B');
    expect(css).toContain('--bg:#F2F7FD'); // White
    expect(css).toContain('--accent:#0E7490');
    expect(css).toContain('--on-accent:#FFFFFF');
  });

  it('leaves the search button and logo mark on the palette, not a custom colour', () => {
    expect(ruleFor('.search-submit')).toContain('var(--accent)');
    expect(ruleFor('.logo-icon')).toContain('var(--accent)');
  });
});

describe('visual regressions this guards against', () => {
  it('never ships type smaller than 8px', () => {
    const tooSmall = [...css.matchAll(/font-size:([0-9.]+)px/g)]
      .map((m) => Number(m[1]))
      .filter((size) => size < 8);
    expect(tooSmall).toEqual([]);
  });

  it('gives the primary button a press, hover and focus state', () => {
    expect(css).toContain('.primary-btn:hover');
    expect(css).toContain('.primary-btn:active');
    expect(css).toContain('.primary-btn:focus-visible');
  });

  it('uses the shared radius scale for card containers instead of one-off values', () => {
    for (const selector of ['.settings-card', '.install-card', '.fusion-header', '.answer-card', '.saved-card', '.provider-status-list']) {
      expect(ruleFor(selector)).toContain('var(--radius-');
    }
  });
});
