package app.veilix.browser;

import org.junit.Test;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import static org.junit.Assert.*;

public class BrowserMenuTest {
    /** The instrumentation tests open the menu and click these by visible text. */
    private static final String[] CLICKED_BY_TESTS = {
        "Browser settings", "Full screen website", "Find in page", "Share page", "Default browser"
    };

    @Test public void keepsEveryActionReachableExactlyOnce() {
        List<BrowserMenu.Action> seen = new ArrayList<>();
        for (BrowserMenu.Section section : BrowserMenu.sections())
            for (BrowserMenu.Entry entry : section.entries) seen.add(entry.action);
        assertEquals(BrowserMenu.Action.values().length, seen.size());
        assertEquals(BrowserMenu.Action.values().length, new HashSet<>(seen).size());
    }

    @Test public void keepsTheLabelsTheInstrumentationTestsClickByText() {
        for (String label : CLICKED_BY_TESTS) assertNotNull(label, find(label));
    }

    @Test public void hasNoDuplicateLabels() {
        List<String> labels = new ArrayList<>();
        for (BrowserMenu.Section section : BrowserMenu.sections())
            for (BrowserMenu.Entry entry : section.entries) labels.add(entry.label);
        assertEquals(labels.size(), new HashSet<>(labels).size());
    }

    @Test public void hasNoEmptySection() {
        for (BrowserMenu.Section section : BrowserMenu.sections())
            assertTrue(section.title, !section.entries.isEmpty());
    }

    @Test public void flattensEveryEntryUnderAHeader() {
        List<Object> rows = BrowserMenu.rows();
        int entries = 0;
        for (Object row : rows) if (row instanceof BrowserMenu.Entry) entries++;
        int expected = 0;
        for (BrowserMenu.Section section : BrowserMenu.sections()) expected += section.entries.size();
        assertEquals(expected, entries);
        assertEquals(expected + BrowserMenu.sections().size(), rows.size());
    }

    @Test public void drawsADividerOnlyBetweenRowsOfTheSameGroup() {
        List<Object> rows = BrowserMenu.rows();
        List<Boolean> dividers = BrowserMenu.dividers(rows);
        assertEquals(rows.size(), dividers.size());
        for (int i = 0; i < rows.size(); i++) {
            boolean lastOfGroup = i + 1 >= rows.size() || rows.get(i + 1) instanceof String;
            assertEquals("row " + i, !(rows.get(i) instanceof BrowserMenu.Entry) || lastOfGroup,
                    !dividers.get(i).booleanValue());
        }
    }

    @Test public void exposesAnImmutableStructure() {
        try {
            BrowserMenu.sections().clear();
            fail("sections must be immutable");
        } catch (UnsupportedOperationException expected) {
            // The dialog renders this list while it is open.
        }
        try {
            BrowserMenu.rows().clear();
            fail("rows must be immutable");
        } catch (UnsupportedOperationException expected) {
        }
    }

    private static BrowserMenu.Entry find(String label) {
        for (BrowserMenu.Section section : BrowserMenu.sections())
            for (BrowserMenu.Entry entry : section.entries)
                if (entry.label.equals(label)) return entry;
        return null;
    }
}
