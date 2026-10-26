package app.loxiro.browser;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.espresso.action.GeneralClickAction;
import androidx.test.espresso.action.Press;
import androidx.test.espresso.action.Tap;
import androidx.test.espresso.intent.Intents;
import org.json.JSONArray;
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
import java.util.concurrent.atomic.AtomicReference;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.*;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static androidx.test.espresso.intent.Intents.*;
import static androidx.test.espresso.intent.matcher.IntentMatchers.*;
import static org.junit.Assert.*;

/** Real WebViews. Picker/role/share UI handoffs are stubbed, not external-app compatibility claims. */
@RunWith(AndroidJUnit4.class)
public class EverydayBrowsingTest {
    private ActivityScenario<BrowserActivity> scenario;
    private ServerSocket server;
    private ExecutorService worker;
    private String origin;
    @Before public void setup() throws Exception {
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
        c.getSharedPreferences("native-tabs-v1",0).edit().clear().commit();c.getSharedPreferences("native-settings-v1",0).edit().clear().commit();
        Intents.init();server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));origin="http://127.0.0.1:"+server.getLocalPort();worker=Executors.newCachedThreadPool();
        worker.submit(()->{while(!server.isClosed())try{Socket s=server.accept();worker.submit(()->serve(s));}catch(Exception e){return;}});
        Intent launch=new Intent(c,BrowserActivity.class).putExtra("test_home",origin+"/features");scenario=ActivityScenario.launch(launch);awaitTitle("Features");
    }
    private void serve(Socket socket){try(Socket s=socket){
        BufferedReader reader=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.UTF_8));String request=reader.readLine();if(request==null)return;String line;while((line=reader.readLine())!=null&&!line.isEmpty()){}
        if(request.contains(" /movie.mp4 ")){
            byte[] movie;try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("video-fixture.mp4")){java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);movie=bytes.toByteArray();}
            OutputStream video=s.getOutputStream();video.write(("HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nContent-Length: "+movie.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));video.write(movie);video.flush();return;
        }
        String html="<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Features</title><style>body{margin:12px}input,button{display:block;min-height:48px;margin:8px 0}video{width:200px;height:90px;background:#222}</style><p>needle one. needle two. needle three.</p>"+
            "<input id='document' type='file' accept='.txt' onchange=\"let r=new FileReader();r.onload=()=>document.title='upload:'+r.result;r.readAsText(this.files[0])\">"+
            "<input id='photo' type='file' accept='image/*' onchange=\"let r=new FileReader();r.onload=()=>document.title='photo:'+this.files.length+':'+this.files[0].type;r.readAsDataURL(this.files[0])\">"+
            "<video id='movie' muted playsinline loop src='/movie.mp4' onplaying=\"document.title='Playing'\"></video><button id='fullscreen' onclick=\"movie.play();movie.requestFullscreen()\">Full screen video</button>";
        byte[] body=html.getBytes(StandardCharsets.UTF_8);OutputStream out=s.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
    }catch(Exception ignored){}}
    private void awaitTitle(String expected){
        long end=SystemClock.uptimeMillis()+15000;AtomicBoolean done=new AtomicBoolean();
        while(SystemClock.uptimeMillis()<end){scenario.onActivity(a->done.set(expected.equals(a.activeTitle())&&a.activePageReady()));if(done.get()){frame();return;}SystemClock.sleep(50);}fail("Title not loaded: "+expected);
    }
    private void frame(){AtomicBoolean ready=new AtomicBoolean();scenario.onActivity(a->a.afterVisibleFrame(()->ready.set(true)));long end=SystemClock.uptimeMillis()+5000;while(!ready.get()&&SystemClock.uptimeMillis()<end)SystemClock.sleep(25);assertTrue(ready.get());}
    private WebView page(BrowserActivity a){return (WebView)((FrameLayout)a.findViewById(R.id.web_content)).getChildAt(0);}
    private void touchElement(String id) throws Exception {
        AtomicReference<float[]> center=new AtomicReference<>();
        scenario.onActivity(a->page(a).evaluateJavascript("(()=>{let e=document.getElementById('"+id+"');e.scrollIntoView({block:'center'});let r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()",json->{try{JSONArray coords=new JSONArray(json);center.set(new float[]{(float)coords.getDouble(0),(float)coords.getDouble(1)});}catch(Exception e){throw new AssertionError(e);}}));
        long end=SystemClock.uptimeMillis()+5000;while(center.get()==null&&SystemClock.uptimeMillis()<end)SystemClock.sleep(25);assertNotNull(center.get());frame();
        onView(isAssignableFrom(WebView.class)).perform(new GeneralClickAction(Tap.SINGLE,v->{int[] p=new int[2];v.getLocationOnScreen(p);float d=v.getResources().getDisplayMetrics().density;return new float[]{p[0]+center.get()[0]*d,p[1]+center.get()[1]*d};},Press.FINGER));
    }
    private void menu(String label){onView(withContentDescription("Browser options")).perform(click());onView(withText(label)).perform(click());}
    private void awaitFindCount(String expected){long end=SystemClock.uptimeMillis()+5000;AtomicReference<String> value=new AtomicReference<>();do{scenario.onActivity(a->value.set(((android.widget.TextView)a.findViewById(R.id.find_count)).getText().toString()));if(expected.equals(value.get()))return;SystemClock.sleep(50);}while(SystemClock.uptimeMillis()<end);assertEquals(expected,value.get());}
    @Test public void findMatchesNextPreviousNoMatchesAndClose(){
        menu("Find in page");onView(withId(R.id.find_input)).perform(replaceText("needle"),pressImeActionButton());
        long end=SystemClock.uptimeMillis()+5000;AtomicReference<String> count=new AtomicReference<>();
        do{scenario.onActivity(a->count.set(((android.widget.TextView)a.findViewById(R.id.find_count)).getText().toString()));if("1/3".equals(count.get()))break;SystemClock.sleep(50);}while(SystemClock.uptimeMillis()<end);
        assertEquals("1/3",count.get());onView(withContentDescription("Next match")).perform(click());awaitFindCount("2/3");
        onView(withContentDescription("Previous match")).perform(click());awaitFindCount("1/3");
        onView(withId(R.id.find_input)).perform(replaceText("absent phrase"),pressImeActionButton());awaitFindCount("0/0");
        onView(withContentDescription("Close find in page")).perform(click());onView(withId(R.id.address)).check(matches(isDisplayed()));
        scenario.onActivity(a->assertEquals(View.GONE,a.findViewById(R.id.find_bar).getVisibility()));
    }
    @Test public void selectedDocumentAndPhotoAreReadableByTheWebsite() throws Exception {
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Uri document=Uri.parse("content://app.loxiro.browser.test.files/hello.txt");
        c.getContentResolver().call(document,"grant",c.getPackageName(),null);
        intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(document).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
        touchElement("document");awaitTitle("upload:Selected document fixture");
        intended(hasAction(Intent.ACTION_OPEN_DOCUMENT));
        Intents.release();Intents.init();Uri photo=Uri.parse("content://app.loxiro.browser.test.files/photo.png");
        intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(photo).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
        touchElement("photo");awaitTitle("photo:1:image/png");
        scenario.onActivity(a->{assertFalse(page(a).getSettings().getAllowFileAccess());assertFalse(page(a).getSettings().getAllowContentAccess());});
    }
    @Test public void pickerCancelAndUnsafeUriDoNotExposeAFile() throws Exception {
        intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));touchElement("document");awaitTitle("Features");
        Intents.release();Intents.init();intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(Uri.parse("file:///data/data/app.loxiro.browser/private"))));touchElement("document");awaitTitle("Features");
    }
    @Test public void fullScreenVideoRestoresChromeOnExitAndBack() throws Exception {
        touchElement("fullscreen");long end=SystemClock.uptimeMillis()+7000;AtomicBoolean active=new AtomicBoolean();while(SystemClock.uptimeMillis()<end){scenario.onActivity(a->active.set(a.isPageFullscreen()));if(active.get())break;SystemClock.sleep(50);}assertTrue("WebView must enter a real custom full-screen view",active.get());awaitTitle("Playing");
        onView(withContentDescription("Exit full screen")).perform(click());onView(withId(R.id.address)).check(matches(isDisplayed()));scenario.onActivity(a->assertFalse(a.isPageFullscreen()));
        touchElement("fullscreen");SystemClock.sleep(300);androidx.test.espresso.Espresso.pressBack();onView(withId(R.id.tab_count)).check(matches(isDisplayed()));scenario.onActivity(a->assertFalse(a.isPageFullscreen()));
    }
    @Test public void incomingLinksReuseActivityWithoutLosingTabsAndShareUsesAChooser(){
        scenario.onActivity(a->a.onNewIntent(new Intent(Intent.ACTION_VIEW,Uri.parse(origin+"/other"))));awaitTitle("Features");scenario.onActivity(a->{assertEquals(2,a.nativeTabCount());assertEquals(origin+"/other",a.activeUrl());});
        scenario.recreate();awaitTitle("Features");scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
        scenario.onActivity(a->a.onNewIntent(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"Read "+origin+"/shared")));awaitTitle("Features");scenario.onActivity(a->{assertEquals(3,a.nativeTabCount());assertEquals(origin+"/shared",a.activeUrl());});
        scenario.onActivity(a->a.onNewIntent(new Intent(Intent.ACTION_VIEW,Uri.parse("javascript:alert(1)"))));scenario.onActivity(a->assertEquals(3,a.nativeTabCount()));
        intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));menu("Share page");
        intended(hasAction(Intent.ACTION_CHOOSER));Intent chooser=Intents.getIntents().stream().filter(i->Intent.ACTION_CHOOSER.equals(i.getAction())).findFirst().get();Intent share=chooser.getParcelableExtra(Intent.EXTRA_INTENT);
        assertEquals(Intent.ACTION_SEND,share.getAction());assertEquals("text/plain",share.getType());assertEquals(origin+"/shared",share.getStringExtra(Intent.EXTRA_TEXT));
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Intent implicit=new Intent(Intent.ACTION_VIEW,Uri.parse("https://example.org")).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(c.getPackageName());assertNotNull(c.getPackageManager().resolveActivity(implicit,0));
        intending(hasAction("android.app.role.action.REQUEST_ROLE")).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));menu("Default browser");intended(hasAction("android.app.role.action.REQUEST_ROLE"));
    }
    @Test public void pendingUploadCannotCrossNavigationOrOverlapPickers(){
        class Host extends Activity{int launches;@Override public void startActivityForResult(Intent i,int r){launches++;assertEquals(Intent.ACTION_OPEN_DOCUMENT,i.getAction());assertTrue(i.hasCategory(Intent.CATEGORY_OPENABLE));assertEquals("text/plain",i.getType());}}
        Host host=new Host();UploadPicker picker=new UploadPicker(host,false);java.util.concurrent.atomic.AtomicInteger deliveries=new java.util.concurrent.atomic.AtomicInteger();
        android.webkit.WebChromeClient.FileChooserParams params=new android.webkit.WebChromeClient.FileChooserParams(){public int getMode(){return MODE_OPEN;}public String[] getAcceptTypes(){return new String[]{"text/plain"};}public boolean isCaptureEnabled(){return false;}public CharSequence getTitle(){return "Fixture";}public String getFilenameHint(){return null;}public Intent createIntent(){return new Intent(Intent.ACTION_OPEN_DOCUMENT);}};
        picker.show("a",value->{assertNull(value);deliveries.incrementAndGet();},params);assertTrue(picker.pending());picker.cancelOwner("a");assertEquals(1,deliveries.get());
        picker.show("b",value->{assertNull(value);deliveries.incrementAndGet();},params);assertEquals(1,host.launches);assertEquals(2,deliveries.get());
        picker.result(Activity.RESULT_OK,new Intent().setData(Uri.parse("file:///private")));assertFalse(picker.pending());assertEquals(2,deliveries.get());
    }
    @After public void cleanup() throws Exception {if(scenario!=null)scenario.close();Intents.release();if(server!=null)server.close();if(worker!=null)worker.shutdownNow();}
}
