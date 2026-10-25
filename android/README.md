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

- A single **56dp toolbar** with back, address/search, tab count and menu leaves the rest of the screen for websites. Tap the tab count for the searchable tab list and **New tab**; close/switch, pin/duplicate/reorder, reopen and bulk close remain available. Home, forward and reload/stop live in the overflow menu. All persistent touch targets are 48dp; no always-expanded tab strip.
- Up to **12 website tabs**, last **10 closed URLs** restorable. Only the latest **3 WebViews** stay live to bound memory; evicted tabs reload their URL. Back history, forms, JS state and scroll position are **not** preserved after eviction/process recreation.
- Session URLs/titles/pins are app-private SharedPreferences metadata. Native Clear browser data deletes tab metadata, cookies, WebStorage and WebView cache; downloaded public files stay. Native sessions are separate from the PWA's local workspace. Normal cookies are shared across this app's WebViews; third-party cookies are disabled.
- Searches use the existing hosted Loxiro unified search. Website requests originate from the Android device and use Android System WebView, not the search server. Internet access and a current Android System WebView are required. Loxiro's existing provider/key limitations remain unchanged.

## Security / limits

No JavaScript-to-native interface, native filesystem bridge, remote native-code configuration, CORS proxy, certificate-error bypass, file/content navigation, or automatic external-app intents. Main-frame URLs are HTTP/HTTPS only, with credential-bearing URLs rejected. Native chrome shows the actual navigated URL; unknown popup destinations show `about:blank`, never a fabricated trusted Home URL. User activation is required for popup tabs. File/content access is off, mixed content is blocked, WebView Safe Browsing stays enabled, camera/mic/geolocation permissions are not granted. Plain HTTP is allowed as a browser navigation and is marked insecure in the address field.

This is an **early WebView browser preview, not a hardened Chrome replacement**. Some OAuth/sign-ins reject embedded WebViews. File upload, camera/mic, geolocation, full-screen video and blob/data exports are unsupported. Background WebViews receive `onPause`, not a guaranteed full process freeze. Direct HTTP(S) downloads use Android Download Manager after explicit confirmation, without forwarding session cookies. They do **not** use the web app's 8–32-part downloader. Blob downloads/JSON and text exports are web-only in this preview; use the original source in an external browser for unsupported workflows. The app requests only Internet permission; no broad storage/camera/mic permission is added.

The hosted app recognizes the `LoxiroAndroid/0.7` user-agent presentation marker and hides its *web workspace* tab strip and its Home/results search inputs, avoiding duplicate controls. The native top address bar is the only search/URL input; Home shows a short hint and results show the current query as a heading. The ordinary PWA keeps its own search input. The marker grants no privileges, and other sites receive no native bridge. Native browser controls remain visible above the entire WebView.

## Verification

JVM tests cover URL policy and native tab identity, selection, close/reopen, pins, ordering and caps. Instrumentation uses a local HTTP server and **real touch events** to open a website popup, switch real WebViews beneath persistent native chrome, recreate the Activity, enter another website, and reject unsafe address input. These fixtures do not establish compatibility with every website. Build/emulator results must be checked in Actions; this sandbox has no Android SDK/JDK and cannot verify Android locally.
