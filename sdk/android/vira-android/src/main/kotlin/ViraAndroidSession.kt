enum class ViraAndroidSessionVisibility { FOREGROUND, BACKGROUND }
enum class ViraAndroidSessionConnectivity { CONNECTED, DISCONNECTED }
enum class ViraAndroidSessionContinuity { LIVE, RESTORED }
enum class ViraAndroidSessionCacheStatus { INACTIVE, VERIFICATION_REQUIRED }
enum class ViraAndroidLifecycleEventType { FOREGROUND, BACKGROUND, RESUME, DISCONNECT, RECONNECT }

data class ViraAndroidLifecycleSnapshot(
  val visibility: ViraAndroidSessionVisibility,
  val connectivity: ViraAndroidSessionConnectivity,
)

data class ViraAndroidLifecycleEvent(
  val version: String = "1",
  val type: ViraAndroidLifecycleEventType,
)

data class ViraAndroidSessionTransition(
  val state: ViraAndroidSessionState,
  val changed: Boolean,
)

data class ViraAndroidSessionState private constructor(
  val version: String,
  val instanceId: String,
  val revision: Long,
  val visibility: ViraAndroidSessionVisibility,
  val connectivity: ViraAndroidSessionConnectivity,
  val continuity: ViraAndroidSessionContinuity,
  val cacheStatus: ViraAndroidSessionCacheStatus,
) {
  fun transition(event: ViraAndroidLifecycleEvent): Result<ViraAndroidSessionTransition> = runCatching {
    if (event.version != "1") invalid()
    var nextVisibility = visibility
    var nextConnectivity = connectivity
    when (event.type) {
      ViraAndroidLifecycleEventType.BACKGROUND -> nextVisibility = ViraAndroidSessionVisibility.BACKGROUND
      ViraAndroidLifecycleEventType.FOREGROUND,
      ViraAndroidLifecycleEventType.RESUME -> nextVisibility = ViraAndroidSessionVisibility.FOREGROUND
      ViraAndroidLifecycleEventType.DISCONNECT -> nextConnectivity = ViraAndroidSessionConnectivity.DISCONNECTED
      ViraAndroidLifecycleEventType.RECONNECT -> nextConnectivity = ViraAndroidSessionConnectivity.CONNECTED
    }
    if (nextVisibility == visibility && nextConnectivity == connectivity) {
      return@runCatching ViraAndroidSessionTransition(this, false)
    }
    if (revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) {
      throw ViraAndroidIssue(ViraAndroidIssueCode.REVISION_OVERFLOW, "$.revision", "runtime session revision cannot be incremented safely")
    }
    ViraAndroidSessionTransition(
      copy(
        revision = revision + 1,
        visibility = nextVisibility,
        connectivity = nextConnectivity,
      ),
      true,
    )
  }

  companion object {
    fun create(
      instanceId: String,
      snapshot: ViraAndroidLifecycleSnapshot,
    ): Result<ViraAndroidSessionState> = runCatching {
      validateInstance(instanceId)
      ViraAndroidSessionState(
        version = "1",
        instanceId = instanceId,
        revision = 0,
        visibility = snapshot.visibility,
        connectivity = snapshot.connectivity,
        continuity = ViraAndroidSessionContinuity.LIVE,
        cacheStatus = ViraAndroidSessionCacheStatus.INACTIVE,
      )
    }

    fun restore(
      expectedInstanceId: String,
      persisted: ViraAndroidSessionState,
    ): Result<ViraAndroidSessionTransition> = runCatching {
      validateInstance(expectedInstanceId)
      if (persisted.instanceId != expectedInstanceId) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.INSTANCE_MISMATCH, "$.instanceId", "persisted runtime session belongs to a different instance")
      }
      if (persisted.revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.REVISION_OVERFLOW, "$.revision", "runtime session revision cannot be incremented safely")
      }
      ViraAndroidSessionTransition(
        persisted.copy(
          revision = persisted.revision + 1,
          continuity = ViraAndroidSessionContinuity.RESTORED,
          cacheStatus = ViraAndroidSessionCacheStatus.VERIFICATION_REQUIRED,
        ),
        true,
      )
    }

    fun decode(text: String): Result<ViraAndroidSessionState> = runCatching {
      val root = ViraAndroidCanonicalJson.decode(text).asObjectOrNull() ?: invalid()
      if (root.keys != setOf("version", "instanceId", "revision", "visibility", "connectivity", "continuity", "cacheStatus")) invalid()
      val version = root["version"]?.asStringOrNull() ?: invalid()
      val instanceId = root["instanceId"]?.asStringOrNull() ?: invalid()
      val revisionNumber = root["revision"]?.asNumberOrNull() ?: invalid()
      val visibility = when (root["visibility"]?.asStringOrNull()) {
        "foreground" -> ViraAndroidSessionVisibility.FOREGROUND
        "background" -> ViraAndroidSessionVisibility.BACKGROUND
        else -> invalid()
      }
      val connectivity = when (root["connectivity"]?.asStringOrNull()) {
        "connected" -> ViraAndroidSessionConnectivity.CONNECTED
        "disconnected" -> ViraAndroidSessionConnectivity.DISCONNECTED
        else -> invalid()
      }
      val continuity = when (root["continuity"]?.asStringOrNull()) {
        "live" -> ViraAndroidSessionContinuity.LIVE
        "restored" -> ViraAndroidSessionContinuity.RESTORED
        else -> invalid()
      }
      val cacheStatus = when (root["cacheStatus"]?.asStringOrNull()) {
        "inactive" -> ViraAndroidSessionCacheStatus.INACTIVE
        "verification-required" -> ViraAndroidSessionCacheStatus.VERIFICATION_REQUIRED
        else -> invalid()
      }
      validateInstance(instanceId)
      if (version != "1" || revisionNumber < 0 || revisionNumber > VIRA_ANDROID_MAX_SAFE_INTEGER.toDouble() || revisionNumber % 1.0 != 0.0) invalid()
      if ((continuity == ViraAndroidSessionContinuity.LIVE) != (cacheStatus == ViraAndroidSessionCacheStatus.INACTIVE)) invalid()
      ViraAndroidSessionState(version, instanceId, revisionNumber.toLong(), visibility, connectivity, continuity, cacheStatus)
    }.recoverCatching { error ->
      if (error is ViraAndroidIssue) throw error
      throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_SESSION_STATE, "$", "native runtime session state is invalid")
    }

    private fun validateInstance(instanceId: String) {
      if (instanceId.isEmpty() || instanceId.length > 4_096) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_SESSION_STATE, "$.instanceId", "runtime session requires an exact bounded instanceId")
      }
    }

    private fun invalid(): Nothing = throw IllegalArgumentException("invalid session state")
  }
}

