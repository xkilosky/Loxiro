# Loxiro Android browser preview

Native Android controls stay **outside website WebViews**, so entering a website or opening a user-tapped `_blank` link keeps Loxiro's tab switcher visible. This is a separate installed app, not a capability the hosted PWA can provide.

## Build / install

Android 10+ (API 29). Use Android Studio with JDK 17 and Android SDK 35, or:

```sh
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
# Install app/build/outputs/apk/debug/app-debug.apk on your Android device.
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The **Android browser preview** GitHub workflow builds an installable debug APK (`loxiro-android-preview` artifact, retained 14 days), runs JVM tests/lint, and runs real WebView tests on an Android 15 emulator. GitHub sign-in may be required to download artifacts. A debug APK is for evaluation, not a Play Store release; the ephemeral CI debug signing key can change between builds, so a later preview may require uninstalling the old one (which deletes app data). A production release needs a stable owner-managed signing key, not credentials shared in chat.

## Native tabs

- A single **56dp toolbar** with back, address/search, tab count and menu leaves the rest of the screen for websites. Tap the tab count for a **full-screen visual card grid** and a thumb-friendly **New tab** button. All/Pinned/Closed filters, a highlighted current card, per-card close/menu controls, undo close and individual closed-tab restore keep management out of the website viewport. No second search field. Pin/duplicate/reorder and bulk close remain available. Home, forward and reload/stop live in the overflow menu. All persistent touch targets are 48dp; no always-expanded tab strip.
- Up to **12 website tabs**, last **10 closed URLs** restorable. Only the latest **3 WebViews** stay live to bound memory; evicted tabs reload their URL. Back history, forms, JS state and scroll position are **not** preserved after eviction/process recreation.
- Session URLs/titles/pins are app-private SharedPreferences metadata. Native Clear browser data deletes tab metadata, cookies, WebStorage and WebView cache; downloaded public files stay. Native sessions are separate from the PWA's local workspace. Normal cookies are shared across this app's WebViews; third-party cookies are disabled.
- Searches use the existing hosted Loxiro unified search. Website requests originate from the Android device and use Android System WebView, not the search server. Internet access and a current Android System WebView are required. Loxiro's existing provider/key limitations remain unchanged.

## Visual tab switcher (preview.3)

- Responsive 1–4-column grid based on actual window width: two cards across on typical phones, more in landscape/tablet windows. Card titles, hostnames and a labeled current-tab border remain native UI.
- Last-viewed viewport previews are captured only from an already-visible, finished WebView, never by loading background pages. Missing previews use an honest site-initial placeholder. These are snapshots, not live pages.
- Previews are **memory-only**, at most 224 × 300 pixels each (about 3.1 MiB total for 12 ARGB images). They are not written to files, backups, or session storage. Closing a tab, a new navigation, clearing data, low-memory signals and Activity destruction discard the relevant previews. Rotation/process recreation retains tab metadata, not screenshots. Sensitive page content can appear in a tab preview while the app is open.
- Undo restores the exact closed tab; Closed lets you choose among the last 10. URL/title/pin state restores, not form data or complete browsing state. At the 12-tab cap, restoration requires closing a tab first.
- Automated Android 15 checks cover real website switching, grid sizing, pin filters, close/undo/restore, portrait/landscape reachability, session recreation and the unchanged compact browsing toolbar. Fixture screenshots are included in the test reports artifact; they do not establish physical-device or every-website compatibility.

## Native browser settings (preview.4)

Open **⋮ → Browser settings** (first menu item). Preferences use app-private `native-settings-v1` SharedPreferences, separate from the hosted Home app. Changes apply immediately to existing and new WebViews and survive Activity recreation/relaunch.

- **Website text zoom: 75–200%**, slider and accessible ±5% buttons, plus reset to 100%. This uses WebView text zoom; it does not resize images, native controls or override every website’s fixed layout. The slider exposes the actual percentage to accessibility services.
- **Pinch-to-zoom** enabled by default, without floating zoom buttons. Sites can limit their supported zoom range; this is not a force-zoom/CSS bypass.
- **Roomier address bar:** opt-in 72dp native toolbar with larger address text; the default remains the compact 56dp toolbar. All native text uses scale-independent units and follows Android font scaling. Links to Android Accessibility and Display settings let users configure TalkBack, magnification, font and display size; the app does not enable accessibility services itself.
- **Tab preview privacy:** turning previews off immediately discards cached snapshots and prevents new ones until enabled again. Snapshots remain memory-only.
- **Keep screen awake:** optional foreground-window flag, off by default. Can increase battery use; no background service or new permission.
- **Other:** Android downloads, confirmed native browser-data clearing, and confirmed settings reset. Clearing browser data retains these preferences and downloaded public files. Settings reset changes only preferences, not tabs/cookies/downloads.

Build/lint/JVM tests and Android 15 emulator tests must pass before delivery. Native tests cover live/future WebView zoom, toggles, roomier toolbar, preview suppression, persistence, reset, and malformed stored preferences. This is not a full TalkBack or physical-device accessibility audit.

## Security / limits

No JavaScript-to-native interface, native filesystem bridge, remote native-code configuration, CORS proxy, certificate-error bypass, file/content navigation, or automatic external-app intents. Main-frame URLs are HTTP/HTTPS only, with credential-bearing URLs rejected. Native chrome shows the actual navigated URL; unknown popup destinations show `about:blank`, never a fabricated trusted Home URL. User activation is required for popup tabs. File/content access is off, mixed content is blocked, WebView Safe Browsing stays enabled, camera/mic/geolocation permissions are not granted. Plain HTTP is allowed as a browser navigation and is marked insecure in the address field.

This is an **early WebView browser preview, not a hardened Chrome replacement**. Some OAuth/sign-ins reject embedded WebViews. File upload, camera/mic, geolocation, full-screen video and blob/data exports are unsupported. Background WebViews receive `onPause`, not a guaranteed full process freeze. Direct HTTP(S) downloads use Android Download Manager after explicit confirmation, without forwarding session cookies. They do **not** use the web app's 8–32-part downloader. Blob downloads/JSON and text exports are web-only in this preview; use the original source in an external browser for unsupported workflows. The app requests only Internet permission; no broad storage/camera/mic permission is added.

The hosted app recognizes the `LoxiroAndroid/0.7` user-agent presentation marker and hides its *web workspace* tab strip and its Home/results search inputs, avoiding duplicate controls. The native top address bar is the only search/URL input; Home shows a short hint and results show the current query as a heading. The ordinary PWA keeps its own search input. The marker grants no privileges, and other sites receive no native bridge. Native browser controls remain visible above the entire WebView.

## Verification

JVM tests cover URL policy and native tab identity, selection, close/reopen, pins, ordering and caps. Instrumentation uses a local HTTP server and **real touch events** to open a website popup, switch real WebViews beneath persistent native chrome, recreate the Activity, enter another website, and reject unsafe address input. These fixtures do not establish compatibility with every website. Build/emulator results must be checked in Actions; this sandbox has no Android SDK/JDK and cannot verify Android locally.
