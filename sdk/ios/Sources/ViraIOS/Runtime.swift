import Foundation
import ViraStudioExperienceWire

public let VIRA_IOS_MAX_REPEAT_ITEMS = 256
private let VIRA_IOS_ORDER_STRIDE: Int64 = 257

public struct ViraIOSRuntimeNodeModel: Equatable {
  public let id: String
  public let sourceNodeId: String
  public let component: String
  public let implementationId: String
  public let order: Int64
  public let props: [String: ViraJSONValue]
  public let eventPayloads: [String: [String: ViraJSONValue]]
  public let parentId: String?
  public let slot: String?
}

public struct ViraIOSRuntimeViewModel: Equatable {
  public let experienceId: String
  public let viewId: String
  public let nodes: [ViraIOSRuntimeNodeModel]
}

public struct ViraIOSHostedDispatchCompletion: Equatable {
  public let actionType: String
  public let outcome: ViraIOSHostActionOutcome
  public let viewId: String
  public let transitioned: Bool
}

@MainActor
public final class ViraIOSRuntimeSession {
  private struct PendingAction {
    let routes: [StudioInteractionRoute]
  }

  public let envelope: ViraIOSMountEnvelope
  public let host: ViraIOSHostAdapter
  public let permissionPolicy: ViraIOSPermissionPolicy

  private let components: [String: ViraIOSComponentDefinition]
  private let actionTypes: [String: String]
  private var currentViewIdValue: String
  private var pending: PendingAction?
  private var disposed = false

  public init(
    envelope: ViraIOSMountEnvelope,
    host: ViraIOSHostAdapter,
    permissionPolicy: ViraIOSPermissionPolicy
  ) throws {
    guard host.hostId == envelope.compatibility.hostId else {
      throw ViraIOSIssue(
        code: .invalidHost,
        path: "$.host.id",
        message: "native business Host identity does not match the resolved Host Capability identity"
      )
    }
    self.envelope = envelope
    self.host = host
    self.permissionPolicy = permissionPolicy
    self.components = Dictionary(uniqueKeysWithValues: envelope.brand.components.map { ($0.ref, $0) })
    self.actionTypes = Dictionary(uniqueKeysWithValues: envelope.brand.actions.map { ($0.event, $0.actionType) })
    self.currentViewIdValue = envelope.document.entryView
  }

  public func currentViewId() -> String {
    currentViewIdValue
  }

  public func isDisposed() -> Bool {
    disposed
  }

  private func propAccepts(
    _ definition: ViraIOSPropDefinition,
    _ value: ViraJSONValue
  ) -> Bool {
    switch definition.type {
    case .string:
      if case .string = value { return true }
      return false
    case .number:
      if case .number(let number) = value { return number.isFinite }
      return false
    case .boolean:
      if case .bool = value { return true }
      return false
    case .enum:
      guard case .string(let option) = value else { return false }
      return definition.options?.contains(option) == true
    }
  }

  private func scopeValue(
    _ item: ViraJSONValue?,
    path: String
  ) -> ViraJSONValue? {
    guard var current = item, path.hasPrefix("currentItem.") else { return nil }
    let suffix = String(path.dropFirst("currentItem.".count))
    for segment in suffix.split(separator: ".", omittingEmptySubsequences: false).map(String.init) {
      guard !segment.isEmpty, case .object(let object) = current, let next = object[segment] else { return nil }
      current = next
    }
    return current
  }

  private func readBindingSource(
    _ source: StudioBindingSource,
    scope: ViraJSONValue?
  ) -> Result<ViraJSONValue, ViraIOSIssue> {
    switch source.kind {
    case .scope:
      guard let value = scopeValue(scope, path: source.path) else {
        return .failure(.init(
          code: .dataValueInvalid,
          path: "$.binding",
          message: "native scope value is unavailable"
        ))
      }
      return .success(value)
    case .state:
      return host.read(root: .state, path: source.path)
    case .domain:
      return host.read(root: .domain, path: source.path)
    }
  }

  private func readRepeatSource(
    _ source: StudioRepeatSource
  ) -> Result<ViraJSONValue, ViraIOSIssue> {
    switch source.kind {
    case .state: return host.read(root: .state, path: source.path)
    case .domain: return host.read(root: .domain, path: source.path)
    }
  }

  private func readPayloadSource(
    _ source: StudioInteractionPayloadSource,
    scope: ViraJSONValue?
  ) -> Result<ViraJSONValue, ViraIOSIssue> {
    switch source {
    case .variant0(let binding):
      return readBindingSource(binding, scope: scope)
    case .variant1(let literal):
      return .success(literal.value)
    }
  }

