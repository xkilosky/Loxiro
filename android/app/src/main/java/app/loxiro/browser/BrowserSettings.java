package app.loxiro.browser;

/** Native browser preferences. Independent of the hosted web app's local settings. */
final class BrowserSettings {
    static final int MIN_TEXT_ZOOM=75, MAX_TEXT_ZOOM=200;
    int textZoom=100;
    boolean pinchZoom=true, tabPreviews=true, keepScreenOn=false, largeControls=false;
    static int clampTextZoom(int value){return Math.max(MIN_TEXT_ZOOM,Math.min(MAX_TEXT_ZOOM,value));}
}
