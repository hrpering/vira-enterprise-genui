private fun viraAndroidPropAccepts(
  definition: ViraAndroidPropDefinition,
  value: ViraJson,
): Boolean = when (definition.type) {
  ViraAndroidCatalogValueType.STRING -> value is ViraJson.Str
  ViraAndroidCatalogValueType.NUMBER -> value is ViraJson.Num && value.value.isFinite() && value.value.toRawBits() != (-0.0).toRawBits()
  ViraAndroidCatalogValueType.BOOLEAN -> value is ViraJson.Bool
  ViraAndroidCatalogValueType.ENUM -> value is ViraJson.Str && definition.options?.contains(value.value) == true
}

private fun viraAndroidPayloadAccepts(
  definition: ViraAndroidEventPayloadDefinition,
  value: ViraJson,
): Boolean = when (definition.type) {
  ViraAndroidCatalogValueType.STRING -> value is ViraJson.Str
  ViraAndroidCatalogValueType.NUMBER -> value is ViraJson.Num && value.value.isFinite() && value.value.toRawBits() != (-0.0).toRawBits()
  ViraAndroidCatalogValueType.BOOLEAN -> value is ViraJson.Bool
  ViraAndroidCatalogValueType.ENUM -> value is ViraJson.Str && definition.options?.contains(value.value) == true
}

private fun viraAndroidBindingTypeMatches(
  expected: ViraAndroidCatalogValueType,
  source: ViraAndroidBindingSourceDefinition,
): Boolean = when (expected) {
  ViraAndroidCatalogValueType.STRING -> source.valueType == ViraAndroidBindingValueType.STRING
  ViraAndroidCatalogValueType.NUMBER -> source.valueType == ViraAndroidBindingValueType.NUMBER
  ViraAndroidCatalogValueType.BOOLEAN -> source.valueType == ViraAndroidBindingValueType.BOOLEAN
  ViraAndroidCatalogValueType.ENUM -> source.valueType == ViraAndroidBindingValueType.ENUM
}

private fun viraAndroidNodeIdentity(viewId: String, nodeId: String) = "$viewId\u0000$nodeId"
private fun viraAndroidPropIdentity(viewId: String, nodeId: String, prop: String) = "$viewId\u0000$nodeId\u0000$prop"
private fun viraAndroidInteractionIdentity(viewId: String, nodeId: String, event: String) = "$viewId\u0000$nodeId\u0000$event"
private fun viraAndroidSourceIdentity(kind: String, path: String) = "$kind:$path"

private fun viraAndroidInRepeatScope(
  document: StudioExperienceDocument,
  viewId: String,
  nodeId: String,
): Boolean {
  val view = document.views.firstOrNull { it.id == viewId } ?: return false
  val byId = view.nodes.associateBy { it.id }
  var current = byId[nodeId]
  val seen = mutableSetOf<String>()
  while (current != null && seen.add(current.id)) {
    if (current.repeat != null) return true
    current = current.parentId?.let(byId::get)
  }
  return false
}

internal fun validateViraAndroidDocumentProjectionIntegrity(
  document: StudioExperienceDocument,
  brand: ViraAndroidBrandProjection,
): Boolean {
  val components = brand.components.associateBy { it.ref }
  val actionEvents = brand.actions.map { it.event }.toSet()
  val viewIds = document.views.map { it.id }.toSet()
  val sourceMap = brand.dataSources.associateBy { viraAndroidSourceIdentity(it.kind.wire, it.path) }

  val nodeComponents = mutableMapOf<String, ViraAndroidComponentDefinition>()
  val nodeValues = mutableMapOf<String, StudioNode>()
  for (view in document.views) {
    for (node in view.nodes) {
      val component = components[node.component] ?: return false
      val identity = viraAndroidNodeIdentity(view.id, node.id)
      nodeComponents[identity] = component
      nodeValues[identity] = node
    }
  }

  val boundTargets = mutableSetOf<String>()
  for (binding in document.bindings) {
    val nodeIdentity = viraAndroidNodeIdentity(binding.viewId, binding.nodeId)
    val component = nodeComponents[nodeIdentity] ?: return false
    val node = nodeValues[nodeIdentity] ?: return false
    val definition = component.props.firstOrNull { it.key == binding.prop } ?: return false
    if (!definition.bindable) return false
    val target = viraAndroidPropIdentity(binding.viewId, binding.nodeId, binding.prop)
    if (!boundTargets.add(target) || binding.prop in node.props) return false
    val source = sourceMap[viraAndroidSourceIdentity(binding.source.kind.wire, binding.source.path)] ?: return false
    if (!viraAndroidBindingTypeMatches(definition.type, source)) return false
    if (source.kind == ViraAndroidBindingSourceKind.SCOPE &&
      !viraAndroidInRepeatScope(document, binding.viewId, binding.nodeId)
    ) return false
  }

  for (view in document.views) {
    for (node in view.nodes) {
      val component = nodeComponents[viraAndroidNodeIdentity(view.id, node.id)] ?: return false
      val definitions = component.props.associateBy { it.key }
      for ((key, value) in node.props) {
        val definition = definitions[key] ?: return false
        if (!viraAndroidPropAccepts(definition, value)) return false
      }
      for (definition in component.props.filter { it.required }) {
        if (definition.key in node.props) continue
        if (viraAndroidPropIdentity(view.id, node.id, definition.key) !in boundTargets) return false
      }
      val repeatSource = node.repeat?.source
      if (repeatSource != null) {
        val source = sourceMap[viraAndroidSourceIdentity(repeatSource.kind.wire, repeatSource.path)] ?: return false
        if (source.kind == ViraAndroidBindingSourceKind.SCOPE || source.valueType != ViraAndroidBindingValueType.ARRAY) return false
      }
    }
  }

  val interactionIdentities = mutableSetOf<String>()
  for (interaction in document.interactions) {
    val nodeIdentity = viraAndroidNodeIdentity(interaction.viewId, interaction.nodeId)
    val component = nodeComponents[nodeIdentity] ?: return false
    val event = component.events.firstOrNull { it.name == interaction.event } ?: return false
    if (interaction.actionEvent !in actionEvents) return false
    if (!interactionIdentities.add(viraAndroidInteractionIdentity(interaction.viewId, interaction.nodeId, interaction.event))) return false

    val outcomes = mutableSetOf<StudioInteractionOutcome>()
    for (route in interaction.routes) {
      if (route.viewId !in viewIds || !outcomes.add(route.outcome)) return false
    }

    val definitions = (event.payload ?: emptyList()).associateBy { it.key }
    val mappedKeys = mutableSetOf<String>()
    for (mapping in interaction.payloadBindings ?: emptyList()) {
      val definition = definitions[mapping.key] ?: return false
      if (!mappedKeys.add(mapping.key)) return false
      when (val sourceValue = mapping.source) {
        is StudioInteractionPayloadSource.Variant1 -> {
          if (sourceValue.value.kind != "literal" || !viraAndroidPayloadAccepts(definition, sourceValue.value.value)) return false
        }
        is StudioInteractionPayloadSource.Variant0 -> {
          val binding = sourceValue.value
          val source = sourceMap[viraAndroidSourceIdentity(binding.kind.wire, binding.path)] ?: return false
          if (!viraAndroidBindingTypeMatches(definition.type, source)) return false
          if (source.kind == ViraAndroidBindingSourceKind.SCOPE &&
            !viraAndroidInRepeatScope(document, interaction.viewId, interaction.nodeId)
          ) return false
        }
      }
    }
    for (definition in event.payload ?: emptyList()) {
      if (definition.required && definition.key !in mappedKeys) return false
    }
  }

  return true
}
