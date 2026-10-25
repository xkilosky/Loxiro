package app.loxiro.browser;
import org.junit.Test;
import static org.junit.Assert.*;
public class BrowserSettingsTest {
    @Test public void defaultsKeepBrowsingCompactAndZoomAvailable(){
        BrowserSettings settings=new BrowserSettings();assertEquals(100,settings.textZoom);
        assertTrue(settings.pinchZoom);assertTrue(settings.tabPreviews);assertFalse(settings.keepScreenOn);assertFalse(settings.largeControls);
    }
    @Test public void textZoomHasSafeBounds(){
        assertEquals(75,BrowserSettings.clampTextZoom(-100));assertEquals(200,BrowserSettings.clampTextZoom(999));
        assertEquals(125,BrowserSettings.clampTextZoom(125));assertEquals(100,BrowserSettings.clampTextZoom(100));
    }
}
