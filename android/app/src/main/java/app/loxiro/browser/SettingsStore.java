package app.loxiro.browser;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

final class SettingsStore {
    private final SharedPreferences prefs;
    SettingsStore(Context context){prefs=context.getSharedPreferences("native-settings-v1",Context.MODE_PRIVATE);}
    BrowserSettings load(){
        BrowserSettings s=new BrowserSettings();Map<String,?> values=prefs.getAll();
        Object zoom=values.get("textZoom");if(zoom instanceof Integer)s.textZoom=BrowserSettings.clampTextZoom((Integer)zoom);
        Object pinch=values.get("pinchZoom");if(pinch instanceof Boolean)s.pinchZoom=(Boolean)pinch;
        Object previews=values.get("tabPreviews");if(previews instanceof Boolean)s.tabPreviews=(Boolean)previews;
        Object awake=values.get("keepScreenOn");if(awake instanceof Boolean)s.keepScreenOn=(Boolean)awake;
        Object large=values.get("largeControls");if(large instanceof Boolean)s.largeControls=(Boolean)large;
        return s;
    }
    void save(BrowserSettings s){prefs.edit().putInt("textZoom",BrowserSettings.clampTextZoom(s.textZoom)).putBoolean("pinchZoom",s.pinchZoom).putBoolean("tabPreviews",s.tabPreviews).putBoolean("keepScreenOn",s.keepScreenOn).putBoolean("largeControls",s.largeControls).apply();}
}
