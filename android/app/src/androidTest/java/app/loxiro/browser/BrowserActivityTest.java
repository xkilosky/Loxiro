package app.loxiro.browser;

import android.content.Context;
import android.content.Intent;
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
        server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));origin="http://127.0.0.1:"+server.getLocalPort();worker=Executors.newCachedThreadPool();
        worker.submit(()->{while(!server.isClosed())try{Socket socket=server.accept();worker.submit(()->serve(socket));}catch(Exception ignored){return;}});
        Intent intent=new Intent(context,BrowserActivity.class);intent.putExtra("test_home",origin+"/one");scenario=ActivityScenario.launch(intent);
        awaitTitle("First fixture");
    }
    private void serve(Socket socket) {
        try(Socket s=socket){
            BufferedReader reader=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.UTF_8));String request=reader.readLine();
            if(request==null)return;String line;while((line=reader.readLine())!=null&&!line.isEmpty()){}
            boolean second=request.contains(" /two ");
            String html="<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+(second?"Second fixture":"First fixture")+"</title><style>body{margin:8px}a{display:block;height:120px;background:#eef0ff}</style><a href='/two' target='_blank'>Open another website</a><p>Real website content cannot remove Android browser chrome.</p>";
            byte[] body=html.getBytes(StandardCharsets.UTF_8);OutputStream out=s.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
        }catch(Exception ignored){}
    }
    private void awaitTitle(String title) {
        long end=SystemClock.uptimeMillis()+15000;AtomicBoolean done=new AtomicBoolean();
        while(SystemClock.uptimeMillis()<end){scenario.onActivity(a->done.set(title.equals(a.activeTitle())));if(done.get())return;SystemClock.sleep(75);}
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
        onView(withContentDescription("Switch to First fixture")).perform(scrollTo(),click());awaitTitle("First fixture");
        scenario.onActivity(a->assertEquals(origin+"/one",a.activeUrl()));
        onView(withContentDescription("Switch to Second fixture")).perform(scrollTo(),click());awaitTitle("Second fixture");
        scenario.recreate();awaitTitle("Second fixture");scenario.onActivity(a->{assertEquals(2,a.nativeTabCount());assertEquals(origin+"/two",a.activeUrl());});
        onView(withId(R.id.tab_count)).check(matches(isDisplayed()));
    }
    @Test public void enteringAWebsiteKeepsChromeAndUnsafeInputCannotEscape() {
        onView(withId(R.id.address)).perform(replaceText(origin+"/two"),pressImeActionButton());awaitTitle("Second fixture");
        onView(withId(R.id.tab_count)).check(matches(isDisplayed()));onView(withId(R.id.new_tab)).check(matches(isDisplayed()));
        onView(withId(R.id.address)).perform(replaceText("javascript:alert(1)"),pressImeActionButton());scenario.onActivity(a->assertEquals(origin+"/two",a.activeUrl()));
        onView(withId(R.id.new_tab)).perform(click());awaitTitle("First fixture");scenario.onActivity(a->assertEquals(2,a.nativeTabCount()));
        onView(withContentDescription("Close First fixture")).perform(scrollTo(),click());awaitTitle("Second fixture");scenario.onActivity(a->assertEquals(1,a.nativeTabCount()));
    }
    @After public void cleanup() throws Exception {if(scenario!=null)scenario.close();if(server!=null)server.close();if(worker!=null)worker.shutdownNow();}
}
