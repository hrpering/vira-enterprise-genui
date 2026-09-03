import Foundation
import ViraStudioExperienceWire

@MainActor
public final class ViraIOSRenderEventEmitter {
  private let session: ViraIOSRuntimeSession
  private let runtimeNodeId: String
  private let expectedViewId: String
  private let expectedHostRevision: Int64
  private let allowedEvents: Set<String>
  private let onDispatchCompletion: (() -> Void)?

  init(
    session: ViraIOSRuntimeSession,
    runtimeNodeId: String,
    expectedViewId: String,
    expectedHostRevision: Int64,
    allowedEvents: Set<String>,
    onDispatchCompletion: (() -> Void)? = nil
  ) {
    self.session = session
    self.runtimeNodeId = runtimeNodeId
    self.expectedViewId = expectedViewId
    self.expectedHostRevision = expectedHostRevision
    self.allowedEvents = allowedEvents
    self.onDispatchCompletion = onDispatchCompletion
  }

  private func freshnessIssue() -> ViraIOSIssue? {
    guard session.currentViewId() == expectedViewId else {
      return .init(
        code: .interactionNotFound,
        path: "$.runtimeNodeId",
        message: "native renderer binding belongs to an inactive view"
      )
    }
    switch session.host.snapshot() {
    case .failure(let issue):
      return issue
    case .success(let snapshot):
      guard snapshot.revision == expectedHostRevision else {
        return .init(
          code: .interactionNotFound,
          path: "$.runtimeNodeId",
          message: "native renderer binding is stale after a Host state revision"
        )
      }
      return nil
    }
  }

  public func emit(
    _ event: String,
    payload: [String: ViraJSONValue]? = nil
  ) async -> Result<ViraIOSHostedDispatchCompletion, ViraIOSIssue> {
    if let issue = freshnessIssue() { return .failure(issue) }
    guard allowedEvents.contains(event) else {
      return .failure(.init(
        code: .interactionNotFound,
        path: "$.event",
        message: "native renderer event is not declared by the active component"
      ))
    }
    let result = await session.dispatch(runtimeNodeId: runtimeNodeId, event: event, payload: payload)
    onDispatchCompletion?()
    return result
  }
}

public struct ViraIOSRenderContext {
  public let component: String
  public let runtimeNodeId: String
  public let sourceNodeId: String
  public let props: [String: ViraJSONValue]
  public let slots: [String: [AnyObject]]
  public let emitter: ViraIOSRenderEventEmitter
}

@MainActor
public protocol ViraIOSNativeRenderer: AnyObject {
  var implementationId: String { get }
  func render(_ context: ViraIOSRenderContext) throws -> AnyObject
}

@MainActor
public final class ViraIOSRendererRegistry {
  private let renderers: [String: any ViraIOSNativeRenderer]

  private init(renderers: [String: any ViraIOSNativeRenderer]) {
    self.renderers = renderers
  }

  public static func create(
    envelope: ViraIOSMountEnvelope,
    renderers input: [any ViraIOSNativeRenderer]
  ) -> Result<ViraIOSRendererRegistry, ViraIOSIssue> {
    let expected = Set(envelope.brand.components.map(\.implementationId))
    var byId: [String: any ViraIOSNativeRenderer] = [:]

    for renderer in input {
      let id = renderer.implementationId
      guard ViraIOSSemanticIdentifier.isNamespace(id, requiresDot: true) else {
        return .failure(.init(
          code: .invalidRendererRegistry,
          path: "$.renderers",
          message: "native renderer implementation id is invalid"
        ))
      }
      guard expected.contains(id) else {
        return .failure(.init(
          code: .extraRenderer,
          path: "$.renderers",
          message: "native renderer registry contains an implementation outside the active Brand mapping"
        ))
      }
      guard byId[id] == nil else {
        return .failure(.init(
          code: .invalidRendererRegistry,
          path: "$.renderers",
          message: "native renderer implementation id is duplicated"
        ))
      }
      byId[id] = renderer
    }

    guard byId.count == expected.count else {
      return .failure(.init(
        code: .missingRenderer,
        path: "$.renderers",
        message: "active Brand mapping is missing a trusted local native renderer"
      ))
    }
    return .success(.init(renderers: byId))
  }

