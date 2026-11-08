import {describe,expect,it} from 'vitest';
import {isAndroidBrowser} from './platform';
describe('native browser presentation hint',()=>{
  it('recognizes only an explicit Veilix Android user-agent token',()=>{
    expect(isAndroidBrowser('Mozilla/5.0 Android WebView VeilixAndroid/0.8')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 Android')).toBe(false);
    expect(isAndroidBrowser('FakeVeilixAndroid/0.8')).toBe(false);
    expect(isAndroidBrowser('VeilixAndroid/not-a-version')).toBe(false);
  });
  // APKs installed before the rename still announce the old token and must keep working.
  it('still recognizes the legacy pre-rename token from already-installed builds',()=>{
    expect(isAndroidBrowser('Mozilla/5.0 Android WebView LoxiroAndroid/0.7')).toBe(true);
    expect(isAndroidBrowser('FakeLoxiroAndroid/0.7')).toBe(false);
    expect(isAndroidBrowser('LoxiroAndroid/not-a-version')).toBe(false);
  });
});
