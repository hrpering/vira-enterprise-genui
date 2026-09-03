import ViraStudioExperienceWire

func validateViraIOSDocumentGraphSafety(_ document: StudioExperienceDocument) -> Bool {
  let viewIds = document.views.map(\.id)
  guard Set(viewIds).count == viewIds.count,
        Set(viewIds).contains(document.entryView) else {
    return false
  }

  for view in document.views {
    let nodeIds = view.nodes.map(\.id)
    let idSet = Set(nodeIds)
    guard idSet.count == nodeIds.count else { return false }

    var parentById: [String: String] = [:]
    for node in view.nodes {
      guard let parentId = node.parentId else { continue }
      guard parentId != node.id, idSet.contains(parentId) else { return false }
      parentById[node.id] = parentId
    }

    var visitState: [String: UInt8] = [:]
    func visit(_ nodeId: String) -> Bool {
      switch visitState[nodeId] ?? 0 {
      case 1:
        return false
      case 2:
        return true
      default:
        visitState[nodeId] = 1
        if let parentId = parentById[nodeId], !visit(parentId) {
          return false
        }
        visitState[nodeId] = 2
        return true
      }
    }

    for nodeId in nodeIds where !visit(nodeId) {
      return false
    }
  }

  return true
}
