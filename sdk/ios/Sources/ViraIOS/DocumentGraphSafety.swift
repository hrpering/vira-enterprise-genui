import ViraStudioExperienceWire

private let VIRA_IOS_STUDIO_MAX_VIEWS = 32
private let VIRA_IOS_STUDIO_MAX_NODES_PER_VIEW = 256
private let VIRA_IOS_STUDIO_MAX_BINDINGS = 512
private let VIRA_IOS_STUDIO_MAX_INTERACTIONS = 512
private let VIRA_IOS_STUDIO_MAX_ACTION_PAYLOAD_BINDINGS = 64

func validateViraIOSDocumentGraphSafety(_ document: StudioExperienceDocument) -> Bool {
  guard document.views.count <= VIRA_IOS_STUDIO_MAX_VIEWS,
        document.bindings.count <= VIRA_IOS_STUDIO_MAX_BINDINGS,
        document.interactions.count <= VIRA_IOS_STUDIO_MAX_INTERACTIONS,
        document.interactions.allSatisfy({
          ($0.payloadBindings?.count ?? 0) <= VIRA_IOS_STUDIO_MAX_ACTION_PAYLOAD_BINDINGS
        }) else {
    return false
  }

  let viewIds = document.views.map(\.id)
  guard Set(viewIds).count == viewIds.count,
        Set(viewIds).contains(document.entryView) else {
    return false
  }

  for view in document.views {
    guard view.nodes.count <= VIRA_IOS_STUDIO_MAX_NODES_PER_VIEW else { return false }

    let nodeIds = view.nodes.map(\.id)
    let idSet = Set(nodeIds)
    guard idSet.count == nodeIds.count else { return false }

    var parentById: [String: String] = [:]
    for node in view.nodes {
      guard let parentId = node.parentId else { continue }
      guard parentId != node.id, idSet.contains(parentId) else { return false }
      parentById[node.id] = parentId
    }

    var completed = Set<String>()
    for nodeId in nodeIds where !completed.contains(nodeId) {
      var current: String? = nodeId
      var path = Set<String>()
      while let id = current, !completed.contains(id) {
        guard path.insert(id).inserted else { return false }
        current = parentById[id]
      }
      completed.formUnion(path)
    }
  }

  return true
}
