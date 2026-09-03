enum class ViraAndroidHostActionOutcome(val wire: String) {
  SUCCESS("success"),
  EMPTY("empty"),
  ERROR("error");
}

data class ViraAndroidHostSnapshot(
  val revision: Long,
  val state: Map<String, ViraJson>,
  val domain: Map<String, ViraJson>,
) {
  internal fun isCanonical(): Boolean {
    if (revision < 0 || revision > VIRA_ANDROID_MAX_SAFE_INTEGER) return false
    return ViraAndroidCanonicalJson.isCanonical(ViraJson.Obj(state)) &&
      ViraAndroidCanonicalJson.isCanonical(ViraJson.Obj(domain))
  }
}

data class ViraAndroidHostActionDescriptor(
  val type: String,
  val payload: Map<String, ViraJson>,
)

data class ViraAndroidHostActionResult(
  val outcome: ViraAndroidHostActionOutcome,
  val snapshot: ViraAndroidHostSnapshot? = null,
)

interface ViraAndroidHostBridge {
  val version: String
  val id: String
  fun snapshot(): ViraAndroidHostSnapshot
  suspend fun dispatch(action: ViraAndroidHostActionDescriptor): ViraAndroidHostActionResult
  fun subscribe(listener: (ViraAndroidHostSnapshot) -> Unit): () -> Unit
}

enum class ViraAndroidHostDataRoot {
  STATE,
  DOMAIN,
}

class ViraAndroidHostAdapter private constructor(
  private val bridge: ViraAndroidHostBridge,
  initial: ViraAndroidHostSnapshot,
) {
  val hostId: String = bridge.id
  private val lock = Any()
  private var current: ViraAndroidHostSnapshot = initial
  private var subscriptionFault: ViraAndroidIssue? = null
  private var disposed = false
  private var unsubscribe: (() -> Unit)? = null
  private val listeners = linkedSetOf<(ViraAndroidHostSnapshot) -> Unit>()

  private data class SnapshotAcceptance(
    val issue: ViraAndroidIssue? = null,
    val callbacks: List<(ViraAndroidHostSnapshot) -> Unit> = emptyList(),
  )

  private fun acceptSnapshot(
    snapshot: ViraAndroidHostSnapshot,
    poisonOnFailure: Boolean,
  ): ViraAndroidIssue? {
    val acceptance = synchronized(lock) {
      if (disposed) return@synchronized SnapshotAcceptance(issue = ViraAndroidIssue(
        ViraAndroidIssueCode.DISPOSED,
        "$",
        "native Host adapter is disposed",
      ))
      if (!snapshot.isCanonical()) {
        val invalid = ViraAndroidIssue(
          ViraAndroidIssueCode.DATA_VALUE_INVALID,
          "$.snapshot",
          "native Host snapshot is not canonical JSON",
        )
        if (poisonOnFailure) subscriptionFault = invalid
        return@synchronized SnapshotAcceptance(issue = invalid)
      }
      if (snapshot.revision < current.revision) {
        val stale = ViraAndroidIssue(
          ViraAndroidIssueCode.STALE_SNAPSHOT,
          "$.snapshot.revision",
          "native Host snapshot revision regressed",
        )
        if (poisonOnFailure) subscriptionFault = stale
        return@synchronized SnapshotAcceptance(issue = stale)
      }
      if (snapshot.revision == current.revision) return@synchronized SnapshotAcceptance()
      current = snapshot
      SnapshotAcceptance(callbacks = listeners.toList())
    }
    if (acceptance.issue == null) {
      acceptance.callbacks.forEach { it(snapshot) }
    }
    return acceptance.issue
  }

  fun snapshot(): Result<ViraAndroidHostSnapshot> = runCatching {
    synchronized(lock) {
      if (disposed) throw ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "native Host adapter is disposed")
      subscriptionFault?.let { throw it }
      current
    }
  }

  fun read(root: ViraAndroidHostDataRoot, path: String): Result<ViraJson> = runCatching {
    if (!ViraAndroidSemanticIdentifier.isNamespace(path)) {
      throw ViraAndroidIssue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.path", "native Host data path is invalid")
    }
    var currentValue: ViraJson = when (root) {
      ViraAndroidHostDataRoot.STATE -> ViraJson.Obj(snapshot().getOrThrow().state)
      ViraAndroidHostDataRoot.DOMAIN -> ViraJson.Obj(snapshot().getOrThrow().domain)
    }
    for (segment in path.split('.')) {
      currentValue = currentValue.asObjectOrNull()?.get(segment)
        ?: throw ViraAndroidIssue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.path", "native Host data path is unavailable")
    }
    currentValue
  }

  suspend fun dispatch(action: ViraAndroidHostActionDescriptor): Result<ViraAndroidHostActionResult> = runCatching {
    synchronized(lock) {
      if (disposed) throw ViraAndroidIssue(ViraAndroidIssueCode.DISPOSED, "$", "native Host adapter is disposed")
      subscriptionFault?.let { throw it }
    }
    if (!ViraAndroidSemanticIdentifier.isNamespace(action.type)) {
      throw ViraAndroidIssue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.action.type", "native Host action type is invalid")
    }
    if (!ViraAndroidCanonicalJson.isCanonical(ViraJson.Obj(action.payload))) {
      throw ViraAndroidIssue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.action.payload", "native Host action payload is not canonical JSON")
    }
    val result = bridge.dispatch(action)
    result.snapshot?.let { snapshot ->
      acceptSnapshot(snapshot, poisonOnFailure = false)?.let { throw it }
    }
    result
  }

  fun subscribe(listener: (ViraAndroidHostSnapshot) -> Unit): () -> Unit {
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
    val callback = synchronized(lock) {
      if (disposed) return
      disposed = true
      listeners.clear()
      val existing = unsubscribe
      unsubscribe = null
      existing
    }
    callback?.invoke()
  }

  companion object {
    fun create(bridge: ViraAndroidHostBridge): Result<ViraAndroidHostAdapter> = runCatching {
      if (bridge.version != "1" || !ViraAndroidSemanticIdentifier.isNamespace(bridge.id, requiresDot = true)) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_HOST, "$.host", "native Host bridge identity is invalid")
      }
      val initial = bridge.snapshot()
      if (!initial.isCanonical()) {
        throw ViraAndroidIssue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.snapshot", "initial native Host snapshot is invalid")
      }
      val adapter = ViraAndroidHostAdapter(bridge, initial)
      val teardown = bridge.subscribe { snapshot -> adapter.acceptSnapshot(snapshot, poisonOnFailure = true) }
      synchronized(adapter.lock) { adapter.unsubscribe = teardown }
      adapter
    }.recoverCatching { error ->
      if (error is ViraAndroidIssue) throw error
      throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_HOST, "$.host", "native Host bridge failed")
    }
  }
}

const val VIRA_ANDROID_MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L
