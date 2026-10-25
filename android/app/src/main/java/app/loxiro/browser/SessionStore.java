package app.loxiro.browser;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Private app storage. No page content, cookies, passwords or WebView bundles. */
final class SessionStore {
    private final SharedPreferences preferences;
    SessionStore(Context context) { preferences = context.getSharedPreferences("native-tabs-v1", Context.MODE_PRIVATE); }
    TabSession restore(String home) {
        TabSession session = new TabSession();
        try {
            JSONObject root = new JSONObject(preferences.getString("session", "{}"));
            read(root.optJSONArray("tabs"), session, false);
            read(root.optJSONArray("closed"), session, true);
            session.activeId = root.optString("active");
        } catch (Exception ignored) { /* Corrupt storage falls back to a usable home tab. */ }
        if (session.tabs.isEmpty()) session.add(home);
        if (session.active() == null) session.activeId = session.tabs.get(0).id;
        // Stable pin-first grouping, including restored sessions.
        session.tabs.sort((a,b) -> Boolean.compare(b.pinned,a.pinned));
        return session;
    }
    private void read(JSONArray array, TabSession session, boolean closed) throws Exception {
        if (array == null) return;
        int limit = closed ? TabSession.MAX_CLOSED : TabSession.MAX_TABS;
        for (int i=0; i<array.length() && (closed?session.closed:session.tabs).size()<limit; i++) {
            JSONObject item = array.optJSONObject(i);if (item == null) continue;
            String id=item.optString("id"), url=item.optString("url");
            if (!id.matches("[\\w-]{1,80}") || !UrlPolicy.isWebUrl(url) || session.find(id)!=null) continue;
            boolean duplicate=false;for(TabSession.Tab t:session.closed)if(t.id.equals(id))duplicate=true;
            if(duplicate)continue;
            String title=item.optString("title").replaceAll("[\\p{Cntrl}\\p{Cf}]", "");
            title=title.substring(0,Math.min(title.length(),180));
            (closed?session.closed:session.tabs).add(new TabSession.Tab(id,url,title,item.optBoolean("pinned",false)));
        }
    }
    void save(TabSession session) {
        try {
            JSONObject root=new JSONObject();root.put("active",session.activeId);root.put("tabs",write(session.tabs));root.put("closed",write(session.closed));
            preferences.edit().putString("session",root.toString()).apply();
        } catch (Exception ignored) { /* An in-memory session still works if storage fails. */ }
    }
    private JSONArray write(java.util.List<TabSession.Tab> tabs) throws Exception {
        JSONArray out=new JSONArray();
        for(TabSession.Tab tab:tabs){JSONObject item=new JSONObject();item.put("id",tab.id);item.put("url",tab.url);item.put("title",tab.title);item.put("pinned",tab.pinned);out.put(item);}
        return out;
    }
    void clear() { preferences.edit().clear().apply(); }
}