  public func render(
    session: ViraIOSRuntimeSession,
    onDispatchCompletion: (() -> Void)? = nil
  ) -> Result<[AnyObject], ViraIOSIssue> {
    let hostRevision: Int64
    switch session.host.snapshot() {
    case .failure(let issue): return .failure(issue)
    case .success(let snapshot): hostRevision = snapshot.revision
    }

    let current: ViraIOSRuntimeViewModel
    switch session.currentView() {
    case .failure(let issue): return .failure(issue)
    case .success(let view): current = view
    }

    let componentMap = Dictionary(
      uniqueKeysWithValues: session.envelope.brand.components.map { ($0.ref, $0) }
    )
    let nodeMap = Dictionary(uniqueKeysWithValues: current.nodes.map { ($0.id, $0) })
    var childMap: [String: [ViraIOSRuntimeNodeModel]] = [:]
    var roots: [ViraIOSRuntimeNodeModel] = []

    for node in current.nodes {
      guard let component = componentMap[node.component],
            component.implementationId == node.implementationId else {
        return .failure(.init(
          code: .invalidRendererRegistry,
          path: "$.view.nodes",
          message: "native runtime node implementation identity is inconsistent with the active Brand"
        ))
      }
      if node.parentId == nil {
        roots.append(node)
        continue
      }
      guard let parentId = node.parentId,
            let slot = node.slot,
            let parent = nodeMap[parentId],
            let parentComponent = componentMap[parent.component],
            parentComponent.slots.contains(slot) else {
        return .failure(.init(
          code: .invalidSlotTarget,
          path: "$.view.nodes",
          message: "native runtime child targets an invalid component slot"
        ))
      }
      childMap["\(parentId)\u{0}\(slot)", default: []].append(node)
    }

    func ordered(_ left: ViraIOSRuntimeNodeModel, _ right: ViraIOSRuntimeNodeModel) -> Bool {
      if left.order == right.order { return left.id < right.id }
      return left.order < right.order
    }
    roots.sort(by: ordered)
    for key in childMap.keys {
      childMap[key]?.sort(by: ordered)
    }

    var active = Set<String>()
    var rendered = Set<String>()

    func renderNode(_ node: ViraIOSRuntimeNodeModel) -> Result<AnyObject, ViraIOSIssue> {
      if active.contains(node.id) || rendered.contains(node.id) {
        return .failure(.init(
          code: .nodeCycle,
          path: "$.view.nodes",
          message: "native runtime node is cyclic or reachable more than once"
        ))
      }
      guard let component = componentMap[node.component],
            let renderer = renderers[node.implementationId] else {
        return .failure(.init(
          code: .missingRenderer,
          path: "$.renderers",
          message: "trusted local native renderer is unavailable"
        ))
      }

      active.insert(node.id)
      defer { active.remove(node.id) }

      var slots: [String: [AnyObject]] = [:]
      for slot in component.slots {
        var values: [AnyObject] = []
        for child in childMap["\(node.id)\u{0}\(slot)"] ?? [] {
          switch renderNode(child) {
          case .failure(let issue): return .failure(issue)
          case .success(let value): values.append(value)
          }
        }
        slots[slot] = values
      }

      let emitter = ViraIOSRenderEventEmitter(
        session: session,
        runtimeNodeId: node.id,
        expectedViewId: current.viewId,
        expectedHostRevision: hostRevision,
        allowedEvents: Set(component.events.map(\.name)),
        onDispatchCompletion: onDispatchCompletion
      )
      let context = ViraIOSRenderContext(
        component: node.component,
        runtimeNodeId: node.id,
        sourceNodeId: node.sourceNodeId,
        props: node.props,
        slots: slots,
        emitter: emitter
      )
      let output: AnyObject
      do {
        output = try renderer.render(context)
      } catch {
        return .failure(.init(
          code: .rendererFailed,
          path: "$.renderers",
          message: "trusted local native renderer failed"
        ))
      }
      rendered.insert(node.id)
      return .success(output)
    }

    var output: [AnyObject] = []
    for root in roots {
      switch renderNode(root) {
      case .failure(let issue): return .failure(issue)
      case .success(let value): output.append(value)
      }
    }
    guard rendered.count == current.nodes.count else {
      return .failure(.init(
        code: .invalidSlotTarget,
        path: "$.view.nodes",
        message: "native runtime contains nodes unreachable from a root component"
      ))
    }
    return .success(output)
  }
}
