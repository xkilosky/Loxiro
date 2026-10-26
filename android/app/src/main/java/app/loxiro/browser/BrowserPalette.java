package app.loxiro.browser;

/** Native OLED chrome; never recolors third-party website content or screenshots. */
final class BrowserPalette {
    static final int BACKGROUND=0xff000000, SURFACE=0xff0c0c0c, RAISED=0xff1b1b1b,
        INK=0xffffffff, MUTED=0xffb0b0b0, ACCENT=0xffffffff, ON_ACCENT=0xff000000,
        LINE=0xff404040, RIPPLE=0x33ffffff, ERROR=0xffffb4ab;
    private BrowserPalette() {}
}
