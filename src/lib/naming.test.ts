import { describe, expect, it } from 'vitest';
import { nextVersionName, splitName } from './naming';

describe('splitting a filename', () => {
  it('separates a plain name from its extension', () => {
    expect(splitName('App.pdf')).toEqual({base: 'App', ext: '.pdf'});
  });
  it('keeps only the last extension of a compound name', () => {
    expect(splitName('App.tar.gz')).toEqual({base: 'App.tar', ext: '.gz'});
  });
  it('treats a leading dot as part of the name, not an extension', () => {
    expect(splitName('.gitignore')).toEqual({base: '.gitignore', ext: ''});
  });
  it('treats a trailing dot as having no extension', () => {
    expect(splitName('App.')).toEqual({base: 'App.', ext: ''});
  });
  it('leaves an extensionless name whole', () => {
    expect(splitName('README')).toEqual({base: 'README', ext: ''});
  });
});

describe('versioning a name that is already taken', () => {
  it('leaves a free name untouched', () => {
    expect(nextVersionName('App.pdf', ['Other.pdf'])).toBe('App.pdf');
    expect(nextVersionName('App.pdf', [])).toBe('App.pdf');
  });
  it('versions a taken name to _v2 so both files survive under distinct names', () => {
    expect(nextVersionName('App.pdf', ['App.pdf'])).toBe('App_v2.pdf');
  });
  it('skips ahead past versions that are also taken', () => {
    expect(nextVersionName('App.pdf', ['App.pdf', 'App_v2.pdf'])).toBe('App_v3.pdf');
  });
  it('inserts before the last extension, the way Windows and macOS do', () => {
    expect(nextVersionName('App.tar.gz', ['App.tar.gz'])).toBe('App.tar_v2.gz');
  });
  it('puts the version inside a dotfile rather than after it', () => {
    expect(nextVersionName('.gitignore', ['.gitignore'])).toBe('.gitignore_v2');
  });
  it('appends the version to a name with no extension', () => {
    expect(nextVersionName('README', ['README'])).toBe('README_v2');
  });
  it('always terminates, even with an implausible pile of prior versions', () => {
    const taken = ['App.pdf', ...Array.from({length: 998}, (_, i) => `App_v${i + 2}.pdf`)];
    expect(nextVersionName('App.pdf', taken)).not.toBe('App.pdf');
    expect(nextVersionName('App.pdf', taken)).toMatch(/^App_v\d+\.pdf$/);
  });
});
