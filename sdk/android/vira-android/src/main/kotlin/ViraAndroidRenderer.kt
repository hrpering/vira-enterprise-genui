import android.content.Context
import android.view.View

class ViraAndroidRenderEventEmitter internal constructor(
  private val session: ViraAndroidRuntimeSession,
  private val runtimeNodeId: String,
  private val expectedViewId: String,
  private val expectedViewGeneration: Long,
  private val expectedHostRevision: Long,
  private val allowedEvents: Set<String>,
  private val onDispatchCompletion: (() -> Unit)? = null,
) {
  suspend fun emit(
    event: String,
    payload: Map<String, ViraJson>? = null,
  ): Result<ViraAndroidHostedDispatchCompletion> {
    freshnessIssue()?.let { return Result.failure(it) }
    if (event !in allowedEvents) {
      return Result.failure(ViraAndroidIssue(
        ViraAndroidIssueCode.INTERACTION_NOT_FOUND,
        "$.event",
        "native renderer event is not declared by the active component",
      ))
    }
    val result = session.dispatch(runtimeNodeId, event, payload)
    onDispatchCompletion?.invoke()
    return result
  }

  private fun freshnessIssue(): ViraAndroidIssue? {
    if (session.currentViewId() != expectedViewId || session.currentViewGeneration() != expectedViewGeneration) {
      return ViraAndroidIssue(
        ViraAndroidIssueCode.INTERACTION_NOT_FOUND,
        "$.runtimeNodeId",
        "native renderer binding belongs to an inactive render generation",
      )
    }
    val snapshot = session.host.snapshot().getOrElse { error ->
      return if (error is ViraAndroidIssue) error else ViraAndroidIssue(
        ViraAndroidIssueCode.INVALID_HOST,
        "$.host",
        "native Host snapshot is unavailable",
      )
    }
    if (snapshot.revision != expectedHostRevision) {
      return ViraAndroidIssue(
        ViraAndroidIssueCode.INTERACTION_NOT_FOUND,
        "$.runtimeNodeId",
        "native renderer binding is stale after a Host state revision",
      )
    }
    return null
  }
}

data class ViraAndroidRenderContext(
  val androidContext: Context,
  val component: String,
  val runtimeNodeId: String,
  val sourceNodeId: String,
  val props: Map<String, ViraJson>,
  val slots: Map<String, List<View>>,
  val emitter: ViraAndroidRenderEventEmitter,
)

interface ViraAndroidNativeRenderer {
  val implementationId: String
  fun render(context: ViraAndroidRenderContext): View
}

