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

private func viraIOSNodeIdentity(_ viewId: String, _ nodeId: String) -> String {
  "\(viewId)\u{0}\(nodeId)"
}

private func viraIOSPropTargetIdentity(_ viewId: String, _ nodeId: String, _ prop: String) -> String {
  "\(viewId)\u{0}\(nodeId)\u{0}\(prop)"
}

private func viraIOSInteractionIdentity(_ viewId: String, _ nodeId: String, _ event: String) -> String {
  "\(viewId)\u{0}\(nodeId)\u{0}\(event)"
}

func validateViraIOSDocumentProjectionIntegrity(
  _ document: StudioExperienceDocument,
  brand: ViraIOSBrandProjection
) -> Bool {
  let components = Dictionary(uniqueKeysWithValues: brand.components.map { ($0.ref, $0) })
  let actionEvents = Set(brand.actions.map(\.event))
  let viewIds = Set(document.views.map(\.id))

  var nodeComponents: [String: ViraIOSComponentDefinition] = [:]
  for view in document.views {
    for node in view.nodes {
      guard let component = components[node.component] else { return false }
      nodeComponents[viraIOSNodeIdentity(view.id, node.id)] = component
    }
  }

  var boundTargets = Set<String>()
  for binding in document.bindings {
    let nodeIdentity = viraIOSNodeIdentity(binding.viewId, binding.nodeId)
    guard let component = nodeComponents[nodeIdentity],
          let definition = component.props.first(where: { $0.key == binding.prop }),
          definition.bindable else { return false }
    guard boundTargets.insert(
      viraIOSPropTargetIdentity(binding.viewId, binding.nodeId, binding.prop)
    ).inserted else { return false }
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
    }
  }

  var interactions = Set<String>()
  for interaction in document.interactions {
    let nodeIdentity = viraIOSNodeIdentity(interaction.viewId, interaction.nodeId)
    guard let component = nodeComponents[nodeIdentity],
          component.events.contains(where: { $0.name == interaction.event }),
          actionEvents.contains(interaction.actionEvent) else { return false }
    guard interactions.insert(
      viraIOSInteractionIdentity(interaction.viewId, interaction.nodeId, interaction.event)
    ).inserted else { return false }

    var outcomes = Set<StudioInteractionOutcome>()
    for route in interaction.routes {
      guard viewIds.contains(route.viewId), outcomes.insert(route.outcome).inserted else { return false }
    }
  }

  return true
}
