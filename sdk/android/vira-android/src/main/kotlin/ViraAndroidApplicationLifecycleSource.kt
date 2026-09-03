import android.app.Activity
import android.app.Application
import android.os.Bundle

class ViraAndroidApplicationLifecycleSource private constructor(
  private val application: Application,
  initial: ViraAndroidLifecycleSnapshot,
  initialStartedActivityCount: Int,
) : ViraAndroidLifecycleSource, Application.ActivityLifecycleCallbacks {
  private val lock = Any()
  private var current = initial
  private var startedActivities = initialStartedActivityCount
  private var disposed = false
  private val listeners = linkedSetOf<(ViraAndroidLifecycleEvent) -> Unit>()

  private data class Delivery(
    val type: ViraAndroidLifecycleEventType,
    val callbacks: List<(ViraAndroidLifecycleEvent) -> Unit>,
  )

  override fun snapshot(): ViraAndroidLifecycleSnapshot = synchronized(lock) {
    if (disposed) throw ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "Android lifecycle source is disposed")
    current
  }

  override fun subscribe(listener: (ViraAndroidLifecycleEvent) -> Unit): () -> Unit {
    synchronized(lock) {
      if (disposed) return {}
      listeners += listener
    }
    var active = true
    return {
      synchronized(lock) {
        if (active) {
          active = false
          listeners -= listener
        }
      }
    }
  }

  fun reportConnectivity(connected: Boolean) {
    val delivery = synchronized(lock) {
      if (disposed) return
      val next = if (connected) ViraAndroidSessionConnectivity.CONNECTED else ViraAndroidSessionConnectivity.DISCONNECTED
      if (next == current.connectivity) return
      current = current.copy(connectivity = next)
      val type = if (connected) ViraAndroidLifecycleEventType.RECONNECT else ViraAndroidLifecycleEventType.DISCONNECT
      Delivery(type, listeners.toList())
    }
    deliver(delivery)
  }

  fun reportResume() {
    val delivery = synchronized(lock) {
      if (disposed || startedActivities <= 0) return
      if (current.visibility != ViraAndroidSessionVisibility.FOREGROUND) {
        current = current.copy(visibility = ViraAndroidSessionVisibility.FOREGROUND)
      }
      Delivery(ViraAndroidLifecycleEventType.RESUME, listeners.toList())
    }
    deliver(delivery)
  }

  fun dispose() {
    synchronized(lock) {
      if (disposed) return
      disposed = true
      listeners.clear()
    }
    application.unregisterActivityLifecycleCallbacks(this)
  }

  override fun onActivityStarted(activity: Activity) {
    val delivery = synchronized(lock) {
      if (disposed) return
      startedActivities += 1
      if (startedActivities == 1 && current.visibility != ViraAndroidSessionVisibility.FOREGROUND) {
        current = current.copy(visibility = ViraAndroidSessionVisibility.FOREGROUND)
        Delivery(ViraAndroidLifecycleEventType.FOREGROUND, listeners.toList())
      } else null
    }
    delivery?.let(::deliver)
  }

  override fun onActivityStopped(activity: Activity) {
    val delivery = synchronized(lock) {
      if (disposed) return
      if (startedActivities > 0) startedActivities -= 1
      if (startedActivities == 0 && current.visibility != ViraAndroidSessionVisibility.BACKGROUND) {
        current = current.copy(visibility = ViraAndroidSessionVisibility.BACKGROUND)
        Delivery(ViraAndroidLifecycleEventType.BACKGROUND, listeners.toList())
      } else null
    }
    delivery?.let(::deliver)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
  override fun onActivityResumed(activity: Activity) = reportResume()
  override fun onActivityPaused(activity: Activity) = Unit
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
  override fun onActivityDestroyed(activity: Activity) = Unit

  private fun deliver(delivery: Delivery) {
    val event = ViraAndroidLifecycleEvent(type = delivery.type)
    delivery.callbacks.forEach { it(event) }
  }

  companion object {
    fun create(
      application: Application,
      initialVisibility: ViraAndroidSessionVisibility,
      initialConnectivity: ViraAndroidSessionConnectivity,
      initialStartedActivityCount: Int,
    ): Result<ViraAndroidApplicationLifecycleSource> = runCatching {
      if (initialStartedActivityCount < 0) {
        throw ViraAndroidIssue(
          ViraAndroidIssueCode.INVALID_RUNTIME_STATE,
          "$.lifecycle.initialStartedActivityCount",
          "initial started activity count must be non-negative",
        )
      }
      val expectedForeground = initialStartedActivityCount > 0
      if (expectedForeground != (initialVisibility == ViraAndroidSessionVisibility.FOREGROUND)) {
        throw ViraAndroidIssue(
          ViraAndroidIssueCode.INVALID_RUNTIME_STATE,
          "$.lifecycle.initialVisibility",
          "initial visibility must exactly match the supplied started activity count",
        )
      }
      val source = ViraAndroidApplicationLifecycleSource(
        application,
        ViraAndroidLifecycleSnapshot(initialVisibility, initialConnectivity),
        initialStartedActivityCount,
      )
      application.registerActivityLifecycleCallbacks(source)
      source
    }
  }
}
