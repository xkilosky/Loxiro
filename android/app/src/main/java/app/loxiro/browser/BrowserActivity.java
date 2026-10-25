package app.loxiro.browser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/** All browser chrome is Android UI outside every third-party WebView. */
public final class BrowserActivity extends Activity {
    private static final int INK=0xff242731, MUTED=0xff647084, ACCENT=0xff5368e8, BG=0xfff8f9fb;
    private static final int MAX_LIVE_VIEWS=3;
    private final LinkedHashMap<String, Page> pages=new LinkedHashMap<>();
    private TabSession session;
    private SessionStore store;
    private SettingsStore settingsStore;
    private BrowserSettings preferences;
    private BrowserSettingsDialog settingsDialog;
    private String home=UrlPolicy.HOME;
    private FrameLayout content;
    private EditText address;
    private TextView errorBanner;
    private Button tabCount, back;
    private ProgressBar progress;
    private TabOverviewDialog overview;
    // At most 12 small, in-memory previews; never written to storage or exposed to JavaScript.
    private final LinkedHashMap<String,Bitmap> previews=new LinkedHashMap<>();
    private boolean destroying, clearInProgress;

    private static final class Page {
        final String id;
        WebView view;
        boolean loading, crashed;
        int progress;
        String error="";
        Page(String id) { this.id=id; }
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        // Only debug instrumentation can override Home; production has no remote configuration bridge.
        String override=getIntent().getStringExtra("test_home");
        if(BuildConfig.DEBUG && UrlPolicy.isWebUrl(override)) {
            Uri u=Uri.parse(override);
            if("127.0.0.1".equals(u.getHost()) || "localhost".equals(u.getHost()))home=override;
        }
        settingsStore=new SettingsStore(this);preferences=settingsStore.load();
        store=new SessionStore(this);session=store.restore(home);buildChrome();applyPreferences();
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        select(session.activeId);
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private LinearLayout row() { LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v; }
    private Button button(String text,String label,View.OnClickListener action) {
        Button b=new Button(this);b.setText(text);b.setTextColor(INK);b.setTextSize(14);b.setAllCaps(false);
        b.setContentDescription(label);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(48));b.setMinimumHeight(dp(48));
        b.setPadding(dp(9),0,dp(9),0);b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x225368e8),surface(Color.TRANSPARENT,14),null));b.setOnClickListener(action);return b;
    }
    private GradientDrawable surface(int color,int radius) {
        GradientDrawable shape=new GradientDrawable();shape.setColor(color);shape.setCornerRadius(dp(radius));return shape;
    }
    private void buildChrome() {
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);root.setFocusableInTouchMode(true);root.requestFocus();
        if(Build.VERSION.SDK_INT>=30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v,insets)->{
                Insets i=insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left,i.top,i.right,i.bottom);return insets;
            });
        } else {
            root.setFitsSystemWindows(true);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
        // One 56dp row regardless of tab count. The tab list is an on-demand dialog,
        // never a second persistent toolbar or an overlay on website content.
        LinearLayout navigation=row();navigation.setId(R.id.browser_toolbar);navigation.setPadding(dp(4),dp(4),dp(4),dp(4));
        back=button("‹","Back",v->handlePageBack());back.setTextSize(26);
        navigation.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));
        address=new EditText(this);address.setId(R.id.address);address.setSingleLine(true);address.setSelectAllOnFocus(true);
        address.setTextSize(13);address.setHint("Search or enter website");address.setContentDescription("Address or search");
        address.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4096)});
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setOnEditorActionListener((v,action,event)->{
            if(action==EditorInfo.IME_ACTION_GO || (event!=null&&event.getKeyCode()==android.view.KeyEvent.KEYCODE_ENTER&&event.getAction()==android.view.KeyEvent.ACTION_UP)) {
                navigateInput();return true;
            }return false;
        });
        address.setBackground(surface(0xffedf0f6,16));address.setPadding(dp(12),0,dp(8),0);
        navigation.addView(address,new LinearLayout.LayoutParams(0,dp(48),1));
        tabCount=button("1","Manage website tabs",v->showOverview());tabCount.setId(R.id.tab_count);
        tabCount.setTypeface(null,Typeface.BOLD);tabCount.setTextColor(ACCENT);
        GradientDrawable counter=surface(0xffeef0ff,7);counter.setStroke(dp(1),ACCENT);
        tabCount.setBackground(new RippleDrawable(ColorStateList.valueOf(0x225368e8),new InsetDrawable(counter,dp(10)),null));
        navigation.addView(tabCount,new LinearLayout.LayoutParams(dp(48),dp(48)));
        navigation.addView(button("⋮","Browser options",v->showOptions()),new LinearLayout.LayoutParams(dp(48),dp(48)));
        root.addView(navigation,new LinearLayout.LayoutParams(-1,dp(56)));
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(2)));
        errorBanner=new TextView(this);errorBanner.setTextSize(12);errorBanner.setTextColor(0xff9a342f);errorBanner.setPadding(dp(12),dp(8),dp(12),dp(8));errorBanner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);root.addView(errorBanner);
        content=new FrameLayout(this);content.setId(R.id.web_content);root.addView(content,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
    }
    private void navigateInput() {
        String url=UrlPolicy.resolve(address.getText().toString());
        if(url==null){toast("Enter an HTTP/HTTPS website or search words. Unsafe URL schemes are blocked.");return;}
        navigate(url);
    }
    private void navigate(String url) {
        if(clearInProgress || !UrlPolicy.isWebUrl(url))return;
        TabSession.Tab tab=session.active();if(tab==null)return;
        address.clearFocus();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        Page p=activePage();if(p==null || p.crashed){destroyPage(tab.id);p=createPage(tab);attach(p);}
        previews.remove(tab.id);tab.url=url;tab.title="";p.error="";p.view.loadUrl(url);store.save(session);renderChrome();
    }
    private TabSession.Tab addTab(String url,boolean load) {
        if(clearInProgress)return null;
        capturePreview();
        Page old=activePage();
        TabSession.Tab tab=session.add(url);
        if(tab==null){toast("Maximum "+TabSession.MAX_TABS+" website tabs. Close one first.");return null;}
        if(old!=null&&!old.crashed)old.view.onPause();
        Page page=createPage(tab);attach(page);if(load)page.view.loadUrl(url);
        trimPages();store.save(session);renderChrome();return tab;
    }
    private void select(String id) {
        if(clearInProgress)return;
        if(!id.equals(session.activeId))capturePreview();
        for(Page background:pages.values())if(!background.id.equals(id)&&!background.crashed)background.view.onPause();
        if(!session.select(id))return;
        Page page=pages.remove(id);
        if(page!=null)pages.put(id,page);
        if(page==null){page=createPage(session.active());page.view.loadUrl(session.active().url);}
        attach(page);page.view.onResume();address.clearFocus();trimPages();store.save(session);renderChrome();
    }
    private void attach(Page page) {
        content.removeAllViews();
        if(page.crashed){TextView note=new TextView(this);note.setText("This page stopped. Use Reload to reopen it.");note.setPadding(dp(20),dp(20),dp(20),dp(20));content.addView(note);return;}
        if(page.view.getParent() instanceof ViewGroup)((ViewGroup)page.view.getParent()).removeView(page.view);
        content.addView(page.view,new FrameLayout.LayoutParams(-1,-1));
    }
    @SuppressLint("SetJavaScriptEnabled") // Required by websites; there is deliberately NO addJavascriptInterface.
    private Page createPage(TabSession.Tab tab) {
        Page page=new Page(tab.id);WebView view=new WebView(this);page.view=view;pages.put(tab.id,page);
        WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);settings.setGeolocationEnabled(false);settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);
        configureReading(settings);
        settings.setSupportMultipleWindows(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString()+" LoxiroAndroid/0.7");
        CookieManager.getInstance().setAcceptThirdPartyCookies(view,false);
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView web,WebResourceRequest request) {
                if(!request.isForMainFrame())return false;
                if(!UrlPolicy.isWebUrl(request.getUrl().toString())){toast("Only HTTP and HTTPS pages are supported in this preview.");return true;}return false;
            }
            @Override public void onPageStarted(WebView web,String url,android.graphics.Bitmap favicon) {
                if(!alive(page))return;
                TabSession.Tab t=session.find(page.id);if(UrlPolicy.isWebUrl(url)||"about:blank".equals(url)){t.url=url;t.title="";}
                previews.remove(page.id);page.loading=true;page.error="";page.progress=0;changed(page);
            }
            @Override public void doUpdateVisitedHistory(WebView web,String url,boolean reload) {
                if(!alive(page))return;
                if(UrlPolicy.isWebUrl(url)||"about:blank".equals(url))session.find(page.id).url=url;changed(page);
            }
            @Override public void onPageFinished(WebView web,String url) {
                if(!alive(page))return;page.loading=false;page.progress=100;changed(page);
            }
            @Override public void onReceivedError(WebView web,WebResourceRequest request,WebResourceError error) {
                if(alive(page)&&request.isForMainFrame()){page.error="Could not load this page. Check your connection or use Reload.";page.loading=false;changed(page);}
            }
            @Override public void onReceivedHttpError(WebView web,WebResourceRequest request,WebResourceResponse error) {
                if(alive(page)&&request.isForMainFrame()){page.error="Website returned HTTP "+error.getStatusCode()+".";changed(page);}
            }
            @Override public void onReceivedSslError(WebView web,SslErrorHandler handler,SslError error) {
                handler.cancel();if(alive(page)){page.error="Secure connection failed. Certificate errors are never bypassed.";page.loading=false;changed(page);}
            }
            @Override public boolean onRenderProcessGone(WebView web,RenderProcessGoneDetail detail) {
                if(!alive(page))return true;
                previews.remove(page.id);page.crashed=true;page.loading=false;page.error="Page process stopped. Reload to restore this URL.";
                if(web.getParent() instanceof ViewGroup)((ViewGroup)web.getParent()).removeView(web);web.destroy();
                if(page.id.equals(session.activeId)){attach(page);renderChrome();}return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public void onReceivedTitle(WebView web,String title) {
                if(!alive(page)||title==null)return;
                String clean=title.replaceAll("[\\p{Cntrl}\\p{Cf}]","");session.find(page.id).title=clean.substring(0,Math.min(180,clean.length()));changed(page);
            }
            @Override public void onProgressChanged(WebView web,int value) {if(alive(page)){page.progress=value;if(page.id.equals(session.activeId))renderChrome();}}
            @Override public boolean onCreateWindow(WebView web,boolean dialog,boolean userGesture,Message result) {
                // A website cannot spawn native tabs in the background or without user activation.
                if(!alive(page)||!page.id.equals(session.activeId)||!userGesture||!(result.obj instanceof WebView.WebViewTransport))return false;
                TabSession.Tab child=addTab(home,false);if(child==null)return false;
                // Never label a script-written popup as the trusted Home origin while its URL is unknown.
                child.url="about:blank";child.title="New page";store.save(session);renderChrome();
                ((WebView.WebViewTransport)result.obj).setWebView(pages.get(child.id).view);result.sendToTarget();return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
            @Override public void onShowCustomView(View view,CustomViewCallback callback){callback.onCustomViewHidden();toast("Fullscreen is unavailable in this preview; browser controls stay visible.");}
        });
        view.setDownloadListener((url,agent,disposition,mime,length)->confirmDownload(url,disposition,mime));
        return page;
    }
    private boolean alive(Page page) { return !destroying && !page.crashed && pages.get(page.id)==page && session.find(page.id)!=null; }
    private Page activePage() { return session==null?null:pages.get(session.activeId); }
    private void changed(Page page) {store.save(session);if(page.id.equals(session.activeId))renderChrome();refreshOverview();}
    private void renderChrome() {
        if(destroying||clearInProgress||session.active()==null)return;
        TabSession.Tab active=session.active();Page page=activePage();
        if(!address.hasFocus())address.setText(active.url);
        address.setTextColor(active.url.regionMatches(true,0,"http:",0,5)?0xff9a342f:INK);
        address.setContentDescription("Address or search"+(active.url.regionMatches(true,0,"http:",0,5)?" — not secure":""));
        tabCount.setText(String.valueOf(session.tabs.size()));tabCount.setContentDescription("Manage website tabs ("+session.tabs.size()+")");
        back.setEnabled(page!=null&&!page.crashed&&page.view.canGoBack());
        progress.setProgress(page==null?0:page.progress);progress.setVisibility(page!=null&&page.loading?View.VISIBLE:View.INVISIBLE);
        String error=page==null?"":page.error;errorBanner.setText(error);errorBanner.setVisibility(error.isEmpty()?View.GONE:View.VISIBLE);
    }
    private void closeTab(String id) {
        if(clearInProgress)return;
        previews.remove(id);destroyPage(id);session.close(id,home);select(session.activeId);refreshOverview();
    }
    private void reloadActive() {
        TabSession.Tab tab=session.active();if(tab==null)return;
        Page page=activePage();if(page==null||page.crashed){destroyPage(tab.id);page=createPage(tab);attach(page);page.view.loadUrl(tab.url);}else{page.error="";page.view.reload();}
    }
    private void handlePageBack(){Page page=activePage();if(page!=null&&!page.crashed&&page.view.canGoBack())page.view.goBack();}
    private void handleBack(){Page page=activePage();if(page!=null&&!page.crashed&&page.view.canGoBack())page.view.goBack();else if(session.tabs.size()>1)closeTab(session.activeId);else finish();}
    @SuppressWarnings("deprecation") @Override public void onBackPressed(){handleBack();}
    private void destroyPage(String id) {
        Page page=pages.remove(id);if(page==null||page.crashed)return;
        if(page.view.getParent() instanceof ViewGroup)((ViewGroup)page.view.getParent()).removeView(page.view);
        page.view.stopLoading();page.view.setWebChromeClient(null);page.view.setWebViewClient(new WebViewClient());page.view.destroy();
    }
    private void trimPages() {
        for(String id:new ArrayList<>(pages.keySet()))if(pages.size()>MAX_LIVE_VIEWS&&!id.equals(session.activeId))destroyPage(id);
    }
    private void toast(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private void capturePreview() {
        Page page=activePage();
        if(!preferences.tabPreviews||page==null||page.crashed||page.loading||page.view.getWidth()==0||page.view.getHeight()==0)return;
        // Snapshot only the currently visible viewport, never a full page or a background WebView.
        try {
            int width=224,height=Math.min(300,Math.max(1,Math.round(page.view.getHeight()*224f/page.view.getWidth())));
            Bitmap image=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(image);canvas.drawColor(Color.WHITE);float scale=224f/page.view.getWidth();canvas.scale(scale,scale);
            page.view.draw(canvas);previews.put(page.id,image);
        } catch(RuntimeException|OutOfMemoryError ignored) { previews.remove(page.id); }
    }
    private void showOverview() {
        if(clearInProgress||overview!=null)return;
        address.clearFocus();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        capturePreview();
        overview=new TabOverviewDialog(this,session,previews,new TabOverviewDialog.Actions(){
            public void select(String id){dismissOverview();BrowserActivity.this.select(id);}
            public void create(){dismissOverview();addTab(home,true);}
            public void close(String id){closeTab(id);}
            public boolean restore(String id){return restoreClosedTab(id);}
            public void options(String id){showTabOptions(id);}
        });
        overview.setOnDismissListener(d->{overview=null;});overview.show();setKeepAwake(overview.getWindow());
    }
    private void dismissOverview(){if(overview!=null)overview.dismiss();}
    private void refreshOverview(){if(overview!=null)overview.refresh();}
    private boolean restoreClosedTab(String id){
        TabSession.Tab restored=session.reopen(id);
        if(restored==null){toast("Close a tab first; maximum 12 website tabs.");return false;}
        select(restored.id);store.save(session);refreshOverview();return true;
    }
    private void showTabOptions(String id) {
        TabSession.Tab tab=session.find(id);if(tab==null)return;
        new AlertDialog.Builder(this).setTitle(tab.label()).setItems(new String[]{tab.pinned?"Unpin":"Pin","Duplicate","Move left","Move right","Close tab"},(d,which)->{
            if(which==0){session.pin(id);renderChrome();store.save(session);}
            if(which==1){TabSession.Tab copy=session.duplicate(id);if(copy==null)toast("Close a tab first; maximum 12.");else {dismissOverview();select(copy.id);}}
            if(which==2||which==3){session.move(id,which==2?-1:1);renderChrome();store.save(session);}
            if(which==4){closeTab(id);if(overview!=null)overview.offerUndo(id);}
            refreshOverview();
        }).show();
    }
    private void showOptions() {
        new AlertDialog.Builder(this).setTitle("Loxiro Android Preview").setItems(new String[]{"Browser settings","Website tabs","Reopen last closed tab","Open page in external browser","Android downloads","Close unpinned tabs","Clear browser data","About this preview","Home","Forward","Reload / stop","New tab"},(d,choice)->{
            if(choice==0){showSettings();return;}
            int which=choice-1;
            if(which==7)navigate(home);
            if(which==8){Page p=activePage();if(p!=null&&!p.crashed&&p.view.canGoForward())p.view.goForward();}
            if(which==9){Page p=activePage();if(p!=null&&!p.crashed&&p.loading)p.view.stopLoading();else reloadActive();}
            if(which==10)addTab(home,true);
            if(which==0)showOverview();
            if(which==1){TabSession.Tab t=session.reopen();if(t!=null)select(t.id);else toast("No closed tab, or maximum tabs reached.");}
            if(which==2){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(session.active().url)));}catch(Exception e){toast("No external browser is available.");}}
            if(which==3){try{startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS));}catch(Exception e){toast("Android downloads app is unavailable.");}}
            if(which==4)new AlertDialog.Builder(this).setMessage("Close all unpinned website tabs? Pinned tabs stay. Only the last 10 closed tabs can reopen.").setNegativeButton("Cancel",null).setPositiveButton("Close tabs",(dialog,w)->{
                for(TabSession.Tab tab:new ArrayList<>(session.tabs))if(!tab.pinned){previews.remove(tab.id);destroyPage(tab.id);session.close(tab.id,home);}select(session.activeId);
            }).show();
            if(which==5)confirmClearData();
            if(which==6)new AlertDialog.Builder(this).setTitle("Real website tabs, native controls").setMessage("Android WebView preview, Android 10+. Website tabs stay under Loxiro's toolbar. Some sign-ins, uploads, camera/mic, fullscreen and blob/data downloads are not supported. Direct HTTP(S) file downloads use Android Download Manager after confirmation, not the web app's parallel downloader. Use your external browser for unsupported workflows. This is not a hardened Chrome replacement.").setPositiveButton("OK",null).show();
        }).show();
    }
    private void configureReading(WebSettings settings){
        settings.setTextZoom(preferences.textZoom);
        settings.setSupportZoom(preferences.pinchZoom);settings.setBuiltInZoomControls(preferences.pinchZoom);settings.setDisplayZoomControls(false);
    }
    private void setKeepAwake(android.view.Window window){
        if(preferences.keepScreenOn)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void applyPreferences(){
        settingsStore.save(preferences);setKeepAwake(getWindow());
        for(Page page:pages.values())if(!page.crashed)configureReading(page.view.getSettings());
        if(!preferences.tabPreviews)previews.clear();refreshOverview();
        LinearLayout toolbar=findViewById(R.id.browser_toolbar);
        toolbar.getLayoutParams().height=dp(preferences.largeControls?72:56);
        for(int i=0;i<toolbar.getChildCount();i++){View child=toolbar.getChildAt(i);child.getLayoutParams().height=dp(preferences.largeControls?64:48);}
        address.setTextSize(preferences.largeControls?17:13);tabCount.setTextSize(preferences.largeControls?16:14);toolbar.requestLayout();
        if(settingsDialog!=null)setKeepAwake(settingsDialog.getWindow());
        if(overview!=null)setKeepAwake(overview.getWindow());
    }
    private void showSettings(){
        if(clearInProgress||settingsDialog!=null)return;
        address.clearFocus();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        settingsDialog=new BrowserSettingsDialog(this,preferences,new BrowserSettingsDialog.Actions(){
            public void changed(){applyPreferences();}
            public void accessibility(){openSystemSettings(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);}
            public void display(){openSystemSettings(android.provider.Settings.ACTION_DISPLAY_SETTINGS);}
            public void downloads(){try{startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS));}catch(Exception e){toast("Android downloads is unavailable.");}}
            public void clearData(){confirmClearData();}
        });
        settingsDialog.setOnDismissListener(d->{settingsDialog=null;});settingsDialog.show();setKeepAwake(settingsDialog.getWindow());
    }
    private void openSystemSettings(String action){try{startActivity(new Intent(action));}catch(Exception e){toast("This Android settings screen is unavailable on your device.");}}
    private void confirmClearData(){
        new AlertDialog.Builder(this).setTitle("Clear browser data?").setMessage("Close native tabs and remove cookies, website storage and cached pages? Android-downloaded files and browser settings remain.").setNegativeButton("Cancel",null).setPositiveButton("Clear",(d,w)->clearBrowserData()).show();
    }
    private void clearBrowserData() {
        clearInProgress=true;dismissOverview();previews.clear();content.removeAllViews();
        for(Page p:pages.values())if(!p.crashed)p.view.clearCache(true);
        for(String id:new ArrayList<>(pages.keySet()))destroyPage(id);
        WebStorage.getInstance().deleteAllData();store.clear();
        CookieManager.getInstance().removeAllCookies(done->{CookieManager.getInstance().flush();if(destroying)return;session=new TabSession();session.add(home);clearInProgress=false;select(session.activeId);});
    }
    private void confirmDownload(String url,String disposition,String mime) {
        if(!UrlPolicy.isWebUrl(url)){toast("Blob/data downloads are unsupported in this Android preview. Use the original source in your external browser.");return;}
        String guessed=URLUtil.guessFileName(url,disposition,mime).replaceAll("[/\\\\<>:\"|?*\\p{Cntrl}]","_");
        final String filename=guessed.substring(0,Math.min(guessed.length(),180));
        new AlertDialog.Builder(this).setTitle("Download file?").setMessage(filename+"\nFrom: "+UrlPolicy.label(url)+"\n\nUses Android Download Manager. Session cookies are not forwarded; authenticated downloads may require your external browser.").setNegativeButton("Cancel",null).setPositiveButton("Download",(d,w)->{
            try {
                DownloadManager.Request request=new DownloadManager.Request(Uri.parse(url));request.setTitle(filename);request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,filename);
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);toast("Added to Android downloads.");
            }catch(Exception e){toast("Android could not start this download. Open the source externally.");}
        }).show();
    }
    @Override protected void onPause(){super.onPause();Page p=activePage();if(p!=null&&!p.crashed)p.view.onPause();if(store!=null&&!clearInProgress)store.save(session);}
    @Override protected void onResume(){super.onResume();Page p=activePage();if(p!=null&&!p.crashed)p.view.onResume();}
    @Override protected void onSaveInstanceState(Bundle state){if(!clearInProgress)store.save(session);super.onSaveInstanceState(state);}
    @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(level>=TRIM_MEMORY_RUNNING_LOW){previews.clear();for(String id:new ArrayList<>(pages.keySet()))if(!id.equals(session.activeId))destroyPage(id);refreshOverview();}}
    @Override protected void onDestroy(){destroying=true;dismissOverview();if(settingsDialog!=null)settingsDialog.dismiss();previews.clear();if(store!=null&&!clearInProgress)store.save(session);for(String id:new ArrayList<>(pages.keySet()))destroyPage(id);super.onDestroy();}
    // Package-private instrumentation observations; not exposed to website JavaScript.
    int previewCount(){return previews.size();}
    BrowserSettings nativeSettings(){return preferences;}
    int nativeTabCount(){return session.tabs.size();}
    String activeUrl(){return session.active().url;}
    String activeTitle(){return session.active().title;}
}
