// GENERATED FILE. DO NOT EDIT.
// Source: packages/studio-schema/src/types.ts
import Foundation

private struct ViraAnyCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int?
  init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }
  init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
}

public enum ViraJSONValue: Codable, Equatable {
  case null, bool(Bool), number(Double), string(String), array([ViraJSONValue]), object([String: ViraJSONValue])
  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null; return }
    if let v = try? c.decode(Bool.self) { self = .bool(v); return }
    if let v = try? c.decode(Double.self) { self = .number(v); return }
    if let v = try? c.decode(String.self) { self = .string(v); return }
    if let v = try? c.decode([ViraJSONValue].self) { self = .array(v); return }
    if let v = try? c.decode([String: ViraJSONValue].self) { self = .object(v); return }
    throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported JSON value")
  }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .number(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) }
  }
}

public struct StudioBinding: Codable, Equatable {
  public let viewId: String
  public let nodeId: String
  public let prop: String
  public let source: StudioBindingSource
  private enum CodingKeys: String, CodingKey { case viewId, nodeId, prop, source }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["viewId", "nodeId", "prop", "source"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.viewId = try c.decode(String.self, forKey: .viewId)
    self.nodeId = try c.decode(String.self, forKey: .nodeId)
    self.prop = try c.decode(String.self, forKey: .prop)
    self.source = try c.decode(StudioBindingSource.self, forKey: .source)
  }
}

public struct StudioBindingSource: Codable, Equatable {
  public let kind: StudioBindingSourceKind
  public let path: String
  private enum CodingKeys: String, CodingKey { case kind, path }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["kind", "path"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try c.decode(StudioBindingSourceKind.self, forKey: .kind)
    self.path = try c.decode(String.self, forKey: .path)
  }
}

public enum StudioBindingSourceKind: String, Codable, Equatable {
  case state = "state"
  case domain = "domain"
  case scope = "scope"
}

public struct StudioExperienceDocument: Codable, Equatable {
  public let version: String
  public let id: String
  public let recipeId: String
  public let entryView: String
  public let views: [StudioView]
  public let bindings: [StudioBinding]
  public let interactions: [StudioInteraction]
  private enum CodingKeys: String, CodingKey { case version, id, recipeId, entryView, views, bindings, interactions }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["version", "id", "recipeId", "entryView", "views", "bindings", "interactions"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let versionValue = try c.decode(String.self, forKey: .version)
    guard versionValue == "1" else { throw DecodingError.dataCorruptedError(forKey: .version, in: c, debugDescription: "expected literal 1") }
    self.version = versionValue
    self.id = try c.decode(String.self, forKey: .id)
    self.recipeId = try c.decode(String.self, forKey: .recipeId)
    self.entryView = try c.decode(String.self, forKey: .entryView)
    self.views = try c.decode([StudioView].self, forKey: .views)
    self.bindings = try c.decode([StudioBinding].self, forKey: .bindings)
    self.interactions = try c.decode([StudioInteraction].self, forKey: .interactions)
  }
}

public struct StudioInteraction: Codable, Equatable {
  public let viewId: String
  public let nodeId: String
  public let event: String
  public let actionEvent: String
  public let routes: [StudioInteractionRoute]
  public let payloadBindings: [StudioInteractionPayloadBinding]?
  private enum CodingKeys: String, CodingKey { case viewId, nodeId, event, actionEvent, routes, payloadBindings }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["viewId", "nodeId", "event", "actionEvent", "routes", "payloadBindings"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.viewId = try c.decode(String.self, forKey: .viewId)
    self.nodeId = try c.decode(String.self, forKey: .nodeId)
    self.event = try c.decode(String.self, forKey: .event)
    self.actionEvent = try c.decode(String.self, forKey: .actionEvent)
    self.routes = try c.decode([StudioInteractionRoute].self, forKey: .routes)
    self.payloadBindings = try c.decodeIfPresent([StudioInteractionPayloadBinding].self, forKey: .payloadBindings)
  }
}

public enum StudioInteractionOutcome: String, Codable, Equatable {
  case success = "success"
  case empty = "empty"
  case error = "error"
}