class ViraAndroidRendererRegistry private constructor(
  private val renderers: Map<String, ViraAndroidNativeRenderer>,
) {
  fun render(
    androidContext: Context,
    session: ViraAndroidRuntimeSession,
    onDispatchCompletion: (() -> Unit)? = null,
  ): Result<List<View>> = runCatching {
    val hostRevision = session.host.snapshot().getOrThrow().revision
    val current = session.currentView().getOrThrow()
    val viewGeneration = session.currentViewGeneration()
    val componentMap = session.envelope.brand.components.associateBy { it.ref }
    val nodeMap = current.nodes.associateBy { it.id }
    val childMap = mutableMapOf<Pair<String, String>, MutableList<ViraAndroidRuntimeNodeModel>>()
    val roots = mutableListOf<ViraAndroidRuntimeNodeModel>()

    for (node in current.nodes) {
      val component = componentMap[node.component]
        ?: throw issue(ViraAndroidIssueCode.INVALID_RENDERER_REGISTRY, "$.view.nodes", "native runtime component is unavailable")
      if (component.implementationId != node.implementationId) {
        throw issue(ViraAndroidIssueCode.INVALID_RENDERER_REGISTRY, "$.view.nodes", "native runtime node implementation identity is inconsistent with the active Brand")
      }
      val parentId = node.parentId
      if (parentId == null) {
        roots += node
        continue
      }
      val slot = node.slot ?: throw issue(ViraAndroidIssueCode.INVALID_SLOT_TARGET, "$.view.nodes", "native runtime child has no slot")
      val parent = nodeMap[parentId]
        ?: throw issue(ViraAndroidIssueCode.INVALID_SLOT_TARGET, "$.view.nodes", "native runtime child parent is unavailable")
      val parentComponent = componentMap[parent.component]
        ?: throw issue(ViraAndroidIssueCode.INVALID_SLOT_TARGET, "$.view.nodes", "native parent component is unavailable")
      if (slot !in parentComponent.slots) {
        throw issue(ViraAndroidIssueCode.INVALID_SLOT_TARGET, "$.view.nodes", "native runtime child targets an invalid component slot")
      }
      childMap.getOrPut(parentId to slot) { mutableListOf() } += node
    }

    val comparator = compareBy<ViraAndroidRuntimeNodeModel> { it.order }.thenBy { it.id }
    roots.sortWith(comparator)
    childMap.values.forEach { it.sortWith(comparator) }

    val active = mutableSetOf<String>()
    val rendered = mutableSetOf<String>()

    fun renderNode(node: ViraAndroidRuntimeNodeModel): View {
      if (node.id in active || node.id in rendered) {
        throw issue(ViraAndroidIssueCode.NODE_CYCLE, "$.view.nodes", "native runtime node is cyclic or reachable more than once")
      }
      val component = componentMap[node.component]
        ?: throw issue(ViraAndroidIssueCode.MISSING_RENDERER, "$.renderers", "native component metadata is unavailable")
      val renderer = renderers[node.implementationId]
        ?: throw issue(ViraAndroidIssueCode.MISSING_RENDERER, "$.renderers", "trusted local native renderer is unavailable")
      active += node.id
      try {
        val slots = linkedMapOf<String, List<View>>()
        for (slot in component.slots) {
          slots[slot] = childMap[node.id to slot].orEmpty().map(::renderNode)
        }
        val emitter = ViraAndroidRenderEventEmitter(
          session = session,
          runtimeNodeId = node.id,
          expectedViewId = current.viewId,
          expectedViewGeneration = viewGeneration,
          expectedHostRevision = hostRevision,
          allowedEvents = component.events.map { it.name }.toSet(),
          onDispatchCompletion = onDispatchCompletion,
        )
        val output = try {
          renderer.render(ViraAndroidRenderContext(
            androidContext = androidContext,
            component = node.component,
            runtimeNodeId = node.id,
            sourceNodeId = node.sourceNodeId,
            props = node.props,
            slots = slots,
            emitter = emitter,
          ))
        } catch (_: Throwable) {
          throw issue(ViraAndroidIssueCode.RENDERER_FAILED, "$.renderers", "trusted local native renderer failed")
        }
        rendered += node.id
        return output
      } finally {
        active -= node.id
      }
    }

    val output = roots.map(::renderNode)
    if (rendered.size != current.nodes.size) {
      throw issue(ViraAndroidIssueCode.INVALID_SLOT_TARGET, "$.view.nodes", "native runtime contains nodes unreachable from a root component")
    }
    output
  }

  companion object {
    fun create(
      envelope: ViraAndroidMountEnvelope,
      renderers: List<ViraAndroidNativeRenderer>,
    ): Result<ViraAndroidRendererRegistry> = runCatching {
      val expected = envelope.brand.components.map { it.implementationId }.toSet()
      val byId = mutableMapOf<String, ViraAndroidNativeRenderer>()
      for (renderer in renderers) {
        val id = renderer.implementationId
        if (!ViraAndroidSemanticIdentifier.isNamespace(id, requiresDot = true)) {
          throw issue(ViraAndroidIssueCode.INVALID_RENDERER_REGISTRY, "$.renderers", "native renderer implementation id is invalid")
        }
        if (id !in expected) {
          throw issue(ViraAndroidIssueCode.EXTRA_RENDERER, "$.renderers", "native renderer registry contains an implementation outside the active Brand mapping")
        }
        if (byId.put(id, renderer) != null) {
          throw issue(ViraAndroidIssueCode.INVALID_RENDERER_REGISTRY, "$.renderers", "native renderer implementation id is duplicated")
        }
      }
      if (byId.size != expected.size) {
        throw issue(ViraAndroidIssueCode.MISSING_RENDERER, "$.renderers", "active Brand mapping is missing a trusted local native renderer")
      }
      ViraAndroidRendererRegistry(byId.toMap())
    }

    private fun issue(code: ViraAndroidIssueCode, path: String, message: String) = ViraAndroidIssue(code, path, message)
  }
}

private fun issue(code: ViraAndroidIssueCode, path: String, message: String) = ViraAndroidIssue(code, path, message)