interface ViraAndroidLifecycleSource {
  fun snapshot(): ViraAndroidLifecycleSnapshot
  fun subscribe(listener: (ViraAndroidLifecycleEvent) -> Unit): () -> Unit
}

class ViraAndroidSessionController private constructor(
  private val source: ViraAndroidLifecycleSource,
  initial: ViraAndroidSessionState,
) {
  private val lock = Any()
  private var stateValue = initial
  private var disposed = false
  private var unsubscribe: (() -> Unit)? = null
  private val listeners = linkedSetOf<(ViraAndroidSessionState) -> Unit>()

  fun state(): Result<ViraAndroidSessionState> = runCatching {
    synchronized(lock) {
      if (disposed) throw ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "native lifecycle controller is disposed")
      stateValue
    }
  }

  fun transition(type: ViraAndroidLifecycleEventType): Result<ViraAndroidSessionTransition> {
    val transition = synchronized(lock) {
      if (disposed) return Result.failure(ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "native lifecycle controller is disposed"))
      val result = stateValue.transition(ViraAndroidLifecycleEvent(type = type))
      if (result.isFailure) return result
      val value = result.getOrThrow()
      if (value.changed) stateValue = value.state
      value
    }
    if (transition.changed) notifyListeners(transition.state)
    return Result.success(transition)
  }

  fun subscribe(listener: (ViraAndroidSessionState) -> Unit): () -> Unit {
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

  fun dispose() {
    val cleanup = synchronized(lock) {
      if (disposed) return
      disposed = true
      listeners.clear()
      val existing = unsubscribe
      unsubscribe = null
      existing
    }
    cleanup?.invoke()
  }

  private fun receive(event: ViraAndroidLifecycleEvent) {
    val next = synchronized(lock) {
      if (disposed) return
      val result = stateValue.transition(event)
      if (result.isFailure) return
      val transition = result.getOrThrow()
      if (!transition.changed) return
      stateValue = transition.state
      transition.state
    }
    notifyListeners(next)
  }

  private fun notifyListeners(state: ViraAndroidSessionState) {
    val callbacks = synchronized(lock) { listeners.toList() }
    callbacks.forEach { it(state) }
  }

  companion object {
    fun create(
      instanceId: String,
      source: ViraAndroidLifecycleSource,
    ): Result<ViraAndroidSessionController> = runCatching {
      val snapshot = try {
        source.snapshot()
      } catch (_: Throwable) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_LIFECYCLE_SOURCE, "$.lifecycle.snapshot", "native lifecycle source snapshot failed")
      }
      attach(source, ViraAndroidSessionState.create(instanceId, snapshot).getOrThrow())
    }

    fun restore(
      instanceId: String,
      persisted: ViraAndroidSessionState,
      source: ViraAndroidLifecycleSource,
    ): Result<ViraAndroidSessionController> = runCatching {
      attach(source, ViraAndroidSessionState.restore(instanceId, persisted).getOrThrow().state)
    }

    private fun attach(
      source: ViraAndroidLifecycleSource,
      state: ViraAndroidSessionState,
    ): ViraAndroidSessionController {
      val controller = ViraAndroidSessionController(source, state)
      controller.unsubscribe = try {
        source.subscribe(controller::receive)
      } catch (_: Throwable) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_LIFECYCLE_SOURCE, "$.lifecycle.subscribe", "native lifecycle source subscription failed")
      }
      return controller
    }
  }
}
