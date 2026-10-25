package app.loxiro.browser;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Native website tabs, not the React workspace tab model. No Android dependencies. */
final class TabSession {
    static final int MAX_TABS = 12;
    static final int MAX_CLOSED = 10;
    static final class Tab {
        final String id;
        String url;
        String title;
        boolean pinned;
        Tab(String url) { this(UUID.randomUUID().toString(), url, "", false); }
        Tab(String id, String url, String title, boolean pinned) {
            this.id = id; this.url = url; this.title = title; this.pinned = pinned;
        }
        String label() { return title.isEmpty() ? UrlPolicy.label(url) : title; }
    }
    final List<Tab> tabs = new ArrayList<>();
    final List<Tab> closed = new ArrayList<>();
    String activeId;
    Tab active() { for (Tab tab : tabs) if (tab.id.equals(activeId)) return tab; return null; }
    Tab find(String id) { for (Tab tab : tabs) if (tab.id.equals(id)) return tab; return null; }
    Tab add(String url) {
        if (tabs.size() >= MAX_TABS || !UrlPolicy.isWebUrl(url)) return null;
        Tab tab = new Tab(url); tabs.add(tab); activeId = tab.id; return tab;
    }
    boolean select(String id) { if (find(id) == null) return false; activeId = id; return true; }
    boolean close(String id, String home) {
        Tab tab = find(id); if (tab == null) return false;
        int index = tabs.indexOf(tab); tabs.remove(tab); closed.add(0, tab);
        if (closed.size() > MAX_CLOSED) closed.remove(closed.size() - 1);
        if (tabs.isEmpty()) add(home);
        else if (id.equals(activeId)) activeId = tabs.get(Math.min(index, tabs.size() - 1)).id;
        return true;
    }
    Tab reopen() { return closed.isEmpty()?null:reopen(closed.get(0).id); }
    Tab reopen(String id) {
        if(tabs.size()>=MAX_TABS)return null;
        for(Tab tab:new ArrayList<>(closed))if(tab.id.equals(id)){
            closed.remove(tab);tabs.add(tab);sortPins();activeId=tab.id;return tab;
        }
        return null;
    }
    Tab duplicate(String id) {
        Tab original = find(id);if (original == null) return null;
        Tab tab = add(original.url);if (tab != null) tab.title = original.title;return tab;
    }
    void pin(String id) { Tab tab = find(id);if (tab != null) {tab.pinned = !tab.pinned;sortPins();} }
    private void sortPins() { tabs.sort((a,b) -> Boolean.compare(b.pinned,a.pinned)); }
    void move(String id, int direction) {
        Tab tab = find(id);int i = tabs.indexOf(tab), j = i + direction;
        if (i >= 0 && j >= 0 && j < tabs.size() && tab.pinned == tabs.get(j).pinned) {
            tabs.set(i, tabs.get(j));tabs.set(j,tab);
        }
    }
}
