import android.content.Context
import android.view.View

/** Stable customer-facing Android entrypoint. Runtime/session/registry ownership stays inside Vira. */
class ViraExperience private constructor(
  val view: View,
  private val session: ViraAndroidRuntimeSession,
  private val surface: ViraAndroidSurfaceController,
) {
  fun dispose() {
    surface.dispose()
    session.dispose()
  }

  companion object {
    fun create(
      context: Context,
      mountEnvelopeJson: String,
      runtimeStateJson: String,
      permissionPolicyJson: String,
      host: ViraAndroidHostAdapter,
      renderers: List<ViraAndroidNativeRenderer>,
    ): Result<ViraExperience> = runCatching {
      val envelope = ViraAndroidMountEnvelope.decode(mountEnvelopeJson).getOrThrow()
      val runtimeState = ViraAndroidRuntimeCoreState.decode(runtimeStateJson).getOrThrow()
      val permissionPolicy = ViraAndroidPermissionPolicy.decode(permissionPolicyJson).getOrThrow()
      if (runtimeState.experienceId != envelope.document.id) {
        throw ViraAndroidIssue(
          ViraAndroidIssueCode.INVALID_RUNTIME_STATE,
          "$.runtimeState.experienceId",
          "runtime state belongs to a different Experience",
        )
      }
      val session = ViraAndroidRuntimeSession(envelope, host, runtimeState, permissionPolicy)
      try {
        val registry = ViraAndroidRendererRegistry.create(envelope, renderers).getOrThrow()
        val surface = ViraAndroidSurfaceController.create(context, session, registry).getOrThrow()
        ViraExperience(surface.view, session, surface)
      } catch (error: Throwable) {
        session.dispose()
        throw error
      }
    }
  }
}
