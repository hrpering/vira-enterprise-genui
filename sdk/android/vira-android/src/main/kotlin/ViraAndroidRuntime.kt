import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

const val VIRA_ANDROID_MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L

sealed interface ViraAndroidHostActionOutcome {
  data object Succeeded : ViraAndroidHostActionOutcome
  data object Cancelled : ViraAndroidHostActionOutcome
  data object Failed : ViraAndroidHostActionOutcome

  val wire: String
    get() = when (this) {
      Succeeded -> "succeeded"
      Cancelled -> "cancelled"
      Failed -> "failed"
    }
}

data class ViraAndroidHostActionRequest(
  val actionId: String,
  val payload: Map<String, ViraJson>,
)

data class ViraAndroidHostDataReadRequest(
  val root: ViraAndroidHostDataRoot,
  val path: String,
)

fun interface ViraAndroidHostDataReader {
  fun read(request: ViraAndroidHostDataReadRequest): Result<ViraJson>
}

fun interface ViraAndroidHostActionHandler {
  fun execute(request: ViraAndroidHostActionRequest): Result<ViraAndroidHostActionOutcome>
}

class ViraAndroidHost(
  private val dataReader: ViraAndroidHostDataReader,
  private val actionHandler: ViraAndroidHostActionHandler,
) {
  fun read(root: ViraAndroidHostDataRoot, path: String): Result<ViraJson> =
    dataReader.read(ViraAndroidHostDataReadRequest(root, path))

  fun execute(actionId: String, payload: Map<String, ViraJson>): Result<ViraAndroidHostActionOutcome> =
    actionHandler.execute(ViraAndroidHostActionRequest(actionId, payload))
}

data class ViraAndroidRuntimeSnapshot(
  val viewId: String,
  val viewGeneration: Long,
  val actionPending: Boolean,
)

data class ViraAndroidRuntimeTransition(
  val actionId: String,
  val payload: Map<String, ViraJson>,
  val viewId: String,
  val viewGeneration: Long,
  val pending: Boolean,
)

data class ViraAndroidRuntimeCompletion(
  val viewId: String,
  val viewGeneration: Long,
  val transitioned: Boolean,
)

