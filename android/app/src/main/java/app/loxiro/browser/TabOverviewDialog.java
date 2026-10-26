package app.loxiro.browser;

import android.app.Dialog;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Native, on-demand overview. No second omnibox, hidden WebViews or disk thumbnails. */
final class TabOverviewDialog extends Dialog {
    interface Actions {
        void select(String id);
        void create();
        void close(String id);
        boolean restore(String id);
        void options(String id);
    }
    private static final int INK=BrowserPalette.INK, MUTED=BrowserPalette.MUTED, ACCENT=BrowserPalette.ACCENT, BG=BrowserPalette.BACKGROUND;
    private final TabSession session;
    private final Map<String,Bitmap> previews;
    private final Actions actions;
    private LinearLayout grid, notice;
    private TextView count;
    private Button all, pinned, closed, add;
    private ScrollView scroll;
    private int filter; // All, pinned, recently closed.
    private String undoId;
    private int columns;

    TabOverviewDialog(BrowserActivity activity, TabSession session, Map<String,Bitmap> previews, Actions actions) {
        super(activity, R.style.AppTheme);
        this.session=session;this.previews=previews;this.actions=actions;
        build();
    }
    private int dp(int n){return Math.round(n*getContext().getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private LinearLayout column(){LinearLayout v=new LinearLayout(getContext());v.setOrientation(LinearLayout.VERTICAL);return v;}
    private LinearLayout row(){LinearLayout v=new LinearLayout(getContext());v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private TextView text(String value,int size,int color){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);return t;}
    private Button button(String title,String label,View.OnClickListener action){
        Button b=new Button(getContext());b.setText(title);b.setTextSize(13);b.setTextColor(INK);b.setAllCaps(false);b.setContentDescription(label);
        b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(48));b.setMinimumHeight(dp(48));b.setPadding(dp(10),0,dp(10),0);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(BrowserPalette.RIPPLE),shape(0x00000000,14),null));b.setOnClickListener(action);return b;
    }
    private void build(){
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout root=column();root.setId(R.id.tab_overview);root.setBackgroundColor(BG);root.setFocusableInTouchMode(true);root.requestFocus();
        LinearLayout header=row();header.setPadding(dp(8),dp(8),dp(12),0);
        Button done=button("‹","Return to website",v->dismiss());done.setTextSize(28);header.addView(done,new LinearLayout.LayoutParams(dp(48),dp(56)));
        LinearLayout heading=column();TextView title=text("Your tabs",26,INK);title.setTypeface(null,Typeface.BOLD);title.setAccessibilityHeading(true);heading.addView(title);
        count=text("",12,MUTED);heading.addView(count);header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        TextView brand=text("LOXIRO",10,ACCENT);brand.setLetterSpacing(.15f);header.addView(brand);root.addView(header);
        LinearLayout filters=row();filters.setPadding(dp(12),dp(16),dp(12),dp(12));
        all=button("All","All tabs",v->chooseFilter(0));all.setId(R.id.tab_filter_all);
        pinned=button("Pinned","Pinned tabs",v->chooseFilter(1));pinned.setId(R.id.tab_filter_pinned);
        closed=button("Closed","Recently closed tabs",v->chooseFilter(2));closed.setId(R.id.tab_filter_closed);
        for(Button b:new Button[]{all,pinned,closed}){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);p.setMargins(dp(3),0,dp(3),0);filters.addView(b,p);}root.addView(filters);
        scroll=new ScrollView(getContext());scroll.setFillViewport(true);scroll.setClipToPadding(false);scroll.setPadding(dp(8),dp(4),dp(8),dp(12));
        grid=column();grid.setId(R.id.tab_card_grid);scroll.addView(grid);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        notice=row();notice.setPadding(dp(18),0,dp(12),0);notice.setVisibility(View.GONE);notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);root.addView(notice);
        LinearLayout footer=column();footer.setPadding(dp(16),dp(8),dp(16),dp(12));
        add=button("+  New tab","New website tab",v->actions.create());add.setId(R.id.new_tab);add.setTextColor(BrowserPalette.ON_ACCENT);add.setTypeface(null,Typeface.BOLD);
        add.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22000000),shape(ACCENT,18),null));footer.addView(add,new LinearLayout.LayoutParams(-1,dp(52)));
        TextView hint=text("Long-press a card for more options · Previews in memory only",10,MUTED);hint.setGravity(Gravity.CENTER);hint.setPadding(0,dp(10),0,0);footer.addView(hint);root.addView(footer);
        setContentView(root);Window window=getWindow();
        if(Build.VERSION.SDK_INT>=30){window.setDecorFitsSystemWindows(false);root.setOnApplyWindowInsetsListener((v,insets)->{
            Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);return insets;
        });}else root.setFitsSystemWindows(true);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN|WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        // Layout is based on the actual window, including split-screen, not device width.
        scroll.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{int next=columnCount(r-l);if(next!=columns){columns=next;refresh();}});
        refresh();
    }
    @Override public void show(){super.show();getWindow().setLayout(-1,-1);}
    private int columnCount(int width){int usable=Math.round(width/getContext().getResources().getDisplayMetrics().density);return Math.max(1,Math.min(4,usable/156));}
    private void chooseFilter(int value){filter=value;scroll.scrollTo(0,0);refresh();}
    void refresh(){
        if(grid==null)return;
        int pinCount=0;for(TabSession.Tab t:session.tabs)if(t.pinned)pinCount++;
        count.setText(session.tabs.size()+" open  ·  "+pinCount+" pinned");
        all.setText("All · "+session.tabs.size());pinned.setText("Pinned · "+pinCount);closed.setText("Closed · "+session.closed.size());
        Button[] filters={all,pinned,closed};for(int i=0;i<filters.length;i++){boolean selected=i==filter;filters[i].setSelected(selected);filters[i].setTextColor(selected?ACCENT:MUTED);filters[i].setTypeface(null,selected?Typeface.BOLD:Typeface.NORMAL);filters[i].setBackground(new RippleDrawable(ColorStateList.valueOf(BrowserPalette.RIPPLE),shape(selected?BrowserPalette.RAISED:0x00000000,14),null));}
        add.setEnabled(session.tabs.size()<TabSession.MAX_TABS);add.setText(session.tabs.size()<TabSession.MAX_TABS?"+  New tab":"12 tabs open · Close one to add");
        List<TabSession.Tab> visible=new ArrayList<>();for(TabSession.Tab t:filter==2?session.closed:session.tabs)if(filter!=1||t.pinned)visible.add(t);
        grid.removeAllViews();int n=Math.max(1,columns);LinearLayout line=null;
        for(int i=0;i<visible.size();i++){
            if(i%n==0){line=row();line.setGravity(Gravity.TOP);grid.addView(line);}
            FrameLayout card=card(visible.get(i),filter==2);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(246),1);p.setMargins(dp(6),dp(6),dp(6),dp(6));line.addView(card,p);
        }
        if(line!=null)for(int i=visible.size()%n;i>0&&i<n;i++){View spacer=new View(getContext());LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(246),1);p.setMargins(dp(6),dp(6),dp(6),dp(6));line.addView(spacer,p);}
        if(visible.isEmpty()){
            LinearLayout empty=column();empty.setPadding(dp(24),dp(48),dp(24),dp(32));empty.setGravity(Gravity.CENTER);
            TextView icon=text(filter==1?"◇":"↶",46,ACCENT);empty.addView(icon);
            TextView title=text(filter==1?"Keep your favorites close":"A fresh start",20,INK);title.setGravity(Gravity.CENTER);empty.addView(title);
            TextView detail=text(filter==1?"Pin a tab from its card menu. It will appear here.":"Closed tabs will appear here. You can restore the last 10.",13,MUTED);detail.setGravity(Gravity.CENTER);detail.setPadding(0,dp(12),0,0);empty.addView(detail);grid.addView(empty);
        }
        if(undoId!=null){boolean exists=false;for(TabSession.Tab t:session.closed)if(t.id.equals(undoId))exists=true;if(!exists){undoId=null;notice.setVisibility(View.GONE);}}
    }
    void offerUndo(String id){
        undoId=id;notice.removeAllViews();TextView label=text("Tab closed",13,INK);notice.addView(label,new LinearLayout.LayoutParams(0,dp(48),1));
        Button undo=button("Undo","Undo close tab",v->{if(undoId!=null&&actions.restore(undoId)){undoId=null;notice.setVisibility(View.GONE);}});undo.setTextColor(ACCENT);notice.addView(undo);notice.setVisibility(View.VISIBLE);
    }
    private FrameLayout card(TabSession.Tab tab,boolean isClosed){
        boolean active=!isClosed&&tab.id.equals(session.activeId);
        FrameLayout outer=new FrameLayout(getContext());outer.setTag(tab.id);outer.setPadding(dp(2),dp(2),dp(2),dp(2));
        GradientDrawable border=shape(active?BrowserPalette.RAISED:BrowserPalette.SURFACE,20);border.setStroke(dp(active?2:1),active?ACCENT:BrowserPalette.LINE);outer.setBackground(border);outer.setClipToOutline(true);
        LinearLayout body=column();outer.addView(body,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=row();header.setPadding(dp(10),0,0,0);
        TextView initial=text(initial(tab),14,ACCENT);initial.setGravity(Gravity.CENTER);initial.setTypeface(null,Typeface.BOLD);initial.setBackground(shape(BrowserPalette.RAISED,8));initial.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);header.addView(initial,new LinearLayout.LayoutParams(dp(26),dp(28)));
        TextView title=text(tab.label(),12,INK);title.setTypeface(null,Typeface.BOLD);title.setMaxLines(2);title.setEllipsize(TextUtils.TruncateAt.END);title.setPadding(dp(7),0,0,0);header.addView(title,new LinearLayout.LayoutParams(0,dp(52),1));title.setGravity(Gravity.CENTER_VERTICAL);
        if(!isClosed)header.addView(button("×","Close "+tab.label(),v->{actions.close(tab.id);offerUndo(tab.id);refresh();}),new LinearLayout.LayoutParams(dp(48),dp(52)));
        body.addView(header);
        FrameLayout preview=new FrameLayout(getContext());preview.setBackgroundColor(BrowserPalette.RAISED);
        Bitmap bitmap=isClosed?null:previews.get(tab.id);
        if(bitmap!=null){ImageView image=new ImageView(getContext());image.setImageBitmap(bitmap);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);preview.addView(image,new FrameLayout.LayoutParams(-1,-1));}
        else {LinearLayout placeholder=column();placeholder.setGravity(Gravity.CENTER);TextView mark=text(initial(tab),36,BrowserPalette.MUTED);mark.setGravity(Gravity.CENTER);placeholder.addView(mark);TextView message=text(isClosed?"Tap to restore":"Preview after viewing",10,MUTED);placeholder.addView(message);preview.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));}
        TextView badge=text(isClosed?"RESTORE":active?"●  CURRENT":tab.pinned?"◆  PINNED":bitmap!=null?"LAST VIEWED":"WEBSITE",9,active?ACCENT:MUTED);badge.setTypeface(null,Typeface.BOLD);badge.setPadding(dp(8),dp(5),dp(8),dp(5));badge.setBackground(shape(0xf20c0c0c,8));FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.START);bp.setMargins(dp(8),0,dp(8),dp(8));preview.addView(badge,bp);
        Button pick=button("",(isClosed?"Restore ":"Go to ")+tab.label(),v->{if(isClosed){if(actions.restore(tab.id))dismiss();}else actions.select(tab.id);});
        if(!isClosed)pick.setOnLongClickListener(v->{actions.options(tab.id);return true;});preview.addView(pick,new FrameLayout.LayoutParams(-1,-1));body.addView(preview,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout bottom=row();bottom.setPadding(dp(10),0,0,0);TextView host=text(UrlPolicy.label(tab.url),10,MUTED);host.setSingleLine(true);host.setEllipsize(TextUtils.TruncateAt.MIDDLE);bottom.addView(host,new LinearLayout.LayoutParams(0,dp(48),1));host.setGravity(Gravity.CENTER_VERTICAL);
        if(!isClosed)bottom.addView(button("⋮","Options for "+tab.label(),v->actions.options(tab.id)),new LinearLayout.LayoutParams(dp(48),dp(48)));
        body.addView(bottom);return outer;
    }
    private String initial(TabSession.Tab tab){String host=UrlPolicy.label(tab.url);if(host==null||host.isEmpty())return "↗";if(host.startsWith("www."))host=host.substring(4);return host.substring(0,1).toUpperCase(java.util.Locale.ROOT);}
}
