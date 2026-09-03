import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout

class ViraAndroidSurfaceController private constructor(
  private val context: Context,
  private val session: ViraAndroidRuntimeSession,
  private val registry: ViraAndroidRendererRegistry,
) {
  val view: LinearLayout = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var disposed = false
  private var unsubscribeHost: (() -> Unit)? = null
  private var lastIssueValue: ViraAndroidIssue? = null

  val lastIssue: ViraAndroidIssue?
    get() = lastIssueValue

  fun refresh(): Result<Unit> {
    if (disposed) {
      return Result.failure(ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "native Android surface is disposed"))
    }
    if (Looper.myLooper() != Looper.getMainLooper()) {
      return Result.failure(ViraAndroidIssue(ViraAndroidIssueCode.RENDERER_FAILED, "$.surface", "native Android surface refresh requires the main looper"))
    }
    val rendered = registry.render(context, session, ::requestRefresh)
    if (rendered.isFailure) {
      val error = rendered.exceptionOrNull()
      lastIssueValue = error as? ViraAndroidIssue ?: ViraAndroidIssue(
        ViraAndroidIssueCode.RENDERER_FAILED,
        "$.surface",
        "native Android surface refresh failed",
      )
      return Result.failure(lastIssueValue!!)
    }
    replaceChildren(rendered.getOrThrow())
    lastIssueValue = null
    return Result.success(Unit)
  }

  fun dispose() {
    if (disposed) return
    disposed = true
    unsubscribeHost?.invoke()
    unsubscribeHost = null
    if (Looper.myLooper() == Looper.getMainLooper()) {
      view.removeAllViews()
    } else {
      mainHandler.post { view.removeAllViews() }
    }
  }

  private fun requestRefresh() {
    if (disposed) return
    if (Looper.myLooper() == Looper.getMainLooper()) {
      refresh()
    } else {
      mainHandler.post { if (!disposed) refresh() }
    }
  }

  private fun replaceChildren(children: List<View>) {
    view.removeAllViews()
    children.forEach(view::addView)
  }

  companion object {
    fun create(
      context: Context,
      session: ViraAndroidRuntimeSession,
      registry: ViraAndroidRendererRegistry,
    ): Result<ViraAndroidSurfaceController> = runCatching {
      if (Looper.myLooper() != Looper.getMainLooper()) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.RENDERER_FAILED, "$.surface", "native Android surface creation requires the main looper")
      }
      val controller = ViraAndroidSurfaceController(context, session, registry)
      controller.unsubscribeHost = session.host.subscribe { controller.requestRefresh() }
      controller.refresh().getOrThrow()
      controller
    }
  }
}