  private func runtimeId(_ sourceId: String, suffix: String) -> String {
    suffix.isEmpty ? sourceId : "\(sourceId)~\(suffix)"
  }

  public func currentView() -> Result<ViraIOSRuntimeViewModel, ViraIOSIssue> {
    if disposed {
      return .failure(.init(code: .sessionDisposed, path: "$", message: "native Studio runtime session is disposed"))
    }
    guard let view = envelope.document.views.first(where: { $0.id == currentViewIdValue }) else {
      return .failure(.init(code: .viewNotFound, path: "$.viewId", message: "current native Studio view does not exist"))
    }

    var byParent: [String: [StudioNode]] = [:]
    for node in view.nodes {
      byParent[node.parentId ?? "$root", default: []].append(node)
    }
    for key in byParent.keys {
      byParent[key]?.sort {
        if $0.order == $1.order { return $0.id < $1.id }
        return $0.order < $1.order
      }
    }

    var bindings: [String: [StudioBinding]] = [:]
    for binding in envelope.document.bindings where binding.viewId == currentViewIdValue {
      bindings[binding.nodeId, default: []].append(binding)
    }
    var interactions: [String: [StudioInteraction]] = [:]
    for interaction in envelope.document.interactions where interaction.viewId == currentViewIdValue {
      interactions[interaction.nodeId, default: []].append(interaction)
    }

    var output: [ViraIOSRuntimeNodeModel] = []

    func build(
      _ node: StudioNode,
      parentId: String?,
      scope: ViraJSONValue?,
      suffix: String,
      order: Int64
    ) -> ViraIOSIssue? {
      guard let component = components[node.component] else {
        return .init(
          code: .dataValueInvalid,
          path: "$.document",
          message: "published component metadata is unavailable"
        )
      }
      var props = node.props
      for binding in bindings[node.id] ?? [] {
        let resolved = readBindingSource(binding.source, scope: scope)
        let value: ViraJSONValue
        switch resolved {
        case .failure(let issue): return issue
        case .success(let resolvedValue): value = resolvedValue
        }
        guard let definition = component.props.first(where: { $0.key == binding.prop }),
              propAccepts(definition, value) else {
          return .init(
            code: .dataValueInvalid,
            path: "$.bindings.\(binding.prop)",
            message: "resolved binding does not match native component prop type"
          )
        }
        props[binding.prop] = value
      }

      var eventPayloads: [String: [String: ViraJSONValue]] = [:]
      for interaction in interactions[node.id] ?? [] {
        var payload: [String: ViraJSONValue] = [:]
        for mapping in interaction.payloadBindings ?? [] {
          let resolved = readPayloadSource(mapping.source, scope: scope)
          switch resolved {
          case .failure(let issue): return issue
          case .success(let value): payload[mapping.key] = value
          }
        }
        eventPayloads[interaction.event] = payload
      }

      let id = runtimeId(node.id, suffix: suffix)
      output.append(.init(
        id: id,
        sourceNodeId: node.id,
        component: node.component,
        implementationId: component.implementationId,
        order: order,
        props: props,
        eventPayloads: eventPayloads,
        parentId: parentId,
        slot: parentId == nil ? nil : node.slot
      ))

      for child in byParent[node.id] ?? [] {
        if let issue = expand(child, parentId: id, scope: scope, parentSuffix: suffix) { return issue }
      }
      return nil
    }

    func expand(
      _ node: StudioNode,
      parentId: String?,
      scope: ViraJSONValue?,
      parentSuffix: String
    ) -> ViraIOSIssue? {
      guard node.order.isFinite,
            node.order >= 0,
            node.order.rounded(.towardZero) == node.order,
            node.order <= Double(VIRA_IOS_MAX_SAFE_INTEGER) else {
        return .init(code: .dataValueInvalid, path: "$.node.order", message: "native node order is invalid")
      }
      let baseOrder = Int64(node.order)
      if node.repeat == nil {
        return build(
          node,
          parentId: parentId,
          scope: scope,
          suffix: parentSuffix,
          order: baseOrder * VIRA_IOS_ORDER_STRIDE
        )
      }

      let collectionResult = readRepeatSource(node.repeat!.source)
      let collectionValue: ViraJSONValue
      switch collectionResult {
      case .failure(let issue): return issue
      case .success(let value): collectionValue = value
      }
      guard case .array(let collection) = collectionValue else {
        return .init(
          code: .dataValueInvalid,
          path: "$.repeat.\(node.id)",
          message: "native repeat source must resolve to an array"
        )
      }
      guard collection.count <= VIRA_IOS_MAX_REPEAT_ITEMS else {
        return .init(
          code: .repeatLimitExceeded,
          path: "$.repeat.\(node.id)",
          message: "native repeat item limit is \(VIRA_IOS_MAX_REPEAT_ITEMS)"
        )
      }
      for (index, item) in collection.enumerated() {
        let segment = "\(node.id)-\(index)"
        let suffix = parentSuffix.isEmpty ? segment : "\(parentSuffix).\(segment)"
        if let issue = build(
          node,
          parentId: parentId,
          scope: item,
          suffix: suffix,
          order: baseOrder * VIRA_IOS_ORDER_STRIDE + Int64(index)
        ) {
          return issue
        }
      }
      return nil
    }

    for root in byParent["$root"] ?? [] {
      if let issue = expand(root, parentId: nil, scope: nil, parentSuffix: "") {
        return .failure(issue)
      }
    }

    return .success(.init(
      experienceId: envelope.document.id,
      viewId: currentViewIdValue,
      nodes: output
    ))
  }

