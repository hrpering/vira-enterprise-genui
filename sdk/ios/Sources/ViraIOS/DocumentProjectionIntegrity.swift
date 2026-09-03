import Foundation
import ViraStudioExperienceWire

private func viraIOSProjectedPropAccepts(
  _ definition: ViraIOSPropDefinition,
  _ value: ViraJSONValue
) -> Bool {
  switch definition.type {
  case .string:
    if case .string = value { return true }
    return false
  case .number:
    if case .number(let number) = value {
      return number.isFinite && !(number == 0 && number.sign == .minus)
    }
    return false
  case .boolean:
    if case .bool = value { return true }
    return false
  case .enum:
    guard case .string(let option) = value else { return false }
    return definition.options?.contains(option) == true
  }
}

private func viraIOSProjectedPayloadAccepts(
  _ definition: ViraIOSEventPayloadDefinition,
  _ value: ViraJSONValue
) -> Bool {
  switch definition.type {
  case .string:
    if case .string = value { return true }
    return false
  case .number:
    if case .number(let number) = value {
      return number.isFinite && !(number == 0 && number.sign == .minus)
    }
    return false
  case .boolean:
    if case .bool = value { return true }
    return false
  case .enum:
    guard case .string(let option) = value else { return false }
    return definition.options?.contains(option) == true
  }
}

private func viraIOSBindingTypeMatches(
  _ expected: ViraIOSCatalogValueType,
  _ source: ViraIOSBindingSourceDefinition
) -> Bool {
  switch expected {
  case .string: return source.valueType == .string
  case .number: return source.valueType == .number
  case .boolean: return source.valueType == .boolean
  case .enum: return source.valueType == .enum
  }
}

private func viraIOSNodeIdentity(_ viewId: String, _ nodeId: String) -> String {
  "\(viewId)\u{0}\(nodeId)"
}

private func viraIOSPropTargetIdentity(_ viewId: String, _ nodeId: String, _ prop: String) -> String {
  "\(viewId)\u{0}\(nodeId)\u{0}\(prop)"
}

private func viraIOSInteractionIdentity(_ viewId: String, _ nodeId: String, _ event: String) -> String {
  "\(viewId)\u{0}\(nodeId)\u{0}\(event)"
}

private func viraIOSSourceIdentity<Kind: RawRepresentable>(_ kind: Kind, _ path: String) -> String where Kind.RawValue == String {
  "\(kind.rawValue):\(path)"
}

private func viraIOSInRepeatScope(
  document: StudioExperienceDocument,
  viewId: String,
  nodeId: String
) -> Bool {
  guard let view = document.views.first(where: { $0.id == viewId }) else { return false }
  let byId = Dictionary(uniqueKeysWithValues: view.nodes.map { ($0.id, $0) })
  var current = byId[nodeId]
  var seen = Set<String>()
  while let node = current, seen.insert(node.id).inserted {
    if node.repeat != nil { return true }
    current = node.parentId.flatMap { byId[$0] }
  }
  return false
}

func validateViraIOSDocumentProjectionIntegrity(
  _ document: StudioExperienceDocument,
  brand: ViraIOSBrandProjection
) -> Bool {
  let components = Dictionary(uniqueKeysWithValues: brand.components.map { ($0.ref, $0) })
  let actionEvents = Set(brand.actions.map(\.event))
  let viewIds = Set(document.views.map(\.id))
  let sourceMap = Dictionary(uniqueKeysWithValues: brand.dataSources.map {
    (viraIOSSourceIdentity($0.kind, $0.path), $0)
  })

  var nodeComponents: [String: ViraIOSComponentDefinition] = [:]
  var nodeValues: [String: StudioNode] = [:]
  for view in document.views {
    for node in view.nodes {
      guard let component = components[node.component] else { return false }
      let identity = viraIOSNodeIdentity(view.id, node.id)
      nodeComponents[identity] = component
      nodeValues[identity] = node
    }
  }

  var boundTargets = Set<String>()
  for binding in document.bindings {
    let nodeIdentity = viraIOSNodeIdentity(binding.viewId, binding.nodeId)
    guard let component = nodeComponents[nodeIdentity],
          let node = nodeValues[nodeIdentity],
          let definition = component.props.first(where: { $0.key == binding.prop }),
          definition.bindable else { return false }
    let target = viraIOSPropTargetIdentity(binding.viewId, binding.nodeId, binding.prop)
    guard boundTargets.insert(target).inserted else { return false }
    guard node.props[binding.prop] == nil else { return false }

    let sourceKey = viraIOSSourceIdentity(binding.source.kind, binding.source.path)
    guard let source = sourceMap[sourceKey],
          viraIOSBindingTypeMatches(definition.type, source) else { return false }
    if source.kind == .scope && !viraIOSInRepeatScope(
      document: document,
      viewId: binding.viewId,
      nodeId: binding.nodeId
    ) {
      return false
    }
  }

  for view in document.views {
    for node in view.nodes {
      guard let component = nodeComponents[viraIOSNodeIdentity(view.id, node.id)] else { return false }
      let definitions = Dictionary(uniqueKeysWithValues: component.props.map { ($0.key, $0) })

      for (key, value) in node.props {
        guard let definition = definitions[key],
              viraIOSProjectedPropAccepts(definition, value) else { return false }
      }

      for definition in component.props where definition.required {
        if node.props[definition.key] != nil { continue }
        guard boundTargets.contains(
          viraIOSPropTargetIdentity(view.id, node.id, definition.key)
        ) else { return false }
      }

      if let repeatSource = node.repeat?.source {
        let sourceKey = viraIOSSourceIdentity(repeatSource.kind, repeatSource.path)
        guard let source = sourceMap[sourceKey],
              source.kind != .scope,
              source.valueType == .array else { return false }
      }
    }
  }

  var interactions = Set<String>()
  for interaction in document.interactions {
    let nodeIdentity = viraIOSNodeIdentity(interaction.viewId, interaction.nodeId)
    guard let component = nodeComponents[nodeIdentity],
          let event = component.events.first(where: { $0.name == interaction.event }),
          actionEvents.contains(interaction.actionEvent) else { return false }
    guard interactions.insert(
      viraIOSInteractionIdentity(interaction.viewId, interaction.nodeId, interaction.event)
    ).inserted else { return false }

    var outcomes = Set<String>()
    for route in interaction.routes {
      guard viewIds.contains(route.viewId), outcomes.insert(route.outcome.rawValue).inserted else { return false }
    }

    let definitions = Dictionary(uniqueKeysWithValues: (event.payload ?? []).map { ($0.key, $0) })
    var mappedKeys = Set<String>()
    for mapping in interaction.payloadBindings ?? [] {
      guard let definition = definitions[mapping.key], mappedKeys.insert(mapping.key).inserted else { return false }
      switch mapping.source {
      case .variant1(let literal):
        guard viraIOSProjectedPayloadAccepts(definition, literal.value) else { return false }
      case .variant0(let binding):
        let sourceKey = viraIOSSourceIdentity(binding.kind, binding.path)
        guard let source = sourceMap[sourceKey],
              viraIOSBindingTypeMatches(definition.type, source) else { return false }
        if source.kind == .scope && !viraIOSInRepeatScope(
          document: document,
          viewId: interaction.viewId,
          nodeId: interaction.nodeId
        ) {
          return false
        }
      }
    }
    for definition in event.payload ?? [] where definition.required {
      guard mappedKeys.contains(definition.key) else { return false }
    }
  }

  return true
}
