// GENERATED FILE. DO NOT EDIT.
// Source: packages/studio-schema/src/types.ts
import Foundation

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

public enum ViraStudioInteropError: Error { case invalidVersion(String) }

public struct StudioBinding: Codable, Equatable {
  public let viewId: String
  public let nodeId: String
  public let prop: String
  public let source: StudioBindingSource
}


public struct StudioBindingSource: Codable, Equatable {
  public let kind: StudioBindingSourceKind
  public let path: String
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
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let version = try c.decode(String.self, forKey: .version)
    guard version == "1" else { throw ViraStudioInteropError.invalidVersion(version) }
    self.version = version
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
}


public enum StudioInteractionOutcome: String, Codable, Equatable {
  case success = "success"
  case empty = "empty"
  case error = "error"
}

public struct StudioInteractionPayloadBinding: Codable, Equatable {
  public let key: String
  public let source: StudioInteractionPayloadSource
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
    case .variant0(let v): try v.encode(to: encoder)
    case .variant1(let v): try v.encode(to: encoder)
  } }
}

public struct StudioInteractionPayloadSourceValue1: Codable, Equatable {
  public let kind: String
  public let value: ViraJSONValue
}


public struct StudioInteractionRoute: Codable, Equatable {
  public let outcome: StudioInteractionOutcome
  public let viewId: String
}


public struct StudioNode: Codable, Equatable {
  public let id: String
  public let component: String
  public let order: Double
  public let props: [String: ViraJSONValue]
  public let parentId: String?
  public let slot: String?
  public let `repeat`: StudioRepeat?
}


public struct StudioRepeat: Codable, Equatable {
  public let source: StudioRepeatSource
}


public struct StudioRepeatSource: Codable, Equatable {
  public let kind: String
  public let path: String
}


public struct StudioView: Codable, Equatable {
  public let id: String
  public let nodes: [StudioNode]
}

