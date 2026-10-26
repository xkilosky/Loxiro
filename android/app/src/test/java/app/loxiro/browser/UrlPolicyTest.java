package app.loxiro.browser;
import org.junit.Test;
import static org.junit.Assert.*;
public class UrlPolicyTest {
    @Test public void onlyHostedHomeAndSearchNeedTheNativeAddressBar(){
        assertTrue(UrlPolicy.isHomeSurface(UrlPolicy.HOME));
        assertTrue(UrlPolicy.isHomeSurface("https://LOXIRO-PREVIEW.VERCEL.APP:443/?android-shell=1#home"));
        assertTrue(UrlPolicy.isHomeSurface("https://loxiro-preview.vercel.app/#results?q=test"));
        assertTrue(UrlPolicy.isHomeSurface("https://loxiro-preview.vercel.app"));
        for(String url:new String[]{"https://example.org/","https://loxiro-preview.vercel.app.evil.org/","https://evil.org/?https://loxiro-preview.vercel.app/","http://loxiro-preview.vercel.app/","https://loxiro-preview.vercel.app:8443/","https://loxiro-preview.vercel.app/article","about:blank","https://user@loxiro-preview.vercel.app/"})assertFalse(url,UrlPolicy.isHomeSurface(url));
        assertFalse(UrlPolicy.isHomeSurface(null));
    }
    @Test public void acceptsWebNavigationWithoutCredentials() {
        assertTrue(UrlPolicy.isWebUrl("https://example.org/a?q=b#c"));
        assertTrue(UrlPolicy.isWebUrl("http://127.0.0.1:8080/file"));
        assertEquals("https://example.org/path",UrlPolicy.resolve("example.org/path"));
        assertEquals("https://example.org:443/path",UrlPolicy.resolve("example.org:443/path"));
    }
    @Test public void blocksPrivilegedOrMalformedSchemes() {
        for(String url:new String[]{"javascript:alert(1)","file:///sdcard/secret","content://settings/system","intent://example","data:text/html,hello","https://user:password@example.org","https://example.org:99999","https:///missing-host","https://exa mple.org"}) {
            assertFalse(url,UrlPolicy.isWebUrl(url));assertNull(url,UrlPolicy.resolve(url));
        }
        assertNull(UrlPolicy.resolve(null));assertNull(UrlPolicy.resolve("  "));assertFalse(UrlPolicy.isWebUrl(null));
    }
    @Test public void sharedLinksOnlyAllowSafeWebDestinations(){
        assertEquals("https://example.org/page",UrlPolicy.sharedLink("Read this: https://example.org/page."));
        assertEquals("http://example.org/",UrlPolicy.sharedLink("http://example.org/"));
        assertNull(UrlPolicy.sharedLink("javascript:alert(1)"));assertNull(UrlPolicy.sharedLink("file:///secret"));
        assertNull(UrlPolicy.sharedLink("https://user:pass@example.org"));assertNull(UrlPolicy.sharedLink(null));assertNull(UrlPolicy.sharedLink("No link here"));
        assertNull(UrlPolicy.sharedLink(new String(new char[8193]).replace('\0','a')));
    }
    @Test public void searchWordsUseTheExistingUnifiedSearchNotAnExternalEngine() {
        assertEquals("https://loxiro-preview.vercel.app/?android-shell=1#results?q=space+science",UrlPolicy.resolve("space science"));
        assertTrue(UrlPolicy.resolve("NASA").contains("#results?q=NASA"));
        assertNull(UrlPolicy.resolve(new String(new char[4097]).replace('\0','a')));
    }
}