  private func interaction(
    nodeId: String,
    event: String
  ) -> StudioInteraction? {
    envelope.document.interactions.first {
      $0.viewId == currentViewIdValue && $0.nodeId == nodeId && $0.event == event
    }
  }

  private func complete(
    routes: [StudioInteractionRoute],
    outcome: ViraIOSHostActionOutcome
  ) -> (viewId: String, transitioned: Bool) {
    let route = routes.first(where: { $0.outcome.rawValue == outcome.rawValue })
    guard let route else { return (currentViewIdValue, false) }
    currentViewIdValue = route.viewId
    return (currentViewIdValue, true)
  }

  public func dispatch(
    nodeId: String,
    event: String,
    payload externalPayload: [String: ViraJSONValue]? = nil
  ) async -> Result<ViraIOSHostedDispatchCompletion, ViraIOSIssue> {
    if disposed {
      return .failure(.init(code: .sessionDisposed, path: "$", message: "native Studio runtime session is disposed"))
    }
    if pending != nil {
      return .failure(.init(code: .actionPending, path: "$.event", message: "one native Studio action is already awaiting a Host outcome"))
    }
    guard let interaction = interaction(nodeId: nodeId, event: event) else {
      return .failure(.init(code: .interactionNotFound, path: "$.event", message: "no published native Studio interaction matches this node event"))
    }
    guard let actionType = actionTypes[interaction.actionEvent] else {
      return .failure(.init(code: .unmappedAction, path: "$.action", message: "published native Studio action is unmapped"))
    }
    if actionType.hasPrefix("runtime.") {
      return .failure(.init(
        code: .unsupportedRuntimeAction,
        path: "$.action.type",
        message: "Runtime Core built-in actions are not executable by MASTER-07B native Host"
      ))
    }

    switch permissionPolicy.effect(subject: .action, id: actionType) {
    case .deny:
      return .failure(.init(code: .permissionDenied, path: "$.action.type", message: "native runtime permission denied"))
    case .confirm:
      return .failure(.init(code: .confirmationRequired, path: "$.action.type", message: "native runtime confirmation is required before Host dispatch"))
    case .allow:
      break
    }

    let view = currentView()
    let model: ViraIOSRuntimeNodeModel
    switch view {
    case .failure(let issue): return .failure(issue)
    case .success(let value):
      guard let node = value.nodes.first(where: { $0.sourceNodeId == nodeId }) else {
        return .failure(.init(code: .interactionNotFound, path: "$.nodeId", message: "native runtime node is unavailable"))
      }
      model = node
    }

    var payload = externalPayload ?? [:]
    for (key, value) in model.eventPayloads[event] ?? [:] {
      payload[key] = value
    }

    pending = PendingAction(routes: interaction.routes)
    let result = await host.dispatch(.init(type: actionType, payload: payload))
    if disposed {
      pending = nil
      return .failure(.init(
        code: .disposed,
        path: "$",
        message: "native Studio runtime was disposed during Host dispatch"
      ))
    }
    guard let routes = pending?.routes else {
      return .failure(.init(
        code: .disposed,
        path: "$",
        message: "native Studio runtime lost pending Host ownership"
      ))
    }
    pending = nil

    switch result {
    case .failure(let issue):
      _ = complete(routes: routes, outcome: .error)
      return .failure(issue)
    case .success(let hostResult):
      let completion = complete(routes: routes, outcome: hostResult.outcome)
      return .success(.init(
        actionType: actionType,
        outcome: hostResult.outcome,
        viewId: completion.viewId,
        transitioned: completion.transitioned
      ))
    }
  }

  public func dispose() {
    if disposed { return }
    disposed = true
    pending = nil
  }
}