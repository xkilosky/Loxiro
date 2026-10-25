import {describe,expect,it} from 'vitest';
import {isAndroidBrowser} from './platform';
describe('native browser presentation hint',()=>{
  it('recognizes only an explicit Loxiro Android user-agent token',()=>{
    expect(isAndroidBrowser('Mozilla/5.0 Android WebView LoxiroAndroid/0.7')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 Android')).toBe(false);
    expect(isAndroidBrowser('FakeLoxiroAndroid/0.7')).toBe(false);
    expect(isAndroidBrowser('LoxiroAndroid/not-a-version')).toBe(false);
  });
});
