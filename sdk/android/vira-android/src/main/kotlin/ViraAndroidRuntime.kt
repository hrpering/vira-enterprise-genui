const val VIRA_ANDROID_MAX_REPEAT_ITEMS = 256
const val VIRA_ANDROID_MAX_EXPANDED_NODES = 4_096
private const val VIRA_ANDROID_ORDER_STRIDE: Long = 257

data class ViraAndroidRuntimeNodeModel(
  val id: String,
  val sourceNodeId: String,
  val component: String,
  val implementationId: String,
  val order: Long,
  val props: Map<String, ViraJson>,
  val eventPayloads: Map<String, Map<String, ViraJson>>,
  val parentId: String?,
  val slot: String?,
)

data class ViraAndroidRuntimeViewModel(
  val experienceId: String,
  val viewId: String,
  val nodes: List<ViraAndroidRuntimeNodeModel>,
)

data class ViraAndroidHostedDispatchCompletion(
  val actionType: String,
  val outcome: ViraAndroidHostActionOutcome,
  val viewId: String,
  val transitioned: Boolean,
)

class ViraAndroidRuntimeSession(
  val envelope: ViraAndroidMountEnvelope,
  val host: ViraAndroidHostAdapter,
  runtimeState: ViraAndroidRuntimeCoreState,
  val permissionPolicy: ViraAndroidPermissionPolicy,
) {
  private val components = envelope.brand.components.associateBy { it.ref }
  private val actionTypes = envelope.brand.actions.associate { it.event to it.actionType }
  private val runtimeCore = ViraAndroidRuntimeCoreSession(runtimeState)
  private var currentViewIdValue = envelope.document.entryView
  private var currentViewGenerationValue = 0L
  private var pendingRoutes: List<StudioInteractionRoute>? = null
  private var disposed = false

  init {
    requireViraAndroidMainThread("$.runtime")
    if (host.hostId != envelope.compatibility.hostId) {
      throw ViraAndroidIssue(
        ViraAndroidIssueCode.INVALID_HOST,
        "$.host.id",
        "native business Host identity does not match the resolved Host Capability identity",
      )
    }
  }

  fun currentViewId(): String {
    requireViraAndroidMainThread("$.runtime")
    return currentViewIdValue
  }

  fun currentViewGeneration(): Long {
    requireViraAndroidMainThread("$.runtime")
    return currentViewGenerationValue
  }

  fun currentRuntimeState(): ViraAndroidRuntimeCoreState {
    requireViraAndroidMainThread("$.runtime")
    return runtimeCore.state()
  }

  fun isDisposed(): Boolean {
    requireViraAndroidMainThread("$.runtime")
    return disposed
  }

  fun currentView(): Result<ViraAndroidRuntimeViewModel> = runCatching {
    requireViraAndroidMainThread("$.runtime")
    if (disposed) throw issue(ViraAndroidIssueCode.SESSION_DISPOSED, "$", "native Studio runtime session is disposed")
    val view = envelope.document.views.firstOrNull { it.id == currentViewIdValue }
      ?: throw issue(ViraAndroidIssueCode.VIEW_NOT_FOUND, "$.viewId", "current native Studio view does not exist")

    val byParent = mutableMapOf<String, MutableList<StudioNode>>()
    for (node in view.nodes) byParent.getOrPut(node.parentId ?: "\$root") { mutableListOf() } += node
    for (nodes in byParent.values) nodes.sortWith(compareBy<StudioNode> { it.order }.thenBy { it.id })

    val bindings = envelope.document.bindings
      .filter { it.viewId == currentViewIdValue }
      .groupBy { it.nodeId }
    val interactions = envelope.document.interactions
      .filter { it.viewId == currentViewIdValue }
      .groupBy { it.nodeId }
    val output = mutableListOf<ViraAndroidRuntimeNodeModel>()

    lateinit var expand: (StudioNode, String?, ViraJson?, String) -> Unit

    fun build(
      node: StudioNode,
      parentId: String?,
      scope: ViraJson?,
      suffix: String,
      order: Long,
    ) {
      if (output.size >= VIRA_ANDROID_MAX_EXPANDED_NODES) {
        throw issue(ViraAndroidIssueCode.REPEAT_LIMIT_EXCEEDED, "$.view.nodes", "native expanded node limit is $VIRA_ANDROID_MAX_EXPANDED_NODES")
      }
      val component = components[node.component]
        ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.document", "published component metadata is unavailable")
      val props = node.props.toMutableMap()
      for (binding in bindings[node.id].orEmpty()) {
        val value = readBindingSource(binding.source, scope).getOrThrow()
        val definition = component.props.firstOrNull { it.key == binding.prop }
          ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.bindings.${binding.prop}", "native binding target is unavailable")
        if (!propAccepts(definition, value)) {
          throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.bindings.${binding.prop}", "resolved binding does not match native component prop type")
        }
        props[binding.prop] = value
      }

      val eventPayloads = mutableMapOf<String, Map<String, ViraJson>>()
      for (interaction in interactions[node.id].orEmpty()) {
        val payload = mutableMapOf<String, ViraJson>()
        for (mapping in interaction.payloadBindings.orEmpty()) {
          payload[mapping.key] = readPayloadSource(mapping.source, scope).getOrThrow()
        }
        eventPayloads[interaction.event] = payload
      }

      val id = runtimeId(node.id, suffix)
      output += ViraAndroidRuntimeNodeModel(
        id = id,
        sourceNodeId = node.id,
        component = node.component,
        implementationId = component.implementationId,
        order = order,
        props = props.toMap(),
        eventPayloads = eventPayloads.toMap(),
        parentId = parentId,
        slot = if (parentId == null) null else node.slot,
      )
      for (child in byParent[node.id].orEmpty()) expand(child, id, scope, suffix)
    }

    expand = { node, parentId, scope, parentSuffix ->
      if (!node.order.isFinite() || node.order < 0 || node.order % 1.0 != 0.0 || node.order > VIRA_ANDROID_MAX_SAFE_INTEGER.toDouble()) {
        throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.node.order", "native node order is invalid")
      }
      val baseOrder = node.order.toLong()
      val repeat = node.repeat
      if (repeat == null) {
        build(node, parentId, scope, parentSuffix, baseOrder * VIRA_ANDROID_ORDER_STRIDE)
      } else {
        val collection = readRepeatSource(repeat.source).getOrThrow().asArrayOrNull()
          ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.repeat.${node.id}", "native repeat source must resolve to an array")
        if (collection.size > VIRA_ANDROID_MAX_REPEAT_ITEMS) {
          throw issue(ViraAndroidIssueCode.REPEAT_LIMIT_EXCEEDED, "$.repeat.${node.id}", "native repeat item limit is $VIRA_ANDROID_MAX_REPEAT_ITEMS")
        }
        for ((index, item) in collection.withIndex()) {
          val segment = "${node.id}-$index"
          val suffix = if (parentSuffix.isEmpty()) segment else "$parentSuffix.$segment"
          build(node, parentId, item, suffix, baseOrder * VIRA_ANDROID_ORDER_STRIDE + index)
        }
      }
    }

    for (root in byParent["\$root"].orEmpty()) expand(root, null, null, "")
    ViraAndroidRuntimeViewModel(envelope.document.id, currentViewIdValue, output.toList())
  }

  suspend fun dispatch(
    runtimeNodeId: String,
    event: String,
    externalPayload: Map<String, ViraJson>? = null,
  ): Result<ViraAndroidHostedDispatchCompletion> = runCatching {
    requireViraAndroidMainThread("$.runtime")
    if (disposed) throw issue(ViraAndroidIssueCode.SESSION_DISPOSED, "$", "native Studio runtime session is disposed")
    if (pendingRoutes != null) throw issue(ViraAndroidIssueCode.ACTION_PENDING, "$.event", "one native Studio action is already awaiting a Host outcome")
    val model = currentView().getOrThrow().nodes.firstOrNull { it.id == runtimeNodeId }
      ?: throw issue(ViraAndroidIssueCode.INTERACTION_NOT_FOUND, "$.runtimeNodeId", "native runtime node is unavailable")
    val interaction = envelope.document.interactions.firstOrNull {
      it.viewId == currentViewIdValue && it.nodeId == model.sourceNodeId && it.event == event
    } ?: throw issue(ViraAndroidIssueCode.INTERACTION_NOT_FOUND, "$.event", "no published native Studio interaction matches this node event")
    val actionType = actionTypes[interaction.actionEvent]
      ?: throw issue(ViraAndroidIssueCode.UNMAPPED_ACTION, "$.action", "published native Studio action is unmapped")
    val component = components[model.component]
      ?: throw issue(ViraAndroidIssueCode.DATA_VALUE_INVALID, "$.component", "native component metadata is unavailable")

    val payload = externalPayload.orEmpty().toMutableMap()
    for ((key, value) in model.eventPayloads[event].orEmpty()) payload[key] = value
    if (!isRuntimeCoreBuiltIn(actionType) && !validatePayload(component, event, payload)) {
      throw issue(ViraAndroidIssueCode.INVALID_EVENT_PAYLOAD, "$.event.payload", "native event payload violates the projected component contract")
    }

    val permission = permissionPolicy.effect(ViraAndroidPermissionSubject.ACTION, actionType)
    val hostRequired = runtimeCore.process(actionType, payload, permission).getOrThrow()
    if (!hostRequired) {
      val completion = complete(interaction.routes, ViraAndroidHostActionOutcome.SUCCESS)
      return@runCatching ViraAndroidHostedDispatchCompletion(
        actionType,
        ViraAndroidHostActionOutcome.SUCCESS,
        completion.first,
        completion.second,
      )
    }

    pendingRoutes = interaction.routes
    val hostResult = try {
      host.dispatch(ViraAndroidHostActionDescriptor(actionType, payload)).getOrThrow()
    } catch (error: Throwable) {
      requireViraAndroidMainThread("$.runtime")
      val routes = pendingRoutes.orEmpty()
      pendingRoutes = null
      complete(routes, ViraAndroidHostActionOutcome.ERROR)
      throw error
    }
    requireViraAndroidMainThread("$.runtime")
    if (disposed) {
      pendingRoutes = null
      throw issue(ViraAndroidIssueCode.DISPOSED, "$", "native Studio runtime was disposed during Host dispatch")
    }
    val routes = pendingRoutes ?: throw issue(ViraAndroidIssueCode.DISPOSED, "$", "native Studio runtime lost pending Host ownership")
    pendingRoutes = null
    val completion = complete(routes, hostResult.outcome)
    ViraAndroidHostedDispatchCompletion(actionType, hostResult.outcome, completion.first, completion.second)
  }

  fun dispose() {
    requireViraAndroidMainThread("$.runtime")
    if (disposed) return
    disposed = true
    pendingRoutes = null
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
    if (item == null || !path.startsWith("currentItem.")) return null
    var current = item
    for (segment in path.removePrefix("currentItem.").split('.')) {
      current = current.asObjectOrNull()?.get(segment) ?: return null
    }
    return current
  }

  private fun complete(routes: List<StudioInteractionRoute>, outcome: ViraAndroidHostActionOutcome): Pair<String, Boolean> {
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
    if (!payload.keys.all { it in fields }) return false
    if (definition.payload.orEmpty().any { it.required && it.key !in payload }) return false
    return payload.all { (key, value) -> payloadAccepts(fields[key] ?: return false, value) }
  }

  private fun propAccepts(definition: ViraAndroidPropDefinition, value: ViraJson): Boolean = when (definition.type) {
    ViraAndroidCatalogValueType.STRING -> value is ViraJson.Str
    ViraAndroidCatalogValueType.NUMBER -> value is ViraJson.Num && value.value.isFinite() && value.value.toRawBits() != (-0.0).toRawBits()
    ViraAndroidCatalogValueType.BOOLEAN -> value is ViraJson.Bool
    ViraAndroidCatalogValueType.ENUM -> value is ViraJson.Str && definition.options?.contains(value.value) == true
  }

  private fun payloadAccepts(definition: ViraAndroidEventPayloadDefinition, value: ViraJson): Boolean = when (definition.type) {
    ViraAndroidCatalogValueType.STRING -> value is ViraJson.Str
    ViraAndroidCatalogValueType.NUMBER -> value is ViraJson.Num && value.value.isFinite() && value.value.toRawBits() != (-0.0).toRawBits()
    ViraAndroidCatalogValueType.BOOLEAN -> value is ViraJson.Bool
    ViraAndroidCatalogValueType.ENUM -> value is ViraJson.Str && definition.options?.contains(value.value) == true
  }

  private fun runtimeId(sourceId: String, suffix: String): String = if (suffix.isEmpty()) sourceId else "$sourceId~$suffix"
  private fun isRuntimeCoreBuiltIn(actionType: String) = actionType == "runtime.patch.apply" || actionType == "runtime.lifecycle.transition"
  private fun issue(code: ViraAndroidIssueCode, path: String, message: String) = ViraAndroidIssue(code, path, message)
}