public struct StudioInteractionPayloadBinding: Codable, Equatable {
  public let key: String
  public let source: StudioInteractionPayloadSource
  private enum CodingKeys: String, CodingKey { case key, source }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["key", "source"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.key = try c.decode(String.self, forKey: .key)
    self.source = try c.decode(StudioInteractionPayloadSource.self, forKey: .source)
  }
}

public enum StudioInteractionPayloadSource: Codable, Equatable {
  case variant0(StudioBindingSource)
  case variant1(StudioInteractionPayloadSourceValue1)
  private enum CodingKeys: String, CodingKey { case kind }
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let kind = try c.decode(String.self, forKey: .kind)
    if ["state","domain","scope"].contains(kind) { self = .variant0(try StudioBindingSource(from: decoder)); return }
    if ["literal"].contains(kind) { self = .variant1(try StudioInteractionPayloadSourceValue1(from: decoder)); return }
    throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unsupported union discriminator")
  }
  public func encode(to encoder: Encoder) throws { switch self {
    case .variant0(let value): try value.encode(to: encoder)
    case .variant1(let value): try value.encode(to: encoder)
  } }
}

public struct StudioInteractionPayloadSourceValue1: Codable, Equatable {
  public let kind: String
  public let value: ViraJSONValue
  private enum CodingKeys: String, CodingKey { case kind, value }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["kind", "value"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let kindValue = try c.decode(String.self, forKey: .kind)
    guard kindValue == "literal" else { throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "expected literal literal") }
    self.kind = kindValue
    self.value = try c.decode(ViraJSONValue.self, forKey: .value)
  }
}

public struct StudioInteractionRoute: Codable, Equatable {
  public let outcome: StudioInteractionOutcome
  public let viewId: String
  private enum CodingKeys: String, CodingKey { case outcome, viewId }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["outcome", "viewId"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.outcome = try c.decode(StudioInteractionOutcome.self, forKey: .outcome)
    self.viewId = try c.decode(String.self, forKey: .viewId)
  }
}

public struct StudioNode: Codable, Equatable {
  public let id: String
  public let component: String
  public let order: Double
  public let props: [String: ViraJSONValue]
  public let parentId: String?
  public let slot: String?
  public let `repeat`: StudioRepeat?
  private enum CodingKeys: String, CodingKey { case id, component, order, props, parentId, slot, `repeat` }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["id", "component", "order", "props", "parentId", "slot", "repeat"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try c.decode(String.self, forKey: .id)
    self.component = try c.decode(String.self, forKey: .component)
    self.order = try c.decode(Double.self, forKey: .order)
    self.props = try c.decode([String: ViraJSONValue].self, forKey: .props)
    self.parentId = try c.decodeIfPresent(String.self, forKey: .parentId)
    self.slot = try c.decodeIfPresent(String.self, forKey: .slot)
    self.`repeat` = try c.decodeIfPresent(StudioRepeat.self, forKey: .`repeat`)
  }
}

public struct StudioRepeat: Codable, Equatable {
  public let source: StudioRepeatSource
  private enum CodingKeys: String, CodingKey { case source }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["source"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.source = try c.decode(StudioRepeatSource.self, forKey: .source)
  }
}

public struct StudioRepeatSource: Codable, Equatable {
  public let kind: StudioRepeatSourceKind
  public let path: String
  private enum CodingKeys: String, CodingKey { case kind, path }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["kind", "path"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try c.decode(StudioRepeatSourceKind.self, forKey: .kind)
    self.path = try c.decode(String.self, forKey: .path)
  }
}

public enum StudioRepeatSourceKind: String, Codable, Equatable {
  case state = "state"
  case domain = "domain"
}

public struct StudioView: Codable, Equatable {
  public let id: String
  public let nodes: [StudioNode]
  private enum CodingKeys: String, CodingKey { case id, nodes }
  public init(from decoder: Decoder) throws {
    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)
    let allowed: Set<String> = ["id", "nodes"]
    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: "unknown field") }
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try c.decode(String.self, forKey: .id)
    self.nodes = try c.decode([StudioNode].self, forKey: .nodes)
  }
}

