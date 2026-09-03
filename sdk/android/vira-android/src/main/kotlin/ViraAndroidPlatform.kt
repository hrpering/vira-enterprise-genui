import android.content.Context
import android.os.Looper

const val VIRA_ANDROID_PLATFORM = "android"
const val VIRA_ANDROID_MOUNT_ENVELOPE_VERSION = "1"

internal fun requireViraAndroidMainThread(path: String = "$") {
  if (Looper.myLooper() != Looper.getMainLooper()) {
    throw ViraAndroidIssue(
      ViraAndroidIssueCode.WRONG_THREAD,
      path,
      "native Android runtime operation requires the main looper",
    )
  }
}

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
