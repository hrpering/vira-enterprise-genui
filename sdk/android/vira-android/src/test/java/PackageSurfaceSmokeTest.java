package consumer;

import org.junit.Test;
import xyz.tryvira.android.ViraAndroidPlatform;
import xyz.tryvira.android.ViraAndroidSessionVisibility;
import xyz.tryvira.android.ViraExperience;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public final class PackageSurfaceSmokeTest {
  @Test
  public void publicAndroidTypesAreImportableFromAnotherPackage() {
    assertNotNull(ViraAndroidPlatform.class);
    assertNotNull(ViraExperience.class);
    assertEquals("FOREGROUND", ViraAndroidSessionVisibility.FOREGROUND.name());
  }
}
