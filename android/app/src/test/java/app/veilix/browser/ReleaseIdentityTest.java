package app.veilix.browser;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The shell is only a wrapper -- it loads the hosted app from the deployed
 * site -- so a stale versionName does not change what runs. It does change what
 * the user sees in Android's app info screen, and the shell sat a full minor
 * version behind the hosted app for a while, which reads as abandoned.
 */
public class ReleaseIdentityTest {
    /** Mirrors package.json, which is the hosted app's version. */
    private static final String HOSTED_VERSION = "0.8.0";

    @Test public void versionNameMatchesTheHostedApp() {
        assertEquals(HOSTED_VERSION, BuildConfig.VERSION_NAME);
    }

    @Test public void versionNameIsNotAPreviewLabel() {
        // "Veilix Preview" was the launcher label while the app was experimental.
        // The name is gone from the manifest, so it must not survive in the version.
        assertTrue(BuildConfig.VERSION_NAME, !BuildConfig.VERSION_NAME.contains("preview"));
    }

    @Test public void versionCodeAdvancesWithEveryRelease() {
        assertTrue(String.valueOf(BuildConfig.VERSION_CODE), BuildConfig.VERSION_CODE >= 8);
    }
}