class ViraAndroidRuntime(
  val experience: StudioExperience,
  private val host: ViraAndroidHost,
  permissionPolicy: ViraAndroidPermissionPolicy,
  private val now: () -> Long = { System.currentTimeMillis() },
) {
  private val lock = ReentrantLock()
  private val permissionEvaluator = ViraAndroidPermissionEvaluator(permissionPolicy)
  private val nodeById = experience.nodes.associateBy { it.id }
  private val interactionById = experience.interactions.associateBy { it.id }
  private val viewsById = experience.views.associateBy { it.id }
  private var currentViewIdValue = experience.initialViewId
  private var currentViewGenerationValue = 0L
  private var actionPendingValue = false
  private var pendingRoutes: List<StudioInteractionRoute>? = null

  init {
    require(viewsById.containsKey(currentViewIdValue)) {
      issue(ViraAndroidIssueCode.VIEW_NOT_FOUND, "$.initialViewId", "native runtime initial view does not exist")
    }
  }

  fun snapshot(): ViraAndroidRuntimeSnapshot = lock.withLock {
    ViraAndroidRuntimeSnapshot(
      viewId = currentViewIdValue,
      viewGeneration = currentViewGenerationValue,
      actionPending = actionPendingValue,
    )
  }

  fun render(rendererRegistry: ViraAndroidRendererRegistry): ViraAndroidRenderedNode = lock.withLock {
    val view = viewsById[currentViewIdValue]
      ?: throw issue(ViraAndroidIssueCode.VIEW_NOT_FOUND, "$.view", "native runtime current view does not exist")
    val context = RenderContext(repeatExpansions = 0)
    renderNode(view.rootNodeId, null, rendererRegistry, context)
  }

  fun dispatch(interactionId: String, payload: Map<String, ViraJson>): Result<ViraAndroidRuntimeTransition> = lock.withLock {
    if (actionPendingValue) {
      return Result.failure(issue(ViraAndroidIssueCode.ACTION_PENDING, "$.action", "native runtime action is already pending"))
    }
    val interaction = interactionById[interactionId]
      ?: return Result.failure(issue(ViraAndroidIssueCode.INTERACTION_NOT_FOUND, "$.interactionId", "native interaction does not exist"))
    val component = experience.components[interaction.component]
      ?: return Result.failure(issue(ViraAndroidIssueCode.INVALID_EVENT_PAYLOAD, "$.component", "native interaction component is missing"))
    if (!validatePayload(component, interaction.event, payload)) {
      return Result.failure(issue(ViraAndroidIssueCode.INVALID_EVENT_PAYLOAD, "$.payload", "native interaction payload is invalid"))
    }
    val mappedAction = experience.actions.firstOrNull { it.id == interaction.actionId }
      ?: return Result.failure(issue(ViraAndroidIssueCode.UNMAPPED_ACTION, "$.actionId", "native interaction action is unmapped"))
    val policy = permissionEvaluator.evaluate(mappedAction.permission)
    if (!policy.allowed) {
      val code = if (policy.requiresConfirmation) {
        ViraAndroidIssueCode.CONFIRMATION_REQUIRED
      } else {
        ViraAndroidIssueCode.PERMISSION_DENIED
      }
      return Result.failure(issue(code, "$.permission", policy.reason))
    }

    val hostPayload = linkedMapOf<String, ViraJson>()
    for ((key, source) in interaction.payload) {
      val value = readPayloadSource(source, null).getOrElse { return Result.failure(it) }
      hostPayload[key] = value
    }
    hostPayload.putAll(payload)

    val hostResult = host.execute(interaction.actionId, hostPayload)
    val hostOutcome = hostResult.getOrElse { return Result.failure(it) }
    actionPendingValue = true
    pendingRoutes = interaction.routes

    Result.success(
      ViraAndroidRuntimeTransition(
        actionId = interaction.actionId,
        payload = hostPayload,
        viewId = currentViewIdValue,
        viewGeneration = currentViewGenerationValue,
        pending = true,
      ),
    ).also {
      complete(hostOutcome)
    }
  }

  fun complete(outcome: ViraAndroidHostActionOutcome): ViraAndroidRuntimeCompletion = lock.withLock {
    val routes = pendingRoutes
      ?: return ViraAndroidRuntimeCompletion(currentViewIdValue, currentViewGenerationValue, false)
    val before = currentViewIdValue
    val (after, transitioned) = completeLocked(routes, outcome)
    actionPendingValue = false
    pendingRoutes = null
    return ViraAndroidRuntimeCompletion(
      viewId = after,
      viewGeneration = currentViewGenerationValue,
      transitioned = transitioned && before != after,
    )
  }

  private fun renderNode(
    nodeId: String,
    scope: ViraJson?,
    rendererRegistry: ViraAndroidRendererRegistry,
    context: RenderContext,
  ): ViraAndroidRenderedNode {
    val node = nodeById[nodeId]
      ?: throw issue(ViraAndroidIssueCode.VIEW_NOT_FOUND, "$.node", "native runtime node does not exist")
    val component = experience.components[node.component]
      ?: throw issue(ViraAndroidIssueCode.MISSING_RENDERER, "$.component", "native runtime component is missing")
    val renderer = rendererRegistry.renderer(node.component)
      ?: throw issue(ViraAndroidIssueCode.MISSING_RENDERER, "$.renderer", "native renderer is missing")

    val props = linkedMapOf<String, ViraJson>()
    for ((key, value) in node.props) props[key] = value
    for ((key, bindingId) in node.bindings) {
      val binding = experience.bindings[bindingId]
        ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.binding", "native binding does not exist")
      props[key] = readBindingSource(binding.source, scope).getOrElse { throw it }
    }

    val renderedChildren = mutableListOf<ViraAndroidRenderedNode>()
    for (childId in node.children) {
      renderedChildren += renderNode(childId, scope, rendererRegistry, context)
    }

    node.repeat?.let { repeat ->
      val array = readRepeatSource(repeat.source).getOrElse { throw it }.asArrayOrNull()
        ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.repeat", "native repeat source is not an array")
      if (context.repeatExpansions + array.size > experience.limits.maxRepeatExpansions) {
        throw issue(ViraAndroidIssueCode.REPEAT_LIMIT_EXCEEDED, "$.repeat", "native repeat expansion limit exceeded")
      }
      context.repeatExpansions += array.size
      for (item in array) {
        renderedChildren += renderNode(repeat.templateNodeId, item, rendererRegistry, context)
      }
    }

    return renderer.render(
      ViraAndroidRendererInput(
        nodeId = node.id,
        component = component,
        props = props,
        children = renderedChildren,
      ),
    ).getOrElse {
      throw issue(ViraAndroidIssueCode.RENDERER_FAILED, "$.renderer", it.message ?: "native renderer failed")
    }
  }

  private fun readBindingSource(source: StudioBindingSource, scope: ViraJson?): Result<ViraJson> = when (source.kind) {
    StudioBindingSourceKind.SCOPE -> runCatching {
      scopeValue(scope, source.path)
        ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.binding", "native scope value is unavailable")
    }
    StudioBindingSourceKind.STATE -> host.read(ViraAndroidHostDataRoot.STATE, source.path)
    StudioBindingSourceKind.DOMAIN -> host.read(ViraAndroidHostDataRoot.DOMAIN, source.path)
  }

  private fun readRepeatSource(source: StudioRepeatSource): Result<ViraJson> = when (source.kind) {
    StudioRepeatSourceKind.STATE -> host.read(ViraAndroidHostDataRoot.STATE, source.path)
    StudioRepeatSourceKind.DOMAIN -> host.read(ViraAndroidHostDataRoot.DOMAIN, source.path)
  }

  private fun readPayloadSource(source: StudioInteractionPayloadSource, scope: ViraJson?): Result<ViraJson> = when (source) {
    is StudioInteractionPayloadSource.Variant0 -> readBindingSource(source.value, scope)
    is StudioInteractionPayloadSource.Variant1 -> Result.success(source.value.value)
  }

  private fun scopeValue(item: ViraJson?, path: String): ViraJson? {
    if (!path.startsWith("currentItem.")) return null
    var current = item ?: return null
    for (segment in path.removePrefix("currentItem.").split('.')) {
      current = current.asObjectOrNull()?.get(segment) ?: return null
    }
    return current
  }

  private fun completeLocked(routes: List<StudioInteractionRoute>, outcome: ViraAndroidHostActionOutcome): Pair<String, Boolean> {
    val route = routes.firstOrNull { it.outcome.wire == outcome.wire } ?: return currentViewIdValue to false
    if (currentViewGenerationValue >= VIRA_ANDROID_MAX_SAFE_INTEGER) {
      throw issue(ViraAndroidIssueCode.REVISION_OVERFLOW, "$.viewGeneration", "native runtime view generation overflowed")
    }
    currentViewGenerationValue += 1
    currentViewIdValue = route.viewId
    return currentViewIdValue to true
  }

  private fun validatePayload(
    component: ViraAndroidComponentDefinition,
    event: String,
    payload: Map<String, ViraJson>,
  ): Boolean {
    val definition = component.events.firstOrNull { it.name == event } ?: return false
    val fields = definition.payload.orEmpty().associateBy { it.key }
    if (payload.keys.any { it !in fields }) return false
    for ((key, field) in fields) {
      val value = payload[key]
      if (field.required == true && value == null) return false
      if (value != null && !matchesPayloadType(field.type, value)) return false
    }
    return true
  }

  private fun matchesPayloadType(type: StudioInteractionPayloadType, value: ViraJson): Boolean = when (type) {
    StudioInteractionPayloadType.STRING -> value is ViraJson.StringValue
    StudioInteractionPayloadType.NUMBER -> value is ViraJson.NumberValue
    StudioInteractionPayloadType.BOOLEAN -> value is ViraJson.BooleanValue
    StudioInteractionPayloadType.OBJECT -> value is ViraJson.ObjectValue
    StudioInteractionPayloadType.ARRAY -> value is ViraJson.ArrayValue
    StudioInteractionPayloadType.NULL -> value is ViraJson.NullValue
  }

  private fun issue(code: ViraAndroidIssueCode, path: String, message: String) =
    ViraAndroidIssue(code, path, message)

  private data class RenderContext(
    var repeatExpansions: Int,
  )
}