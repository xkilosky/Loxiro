// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SiteIcon } from './SiteIcon';
import { faviconUrl } from '../lib/favicon';
afterEach(cleanup);

describe('website favicons',()=>{
  it('requests only the hostname, without search text, paths, fragments or credentials',()=>{
    expect(faviconUrl('https://www.nasa.gov/news/?q=private-query#story')).toBe('https://icons.duckduckgo.com/ip3/www.nasa.gov.ico');
    expect(faviconUrl('http://bbc.com/article')).toBe('https://icons.duckduckgo.com/ip3/bbc.com.ico');
  });
  it.each(['javascript:alert(1)','data:image/png,x','file:///tmp/icon','not a URL','https://user:secret@example.org','http://127.0.0.1','http://[::1]','https://intranet.local','http://localhost','https://host.invalid'])('does not request an icon for %s',url=>{
    expect(faviconUrl(url)).toBeNull();
  });
  it('replaces numbers with a lazy decorative image and visible loading fallback',()=>{
    const {container}=render(<SiteIcon url="https://nasa.gov/news"/>);
    const image=container.querySelector('img')!;
    expect(image.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/nasa.gov.ico');
    expect(image.getAttribute('loading')).toBe('lazy');expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(image.alt).toBe('');expect(container.querySelector('svg')).not.toBeNull();expect(container.textContent).toBe('');
    fireEvent.load(image);expect(container.firstElementChild?.getAttribute('data-state')).toBe('loaded');expect(container.querySelector('svg')).toBeNull();
  });
  it('falls back to a globe on missing or blocked icons without a retry loop',()=>{
    const {container}=render(<SiteIcon url="https://example.org"/>);
    fireEvent.error(container.querySelector('img')!);
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('fallback');
    expect(container.querySelector('img')).toBeNull();expect(container.querySelector('svg')).not.toBeNull();
  });
  it('resets failed state when a result changes to a different site',()=>{
    const {container,rerender}=render(<SiteIcon url="https://example.org"/>);
    fireEvent.error(container.querySelector('img')!);rerender(<SiteIcon url="https://nasa.gov"/>);
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('loading');expect(container.querySelector('img')?.src).toContain('nasa.gov.ico');
  });
  it('uses a local globe without any image request for invalid destinations',()=>{
    const {container}=render(<SiteIcon url="javascript:alert(1)"/>);
    expect(container.querySelector('img')).toBeNull();expect(container.querySelector('svg')).not.toBeNull();
  });
});
