package app.loxiro.browser;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.res.ColorStateList;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

/** Scrollable, native, screen-reader-labeled settings; no website JavaScript bridge. */
final class BrowserSettingsDialog extends Dialog {
    interface Actions {
        void changed();
        void accessibility();
        void display();
        void defaultBrowser();
        void downloads();
        void clearData();
    }
    private static final int INK=BrowserPalette.INK, MUTED=BrowserPalette.MUTED, ACCENT=BrowserPalette.ACCENT, BG=BrowserPalette.BACKGROUND;
    private final BrowserSettings settings;
    private final Actions actions;
    private LinearLayout sections;
    private TextView zoomValue;
    private SeekBar zoom;
    private Button less,more;
    BrowserSettingsDialog(BrowserActivity activity,BrowserSettings settings,Actions actions){
        super(activity,R.style.AppTheme);this.settings=settings;this.actions=actions;build();
    }
    private int dp(int n){return Math.round(n*getContext().getResources().getDisplayMetrics().density);}
    private LinearLayout column(){LinearLayout v=new LinearLayout(getContext());v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout row(){LinearLayout v=new LinearLayout(getContext());v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private TextView text(String value,int size,int color){TextView v=new TextView(getContext());v.setText(value);v.setTextSize(size);v.setTextColor(color);return v;}
    private GradientDrawable surface(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private Button button(String title,String label,View.OnClickListener click){
        Button b=new Button(getContext());b.setText(title);b.setContentDescription(label);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(ACCENT);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(48));b.setMinimumHeight(dp(48));b.setPadding(dp(12),dp(6),dp(12),dp(6));
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(BrowserPalette.RIPPLE),surface(0x00000000,12),null));b.setOnClickListener(click);return b;
    }
    private void build(){
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout root=column();root.setId(R.id.browser_settings);root.setBackgroundColor(BG);root.setFocusableInTouchMode(true);root.requestFocus();
        LinearLayout header=row();header.setPadding(dp(8),dp(8),dp(16),dp(8));
        Button back=button("‹","Close browser settings",v->dismiss());back.setTextSize(28);header.addView(back,new LinearLayout.LayoutParams(dp(48),dp(56)));
        TextView title=text("Browser settings",24,INK);title.setTypeface(null,Typeface.BOLD);title.setAccessibilityHeading(true);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));root.addView(header);
        ScrollView scroll=new ScrollView(getContext());scroll.setFillViewport(true);sections=column();sections.setPadding(dp(20),dp(8),dp(20),dp(28));scroll.addView(sections);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        renderSections();setContentView(root);
        if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);root.setOnApplyWindowInsetsListener((v,insets)->{Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);return insets;});}else root.setFitsSystemWindows(true);
    }
    @Override public void show(){super.show();getWindow().setLayout(-1,-1);}
    private void heading(String label){TextView h=text(label,18,INK);h.setTypeface(null,Typeface.BOLD);h.setAccessibilityHeading(true);h.setPadding(0,dp(24),0,dp(10));sections.addView(h);}
    private void description(String value){TextView d=text(value,13,MUTED);d.setLineSpacing(dp(3),1);d.setPadding(0,0,0,dp(12));sections.addView(d);}
    private interface Toggle {void set(boolean value);}
    private void toggle(String title,String description,boolean checked,Toggle action){
        LinearLayout card=column();card.setPadding(dp(14),dp(4),dp(14),dp(12));card.setBackground(surface(BrowserPalette.SURFACE,16));
        Switch control=new Switch(getContext());control.setText(title);control.setTextSize(15);control.setTextColor(INK);control.setMinHeight(dp(56));control.setChecked(checked);control.setSwitchPadding(dp(12));control.setOnCheckedChangeListener((b,value)->{action.set(value);actions.changed();});card.addView(control,new LinearLayout.LayoutParams(-1,-2));
        TextView detail=text(description,12,MUTED);detail.setLineSpacing(dp(2),1);card.addView(detail);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,0,0,dp(10));sections.addView(card,p);
    }
    private void action(String label,String description,View.OnClickListener click){Button b=button(label,label,click);b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);sections.addView(b,new LinearLayout.LayoutParams(-1,-2));description(description);}
    private void renderSections(){
        sections.removeAllViews();description("Changes save on this device and apply to current and new website tabs. These are separate from Home’s web-app settings.");
        heading("Zoom & reading");description("Website text size");
        LinearLayout scale=row();scale.setPadding(dp(4),dp(4),dp(4),dp(4));scale.setBackground(surface(BrowserPalette.RAISED,16));
        less=button("−","Decrease website text size",v->setZoom(settings.textZoom-5));scale.addView(less,new LinearLayout.LayoutParams(dp(56),dp(56)));
        zoomValue=text("",24,INK);zoomValue.setId(R.id.website_text_zoom_value);zoomValue.setGravity(Gravity.CENTER);zoomValue.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);scale.addView(zoomValue,new LinearLayout.LayoutParams(0,-2,1));
        more=button("+","Increase website text size",v->setZoom(settings.textZoom+5));scale.addView(more,new LinearLayout.LayoutParams(dp(56),dp(56)));sections.addView(scale);
        zoom=new SeekBar(getContext());zoom.setId(R.id.website_text_zoom);zoom.setContentDescription("Website text size, 75 to 200 percent");zoom.setMax(BrowserSettings.MAX_TEXT_ZOOM-BrowserSettings.MIN_TEXT_ZOOM);zoom.setMinHeight(dp(48));sections.addView(zoom,new LinearLayout.LayoutParams(-1,dp(48)));
        zoom.setAccessibilityDelegate(new View.AccessibilityDelegate(){
            @Override public void onInitializeAccessibilityNodeInfo(View host,AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.setRangeInfo(AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_INT,BrowserSettings.MIN_TEXT_ZOOM,BrowserSettings.MAX_TEXT_ZOOM,settings.textZoom));info.setContentDescription("Website text size, "+settings.textZoom+" percent");}
            @Override public boolean performAccessibilityAction(View host,int action,Bundle args){
                if(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD){setZoom(settings.textZoom+5);return true;}
                if(action==AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD){setZoom(settings.textZoom-5);return true;}
                if(action==AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId()&&args!=null&&args.containsKey(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE)){setZoom(Math.round(args.getFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE)));return true;}
                return super.performAccessibilityAction(host,action,args);
            }
        });
        zoom.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar bar,int value,boolean user){if(user)setZoom(BrowserSettings.MIN_TEXT_ZOOM+Math.round(value/5f)*5);}public void onStartTrackingTouch(SeekBar bar){}public void onStopTrackingTouch(SeekBar bar){}});
        updateZoom();sections.addView(button("Reset text size to 100%","Reset website text size",v->setZoom(100)));
        description("75–200%. Resizes website text, not images or browser controls. Some sites use fixed layouts and may not fully respond.");
        toggle("Pinch to zoom","Use two fingers to magnify a page. Websites may limit the available zoom range.",settings.pinchZoom,value->settings.pinchZoom=value);
        heading("Accessibility");
        toggle("Roomier address bar","Larger address text, a 72dp toolbar instead of 56dp, and a larger fullscreen Tabs button. Uses a little more website space.",settings.largeControls,value->settings.largeControls=value);
        action("Android accessibility settings","TalkBack, magnification and other device accessibility services are managed by Android.",v->actions.accessibility());
        action("Android display settings","Adjust your device’s font and display size. Loxiro’s native text follows the system font scale.",v->actions.display());
        heading("Tabs & privacy");
        toggle("Show tab previews","Last-viewed snapshots stay in memory only. Turn off to hide page contents in the tab switcher and discard existing previews.",settings.tabPreviews,value->settings.tabPreviews=value);
        heading("Other");
        action("Default browser","Ask Android to use Loxiro for website links. You choose whether to grant this role.",v->actions.defaultBrowser());
        toggle("Keep screen awake","Keep the display on while Loxiro is in the foreground. May use more battery.",settings.keepScreenOn,value->settings.keepScreenOn=value);
        action("Android downloads","View files handled by Android’s system downloader.",v->actions.downloads());
        action("Clear browser data","Close native tabs and clear this app’s cookies, website storage and cache. Downloaded files and browser settings remain.",v->{dismiss();actions.clearData();});
        action("Reset browser settings","Restore zoom and these switches to defaults. Tabs, cookies and downloaded files stay.",v->new AlertDialog.Builder(getContext()).setTitle("Reset browser settings?").setMessage("Restore text size to 100%, enable pinch zoom and tab previews, use the compact toolbar, and turn off keep-awake? Your tabs and browser data stay.").setNegativeButton("Cancel",null).setPositiveButton("Reset",(d,w)->{
            settings.textZoom=100;settings.pinchZoom=true;settings.tabPreviews=true;settings.keepScreenOn=false;settings.largeControls=false;actions.changed();renderSections();
        }).show());
    }
    private void setZoom(int value){settings.textZoom=BrowserSettings.clampTextZoom(value);updateZoom();actions.changed();}
    private void updateZoom(){zoomValue.setText(settings.textZoom+"%");zoom.setProgress(settings.textZoom-BrowserSettings.MIN_TEXT_ZOOM);less.setEnabled(settings.textZoom>BrowserSettings.MIN_TEXT_ZOOM);more.setEnabled(settings.textZoom<BrowserSettings.MAX_TEXT_ZOOM);}
}
