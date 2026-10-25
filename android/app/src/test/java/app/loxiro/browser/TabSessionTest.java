package app.loxiro.browser;
import org.junit.Test;
import static org.junit.Assert.*;
public class TabSessionTest {
    @Test public void selectsIndependentWebsiteTabsAndClosesNeighbors() {
        TabSession s=new TabSession();TabSession.Tab a=s.add("https://example.org/a"),b=s.add("https://example.org/b");
        assertEquals(b.id,s.activeId);assertTrue(s.select(a.id));assertEquals(a.url,s.active().url);
        s.close(b.id,UrlPolicy.HOME);assertEquals(a.id,s.activeId);assertEquals(b.id,s.closed.get(0).id);
        assertEquals(b.id,s.reopen().id);assertEquals(b.id,s.activeId);
    }
    @Test public void closingTheFinalTabKeepsNativeChromeUsable() {
        TabSession s=new TabSession();TabSession.Tab a=s.add("https://example.org/a");
        s.close(a.id,UrlPolicy.HOME);assertEquals(1,s.tabs.size());assertEquals(UrlPolicy.HOME,s.active().url);assertNotEquals(a.id,s.activeId);
    }
    @Test public void capsOpenAndClosedTabs() {
        TabSession s=new TabSession();for(int i=0;i<12;i++)assertNotNull(s.add("https://example.org/"+i));
        assertNull(s.add("https://example.org/extra"));assertEquals(12,s.tabs.size());assertNull(s.add("javascript:evil()"));
        for(int i=0;i<12;i++)s.close(s.tabs.get(0).id,UrlPolicy.HOME);
        assertEquals(10,s.closed.size());assertEquals(1,s.tabs.size());
    }
    @Test public void restoresASpecificClosedCardWithoutLosingOtherHistory() {
        TabSession s=new TabSession();TabSession.Tab a=s.add("https://example.org/a"),b=s.add("https://example.org/b");
        a.title="A saved title";s.pin(a.id);s.close(a.id,UrlPolicy.HOME);s.close(b.id,UrlPolicy.HOME);
        assertEquals(b.id,s.closed.get(0).id);
        assertEquals(a.id,s.reopen(a.id).id);assertEquals(a.id,s.activeId);assertTrue(s.active().pinned);assertEquals("A saved title",s.active().title);
        assertEquals(1,s.closed.size());assertEquals(b.id,s.closed.get(0).id);assertNull(s.reopen(a.id));assertNull(s.reopen("missing"));
        while(s.tabs.size()<12)s.add("https://example.org/extra");
        assertNull(s.reopen(b.id));assertEquals(b.id,s.closed.get(0).id);
    }
    @Test public void preservesPinsAndDuplicatesUrlsWithoutSharingIds() {
        TabSession s=new TabSession();TabSession.Tab a=s.add("https://example.org/a"),b=s.add("https://example.org/b");
        s.pin(b.id);assertEquals(b.id,s.tabs.get(0).id);assertTrue(b.pinned);s.move(a.id,-1);assertEquals(b.id,s.tabs.get(0).id);
        TabSession.Tab copy=s.duplicate(b.id);assertNotEquals(copy.id,b.id);assertEquals(b.url,copy.url);assertFalse(copy.pinned);
        s.move(copy.id,-1);assertEquals(copy.id,s.tabs.get(1).id);assertNull(s.duplicate("missing"));assertFalse(s.select("missing"));
    }
}
