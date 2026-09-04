package xyz.tryvira.android;

import android.content.Context;
import android.test.AndroidTestCase;

public final class ViraExperienceInstrumentedTest extends AndroidTestCase {
  public void testStableExternalBrandSurfaceLoadsOnEmulator() {
    final Context context = getContext();
    assertNotNull(context);

    final ViraAndroidPlatform platform = ViraAndroidPlatform.Companion.create(context);
    assertNotNull(platform);
    assertNotNull(platform.getApplicationContext());

    assertNotNull(ViraExperience.class);
    assertNotNull(ViraAndroidPlatform.class);
  }
}
