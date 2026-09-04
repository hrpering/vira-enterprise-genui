private const val VIRA_ANDROID_STUDIO_MAX_VIEWS = 32
private const val VIRA_ANDROID_STUDIO_MAX_NODES_PER_VIEW = 256
private const val VIRA_ANDROID_STUDIO_MAX_BINDINGS = 512
private const val VIRA_ANDROID_STUDIO_MAX_INTERACTIONS = 512
private const val VIRA_ANDROID_STUDIO_MAX_ACTION_PAYLOAD_BINDINGS = 64

internal fun validateViraAndroidDocumentGraphSafety(document: StudioExperienceDocument): Boolean {
  if (document.views.size > VIRA_ANDROID_STUDIO_MAX_VIEWS ||
    document.bindings.size > VIRA_ANDROID_STUDIO_MAX_BINDINGS ||
    document.interactions.size > VIRA_ANDROID_STUDIO_MAX_INTERACTIONS ||
    document.interactions.any { (it.payloadBindings?.size ?: 0) > VIRA_ANDROID_STUDIO_MAX_ACTION_PAYLOAD_BINDINGS }
  ) return false

  val viewIds = document.views.map { it.id }
  if (viewIds.toSet().size != viewIds.size || document.entryView !in viewIds) return false

  for (view in document.views) {
    if (view.nodes.size > VIRA_ANDROID_STUDIO_MAX_NODES_PER_VIEW) return false
    val nodeIds = view.nodes.map { it.id }
    val idSet = nodeIds.toSet()
    if (idSet.size != nodeIds.size) return false

    val parentById = mutableMapOf<String, String>()
    for (node in view.nodes) {
      val parentId = node.parentId ?: continue
      if (parentId == node.id || parentId !in idSet) return false
      parentById[node.id] = parentId
    }

    val completed = mutableSetOf<String>()
    for (nodeId in nodeIds) {
      if (nodeId in completed) continue
      var current: String? = nodeId
      val path = mutableSetOf<String>()
      while (current != null && current !in completed) {
        if (!path.add(current)) return false
        current = parentById[current]
      }
      completed += path
    }
  }
  return true
}
