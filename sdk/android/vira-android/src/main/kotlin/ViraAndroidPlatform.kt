import android.content.Context

const val VIRA_ANDROID_PLATFORM = "android"
const val VIRA_ANDROID_MOUNT_ENVELOPE_VERSION = "1"

/**
 * Marker proving the handwritten SDK is compiled against the real Android SDK,
 * while generated Experience wire models remain owned by MASTER-02 interop.
 */
class ViraAndroidPlatform private constructor(
  val applicationContext: Context
) {
  companion object {
    fun create(context: Context): ViraAndroidPlatform =
      ViraAndroidPlatform(context.applicationContext)
  }
}
