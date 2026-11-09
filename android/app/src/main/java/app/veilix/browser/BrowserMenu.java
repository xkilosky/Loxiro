package app.veilix.browser;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The browser overflow menu as plain data.
 *
 * It used to be one flat {@code String[]} paired with index arithmetic inside
 * the click listener, which meant the grouping could not be changed without
 * re-deriving every offset by hand. Holding the structure here keeps the
 * labels, their grouping and the label-to-action pairing unit testable on the
 * JVM, and leaves the dialog as a thin renderer that cannot drift from it.
 */
final class BrowserMenu {
    /** Every destination the overflow menu can open. */
    enum Action {
        SETTINGS, FULLSCREEN, FIND, SHARE, DEFAULT_BROWSER, OVERVIEW, REOPEN,
        OPEN_EXTERNAL, DOWNLOADS, CLOSE_UNPINNED, CLEAR_DATA, ABOUT,
        HOME, FORWARD, RELOAD_OR_STOP, NEW_TAB
    }

    /** One clickable row. */
    static final class Entry {
        final String label;
        final Action action;

        private Entry(String label, Action action) {
            this.label = label;
            this.action = action;
        }

        static Entry of(String label, Action action) { return new Entry(label, action); }
    }

    /** A titled group of rows. */
    static final class Section {
        final String title;
        final List<Entry> entries;

        private Section(String title, List<Entry> entries) {
            this.title = title;
            this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
        }

        static Section of(String title, Entry... entries) { return new Section(title, Arrays.asList(entries)); }
    }

    private BrowserMenu() {}

    static List<Section> sections() {
        List<Section> sections = new ArrayList<>();
        sections.add(Section.of("Browser",
                Entry.of("Browser settings", Action.SETTINGS),
                Entry.of("Full screen website", Action.FULLSCREEN),
                Entry.of("Default browser", Action.DEFAULT_BROWSER),
                Entry.of("Home", Action.HOME)));
        sections.add(Section.of("This page",
                Entry.of("Find in page", Action.FIND),
                Entry.of("Share page", Action.SHARE),
                Entry.of("Reload / stop", Action.RELOAD_OR_STOP),
                Entry.of("Forward", Action.FORWARD),
                Entry.of("Open page in external browser", Action.OPEN_EXTERNAL)));
        sections.add(Section.of("Tabs",
                Entry.of("New tab", Action.NEW_TAB),
                Entry.of("Website tabs", Action.OVERVIEW),
                Entry.of("Reopen last closed tab", Action.REOPEN),
                Entry.of("Close unpinned tabs", Action.CLOSE_UNPINNED)));
        sections.add(Section.of("Data & about",
                Entry.of("Android downloads", Action.DOWNLOADS),
                Entry.of("Clear browser data", Action.CLEAR_DATA),
                Entry.of("About this preview", Action.ABOUT)));
        return Collections.unmodifiableList(sections);
    }

    /**
     * Rows flattened for a list adapter, with each section title standing in for
     * its group. A {@link String} is a header; an {@link Entry} is clickable.
     */
    static List<Object> rows() {
        List<Object> rows = new ArrayList<>();
        for (Section section : sections()) {
            rows.add(section.title);
            rows.addAll(section.entries);
        }
        return Collections.unmodifiableList(rows);
    }

    /** A divider belongs after a row only when another row of the same group follows. */
    static List<Boolean> dividers(List<Object> rows) {
        List<Boolean> dividers = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            boolean action = rows.get(i) instanceof Entry;
            boolean nextIsAction = i + 1 < rows.size() && rows.get(i + 1) instanceof Entry;
            dividers.add(Boolean.valueOf(action && nextIsAction));
        }
        return dividers;
    }
}
