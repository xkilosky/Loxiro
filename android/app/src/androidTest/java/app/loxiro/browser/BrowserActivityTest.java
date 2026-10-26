package app.loxiro.browser;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.widget.LinearLayout;
import java.io.File;
import java.io.FileOutputStream;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.espresso.action.GeneralClickAction;
import androidx.test.espresso.action.Press;
import androidx.test.espresso.action.Tap;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.*;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static org.junit.Assert.*;

/** Real WebViews and trusted touch events, with local HTTP fixtures rather than live websites. */
@RunWith(AndroidJUnit4.class)
public class BrowserActivityTest {
    private ServerSocket server;
    private ExecutorService worker;
    private ActivityScenario<BrowserActivity> scenario;
    private String origin;
    @Before public void setup() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences("native-tabs-v1",Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("native-settings-v1",Context.MODE_PRIVATE).edit().clear().commit();
        server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));origin="http://127.0.0.1:"+server.getLocalPort();worker=Executors.newCachedThreadPool();
        worker.submit(()->{while(!server.isClosed())try{Socket socket=server.accept();worker.submit(()->serve(socket));}catch(Exception ignored){return;}});
        Intent intent=new Intent(context,BrowserActivity.class);intent.putExtra("test_home",origin+"/one");scenario=ActivityScenario.launch(intent);
        awaitTitle("First fixture");
    }
    @Test public void oledChromeUsesBlackSurfacesAndWhiteText() throws Exception {
        scenario.onActivity(activity->{
            android.widget.EditText address=activity.findViewById(R.id.address);
            // The HTTP fixture deliberately retains its readable insecure-connection warning.
            assertEquals(BrowserPalette.ERROR,address.getCurrentTextColor());
            assertEquals(android.graphics.Color.WHITE,((android.widget.Button)activity.findViewById(R.id.tab_count)).getCurrentTextColor());
            assertEquals(BrowserPalette.MUTED,address.getCurrentHintTextColor());
            View root=(View)activity.findViewById(R.id.browser_toolbar).getParent();
            assertEquals(android.graphics.Color.BLACK,((android.graphics.drawable.ColorDrawable)root.getBackground()).getColor());
            android.content.res.TypedArray attrs=activity.obtainStyledAttributes(new int[]{android.R.attr.windowLightStatusBar,android.R.attr.windowLightNavigationBar});
            assertFalse(attrs.getBoolean(0,true));assertFalse(attrs.getBoolean(1,true));attrs.recycle();
        });
        onView(withId(R.id.tab_count)).perform(click());
        onView(withId(R.id.new_tab)).check((view,error)->{
            if(error!=null)throw error;
            assertEquals(android.graphics.Color.BLACK,((android.widget.Button)view).getCurrentTextColor());
        });
        saveScreenshot("oled-tab-overview.png");
        onView(withContentDescription("Return to website")).perform(click());
        openBrowserSettings();saveScreenshot("oled-browser-settings.png");
        onView(withContentDescription("Close browser settings")).perform(click());
        saveScreenshot("oled-browser-toolbar.png");
    }
    private void serve(Socket socket) {
        try(Socket s=socket){
            BufferedReader reader=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.UTF_8));String request=reader.readLine();
            if(request==null)return;String line;while((line=reader.readLine())!=null&&!line.isEmpty()){}
            boolean second=request.contains(" /two "),failure=request.contains(" /error ");
            String html="<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+(failure?"Page error":second?"Second fixture":"First fixture")+"</title><style>body{margin:8px}a{display:block;height:120px;background:#eef0ff}</style><a href='/two' target='_blank'>Open another website</a><p>Real website content cannot remove Android browser chrome.</p>";
            byte[] body=html.getBytes(StandardCharsets.UTF_8);OutputStream out=s.getOutputStream();out.write(("HTTP/1.1 "+(failure?"503 Service Unavailable":"200 OK")+"\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
        }catch(Exception ignored){}
    }
    private void awaitTitle(String title) {
        long end=SystemClock.uptimeMillis()+15000;AtomicBoolean done=new AtomicBoolean();
        while(SystemClock.uptimeMillis()<end){scenario.onActivity(a->done.set(title.equals(a.activeTitle())&&a.activePageReady()));if(done.get()){
            AtomicBoolean rendered=new AtomicBoolean();scenario.onActivity(a->a.afterVisibleFrame(()->rendered.set(true)));
            long frameEnd=SystemClock.uptimeMillis()+15000;while(!rendered.get()&&SystemClock.uptimeMillis()<frameEnd)SystemClock.sleep(25);
            assertTrue("WebView did not commit a visible frame",rendered.get());return;
        }SystemClock.sleep(75);}
        fail("WebView did not load title: "+title);
    }
    @Test public void websitePopupKeepsNativeTabsVisibleAndSwitchable() {
        // Native touch, not JavaScript element.click(): exercises the user-gesture popup gate.
        onView(isAssignableFrom(WebView.class)).perform(new GeneralClickAction(Tap.SINGLE,view->{
            int[] p=new int[2];view.getLocationOnScreen(p);float density=view.getResources().getDisplayMetrics().density;
            return new float[]{p[0]+80*density,p[1]+60*density};
        },Press.FINGER));
        awaitTitle("Second fixture");scenario.onActivity(a->{assertEquals(2,a.nativeTabCount());assertEquals(origin+"/two",a.activeUrl());});
        onView(withId(R.id.tab_count)).check(matches(isDisplayed()));onView(withId(R.id.address)).check(matches(isDisplayed()));
        onView(withId(R.id.tab_count)).perform(click());
        onView(withContentDescription("Go to First fixture")).perform(scrollTo(),click());awaitTitle("First fixture");
        scenario.onActivity(a->assertEquals(origin+"/one",a.activeUrl()));
        onView(withId(R.id.tab_count)).perform(click());
        onView(withContentDescription("Go to Second fixture")).perform(scrollTo(),click());awaitTitle("Second fixture");
        scenario.recreate();awaitTitle("Second fixture");scenario.onActivity(a->{assertEquals(2,a.nativeTabCount());assertEquals(origin+"/two",a.activeUrl());});
        onView(withId(R.id.tab_count)).check(matches(isDisplayed()));assertCompactChrome();
    }
    @Test public void enteringAWebsiteKeepsChromeAndUnsafeInputCannotEscape() {
        onView(withId(R.id.address)).perform(replaceText(origin+"/two"),pressImeActionButton());awaitTitle("Second fixture");
        onView(withId(R.id.tab_count)).check(matches(isDisplayed()));assertCompactChrome();
        onView(withId(R.id.address)).perform(replaceText("javascript:alert(1)"),pressImeActionButton());scenario.onActivity(a->assertEquals(origin+"/two",a.activeUrl()));
        onView(withId(R.id.tab_count)).perform(click());
        onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
        onView(withId(R.id.tab_count)).perform(click());
        onView(withContentDescription("Close First fixture")).perform(scrollTo(),click());awaitTitle("Second fixture");scenario.onActivity(a->assertEquals(1,a.nativeTabCount()));
    }
    private void assertCompactChrome() {
        scenario.onActivity(a->{
            View toolbar=a.findViewById(R.id.browser_toolbar),content=a.findViewById(R.id.web_content);
            float density=a.getResources().getDisplayMetrics().density;
            assertEquals("Only one 56dp toolbar",56*density,toolbar.getHeight(),1.0);
            assertEquals("Website begins immediately below toolbar and 2dp progress",toolbar.getBottom()+Math.round(2*density),content.getTop());
            View parent=(View)content.getParent();
            int available=parent.getHeight()-parent.getPaddingTop()-parent.getPaddingBottom();
            assertTrue("Websites must receive most of the available screen",content.getHeight()>available*0.65f);
        });
    }
    @Test public void twelveTabsDoNotConsumeMoreWebsiteSpace() {
        assertCompactChrome();
        for(int i=1;i<12;i++){
            onView(withId(R.id.tab_count)).perform(click());
            onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");
        }
        scenario.onActivity(a->assertEquals(12,a.nativeTabCount()));assertCompactChrome();
        scenario.recreate();awaitTitle("First fixture");assertCompactChrome();
    }
    @Test public void visualCardsSupportPinUndoAndSpecificClosedRestore() throws Exception {
        onView(withId(R.id.address)).perform(replaceText(origin+"/two"),pressImeActionButton());awaitTitle("Second fixture");
        onView(withId(R.id.tab_count)).perform(click());onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");
        onView(withId(R.id.tab_count)).perform(click());
        onView(withId(R.id.tab_overview)).check(matches(isDisplayed()));
        onView(withId(R.id.tab_card_grid)).check((view,error)->{
            if(error!=null)throw error;
            LinearLayout grid=(LinearLayout)view;assertEquals(1,grid.getChildCount());
            LinearLayout row=(LinearLayout)grid.getChildAt(0);assertEquals("Two cards side by side on a phone",2,row.getChildCount());
            assertTrue(row.getChildAt(0).getWidth()>0);assertEquals(row.getChildAt(0).getWidth(),row.getChildAt(1).getWidth());
        });
        // No second search/URL input is introduced inside the visual switcher.
        onView(withContentDescription("Options for Second fixture")).perform(click());onView(withText("Pin")).perform(click());
        onView(withId(R.id.tab_filter_pinned)).perform(click());
        onView(withContentDescription("Go to Second fixture")).check(matches(isDisplayed()));
        onView(withId(R.id.tab_filter_all)).perform(click());saveScreenshot("tabs-phone.png");
        onView(withContentDescription("Close Second fixture")).perform(click());scenario.onActivity(a->assertEquals(1,a.nativeTabCount()));
        onView(withContentDescription("Undo close tab")).perform(click());scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
        onView(withContentDescription("Close First fixture")).perform(click());onView(withId(R.id.tab_filter_closed)).perform(click());
        onView(withContentDescription("Restore First fixture")).perform(click());awaitTitle("First fixture");scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));assertCompactChrome();
        onView(withId(R.id.tab_count)).perform(click());onView(withContentDescription("Return to website")).perform(click());assertCompactChrome();
        scenario.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        awaitOrientation(android.content.res.Configuration.ORIENTATION_LANDSCAPE);awaitTitle("First fixture");
        onView(withId(R.id.tab_count)).perform(click());onView(withId(R.id.tab_overview)).check(matches(isDisplayed()));
        onView(withId(R.id.new_tab)).check(matches(isDisplayed()));saveScreenshot("tabs-landscape.png");
        onView(withContentDescription("Return to website")).perform(click());assertCompactChrome();
        scenario.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
        awaitOrientation(android.content.res.Configuration.ORIENTATION_PORTRAIT);awaitTitle("First fixture");
    }
    private void awaitOrientation(int orientation) {
        long end=SystemClock.uptimeMillis()+15000;AtomicBoolean settled=new AtomicBoolean();
        while(SystemClock.uptimeMillis()<end){
            scenario.onActivity(a->{
                View decor=a.getWindow().getDecorView();
                boolean landscape=decor.getWidth()>decor.getHeight();
                settled.set(a.getResources().getConfiguration().orientation==orientation&&decor.getWidth()>0&&decor.getHeight()>0&&landscape==(orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE)&&a.activePageReady());
            });
            if(settled.get()){InstrumentationRegistry.getInstrumentation().waitForIdleSync();return;}
            SystemClock.sleep(75);
        }
        fail("Activity did not finish requested rotation");
    }
    private void openBrowserSettings(){
        onView(withContentDescription("Browser options")).perform(click());onView(withText("Browser settings")).perform(click());
        onView(withId(R.id.browser_settings)).check(matches(isDisplayed()));
    }
    @Test public void nativeSettingsApplyToExistingAndNewTabsAndSurviveRecreation() throws Exception {
        openBrowserSettings();
        onView(withContentDescription("Increase website text size")).perform(click(),click(),click(),click(),click());
        onView(withId(R.id.website_text_zoom_value)).check(matches(withText("125%")));
        onView(withText("Pinch to zoom")).perform(scrollTo(),click());
        onView(withText("Roomier address bar")).perform(scrollTo(),click());
        onView(withText("Show tab previews")).perform(scrollTo(),click());
        onView(withText("Keep screen awake")).perform(scrollTo(),click());
        scenario.onActivity(a->{
            assertEquals(125,a.nativeSettings().textZoom);assertFalse(a.nativeSettings().pinchZoom);assertFalse(a.nativeSettings().tabPreviews);assertTrue(a.nativeSettings().largeControls);
            assertTrue((a.getWindow().getAttributes().flags&android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)!=0);
            assertEquals(Math.round(72*a.getResources().getDisplayMetrics().density),a.findViewById(R.id.browser_toolbar).getHeight());
        });
        saveScreenshot("browser-settings.png");onView(withContentDescription("Close browser settings")).perform(click());
        onView(isAssignableFrom(WebView.class)).check((v,e)->{if(e!=null)throw e;assertEquals(125,((WebView)v).getSettings().getTextZoom());assertFalse(((WebView)v).getSettings().supportZoom());});
        onView(withId(R.id.tab_count)).perform(click());scenario.onActivity(a->assertEquals(0,a.previewCount()));
        onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");
        onView(isAssignableFrom(WebView.class)).check((v,e)->{if(e!=null)throw e;assertEquals(125,((WebView)v).getSettings().getTextZoom());assertFalse(((WebView)v).getSettings().getBuiltInZoomControls());});
        scenario.recreate();awaitTitle("First fixture");
        scenario.onActivity(a->{assertEquals(125,a.nativeSettings().textZoom);assertFalse(a.nativeSettings().tabPreviews);assertTrue(a.nativeSettings().keepScreenOn);assertTrue(a.nativeSettings().largeControls);});
        openBrowserSettings();onView(withText("Reset browser settings")).perform(scrollTo(),click());onView(withText("Reset")).perform(click());
        scenario.onActivity(a->{assertEquals(100,a.nativeSettings().textZoom);assertTrue(a.nativeSettings().pinchZoom);assertTrue(a.nativeSettings().tabPreviews);assertFalse(a.nativeSettings().largeControls);assertEquals(2,a.nativeTabCount());assertEquals(0,a.getWindow().getAttributes().flags&android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});
        onView(withContentDescription("Close browser settings")).perform(click());assertCompactChrome();
    }
    @Test public void malformedStoredSettingsRecoverToSafeDefaults(){
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences("native-settings-v1",Context.MODE_PRIVATE).edit().putString("textZoom","wrong type").putInt("pinchZoom",1).putInt("tabPreviews",1).putString("keepScreenOn","bad").commit();
        BrowserSettings s=new SettingsStore(context).load();assertEquals(100,s.textZoom);assertTrue(s.pinchZoom);assertTrue(s.tabPreviews);assertFalse(s.keepScreenOn);
        context.getSharedPreferences("native-settings-v1",Context.MODE_PRIVATE).edit().putInt("textZoom",99999).commit();assertEquals(200,new SettingsStore(context).load().textZoom);
    }
    private void enterWebsiteFullscreen(){
        onView(withContentDescription("Browser options")).perform(click());onView(withText("Full screen website")).perform(click());
        long end=SystemClock.uptimeMillis()+5000;AtomicBoolean ready=new AtomicBoolean();
        while(SystemClock.uptimeMillis()<end){scenario.onActivity(a->ready.set(a.isWebsiteFullscreen()&&!a.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.systemBars())));if(ready.get())break;SystemClock.sleep(50);}
        assertTrue("Fullscreen should hide system bars",ready.get());
    }
    private int visibleNativeButtons(View view){
        if(!view.isShown()||view instanceof WebView)return 0;
        if(view instanceof android.widget.Button)return 1;
        int n=0;if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)n+=visibleNativeButtons(group.getChildAt(i));}return n;
    }
    private void assertWebsiteFullscreen(){
        onView(withId(R.id.fullscreen_tabs)).check(matches(isDisplayed()));
        scenario.onActivity(a->{
            assertTrue(a.isWebsiteFullscreen());assertFalse(a.isPageFullscreen());
            assertEquals(View.GONE,a.findViewById(R.id.browser_toolbar).getVisibility());assertEquals(View.GONE,a.findViewById(R.id.find_bar).getVisibility());assertFalse(a.findViewById(R.id.address).isShown());
            View content=a.findViewById(R.id.web_content);View stage=(View)content.getParent().getParent();assertEquals("Only Tabs is visible native browser chrome",1,visibleNativeButtons(stage));
            View tabs=a.findViewById(R.id.fullscreen_tabs);int[] xy=new int[2];tabs.getLocationOnScreen(xy);assertTrue(xy[0]>=0&&xy[1]>=0);assertTrue(tabs.getWidth()>=48*a.getResources().getDisplayMetrics().density);assertTrue(tabs.getHeight()>=48*a.getResources().getDisplayMetrics().density);
        });
    }
    @Test public void websiteFullscreenKeepsOnlyTabsAcrossSwitchingRecreationRotationAndBack() throws Exception {
        scenario.onActivity(a->a.onNewIntent(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(origin+"/two"))));awaitTitle("Second fixture");
        java.util.concurrent.atomic.AtomicInteger height=new java.util.concurrent.atomic.AtomicInteger();scenario.onActivity(a->height.set(a.findViewById(R.id.web_content).getHeight()));
        enterWebsiteFullscreen();assertWebsiteFullscreen();
        scenario.onActivity(a->assertTrue("Website expands into the former toolbar",a.findViewById(R.id.web_content).getHeight()>height.get()+48*a.getResources().getDisplayMetrics().density));saveScreenshot("website-fullscreen.png");
        onView(withId(R.id.fullscreen_tabs)).perform(click());onView(withContentDescription("Go to First fixture")).perform(scrollTo(),click());awaitTitle("First fixture");assertWebsiteFullscreen();
        onView(withId(R.id.fullscreen_tabs)).perform(click());onView(withContentDescription("Go to Second fixture")).perform(scrollTo(),click());awaitTitle("Second fixture");assertWebsiteFullscreen();
        scenario.recreate();awaitTitle("Second fixture");assertWebsiteFullscreen();
        scenario.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));awaitOrientation(android.content.res.Configuration.ORIENTATION_LANDSCAPE);awaitTitle("Second fixture");assertWebsiteFullscreen();saveScreenshot("website-fullscreen-landscape.png");
        scenario.onActivity(a->a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));awaitOrientation(android.content.res.Configuration.ORIENTATION_PORTRAIT);awaitTitle("Second fixture");assertWebsiteFullscreen();
        scenario.onActivity(a->((WebView)((android.widget.FrameLayout)a.findViewById(R.id.web_content)).getChildAt(0)).loadUrl(origin+"/one"));awaitTitle("First fixture");assertWebsiteFullscreen();
        androidx.test.espresso.Espresso.pressBack();onView(withId(R.id.address)).check(matches(isDisplayed()));assertCompactChrome();
        scenario.onActivity(a->{assertFalse(a.isWebsiteFullscreen());assertEquals(origin+"/one",a.activeUrl());assertEquals(2,a.nativeTabCount());assertFalse(a.findViewById(R.id.fullscreen_tabs).isShown());});
        androidx.test.espresso.Espresso.pressBack();awaitTitle("Second fixture");scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
    }
    @Test public void websitePopupKeepsFullscreenTabsAvailable(){
        enterWebsiteFullscreen();
        onView(isAssignableFrom(WebView.class)).perform(new GeneralClickAction(Tap.SINGLE,view->{int[] p=new int[2];view.getLocationOnScreen(p);float d=view.getResources().getDisplayMetrics().density;return new float[]{p[0]+80*d,p[1]+60*d};},Press.FINGER));
        awaitTitle("Second fixture");assertWebsiteFullscreen();scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
    }
    @Test public void failedPageLeavesFullscreenForVisibleRecoveryControls(){
        enterWebsiteFullscreen();scenario.onActivity(a->((WebView)((android.widget.FrameLayout)a.findViewById(R.id.web_content)).getChildAt(0)).loadUrl(origin+"/error"));awaitTitle("Page error");
        onView(withId(R.id.address)).check(matches(isDisplayed()));onView(withText("Website returned HTTP 503.")).check(matches(isDisplayed()));scenario.onActivity(a->assertFalse(a.isWebsiteFullscreen()));
    }
    @Test public void newTabFromFullscreenRestoresTheAddressBar(){
        enterWebsiteFullscreen();onView(withId(R.id.fullscreen_tabs)).perform(click());onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");
        onView(withId(R.id.address)).check(matches(isDisplayed()));scenario.onActivity(a->{assertFalse(a.isWebsiteFullscreen());assertEquals(2,a.nativeTabCount());});assertCompactChrome();
    }
    @Test public void closingLastFullscreenTabRestoresHomeControls(){
        enterWebsiteFullscreen();onView(withId(R.id.fullscreen_tabs)).perform(click());onView(withContentDescription("Close First fixture")).perform(scrollTo(),click());awaitTitle("First fixture");
        onView(withContentDescription("Return to website")).perform(click());onView(withId(R.id.address)).check(matches(isDisplayed()));scenario.onActivity(a->{assertFalse(a.isWebsiteFullscreen());assertEquals(1,a.nativeTabCount());});
    }
    @Test public void fullscreenTabsRespectsRoomierTouchControls(){
        openBrowserSettings();onView(withText("Roomier address bar")).perform(scrollTo(),click());onView(withContentDescription("Close browser settings")).perform(click());
        enterWebsiteFullscreen();assertWebsiteFullscreen();scenario.onActivity(a->assertEquals(Math.round(64*a.getResources().getDisplayMetrics().density),a.findViewById(R.id.fullscreen_tabs).getHeight()));
    }
    private void saveScreenshot(String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();assertNotNull(image);
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File dir=context.getExternalFilesDir("tab-ui");assertNotNull(dir);assertTrue(dir.exists()||dir.mkdirs());
        try(FileOutputStream out=new FileOutputStream(new File(dir,name))){assertTrue(image.compress(Bitmap.CompressFormat.PNG,100,out));}finally{image.recycle();}
    }
    @After public void cleanup() throws Exception {if(scenario!=null)scenario.close();if(server!=null)server.close();if(worker!=null)worker.shutdownNow();}
}
