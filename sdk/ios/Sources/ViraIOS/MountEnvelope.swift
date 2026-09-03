import Foundation
import ViraStudioExperienceWire

public let VIRA_IOS_MOUNT_ENVELOPE_VERSION = "1"
public let VIRA_IOS_PLATFORM = "ios"
public let VIRA_IOS_MAX_INSTANCE_ID_LENGTH = 4_096
public let VIRA_IOS_MAX_SAFE_INTEGER: Int64 = 9_007_199_254_740_991

public typealias ViraIOSJSONValue = ViraJSONValue
public typealias ViraIOSExperienceDocument = StudioExperienceDocument

private struct ViraIOSAnyCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int?

  init?(stringValue: String) {
    self.stringValue = stringValue
    self.intValue = nil
  }

  init?(intValue: Int) {
    self.stringValue = String(intValue)
    self.intValue = intValue
  }
}

private func rejectUnknownFields(
  _ decoder: Decoder,
  allowed: Set<String>
) throws {
  let container = try decoder.container(keyedBy: ViraIOSAnyCodingKey.self)
  if let unknown = container.allKeys.first(where: { !allowed.contains($0.stringValue) }) {
    throw DecodingError.dataCorruptedError(
      forKey: unknown,
      in: container,
      debugDescription: "unknown field"
    )
  }
}

private func requireLiteral(
  _ value: String,
  _ expected: String,
  key: CodingKey,
  container: Any
) throws {
  guard value == expected else {
    let context = DecodingError.Context(
      codingPath: [key],
      debugDescription: "expected literal \(expected)"
    )
    throw DecodingError.dataCorrupted(context)
  }
}

public enum ViraIOSSemanticIdentifier {
  public static func isSegment(_ value: String) -> Bool {
    guard !value.isEmpty, value.count <= 128 else { return false }
    let scalars = Array(value.unicodeScalars)
    guard let first = scalars.first, first.value >= 97, first.value <= 122 else { return false }
    var previousHyphen = false
    for scalar in scalars.dropFirst() {
      let lower = scalar.value >= 97 && scalar.value <= 122
      let digit = scalar.value >= 48 && scalar.value <= 57
      let hyphen = scalar.value == 45
      guard lower || digit || hyphen else { return false }
      if hyphen && previousHyphen { return false }
      previousHyphen = hyphen
    }
    return scalars.last?.value != 45
  }

  public static func isNamespace(_ value: String, requiresDot: Bool = false) -> Bool {
    guard !value.isEmpty, value.count <= 4_096 else { return false }
    let segments = value.split(separator: ".", omittingEmptySubsequences: false)
    if requiresDot && segments.count < 2 { return false }
    return !segments.isEmpty && segments.allSatisfy { isSegment(String($0)) }
  }

  static func isScopePath(_ value: String) -> Bool {
    guard value.hasPrefix("currentItem.") else { return false }
    let tail = String(value.dropFirst("currentItem.".count))
    return isNamespace(tail)
  }
}

public struct ViraIOSPackIdentity: Codable, Equatable, Sendable {
  public let id: String
  public let version: String
  public let entrypoint: String

  private enum CodingKeys: String, CodingKey { case id, version, entrypoint }

  public init(id: String, version: String, entrypoint: String) {
    self.id = id
    self.version = version
    self.entrypoint = entrypoint
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["id", "version", "entrypoint"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    version = try c.decode(String.self, forKey: .version)
    entrypoint = try c.decode(String.self, forKey: .entrypoint)
    guard !id.isEmpty, !version.isEmpty, !entrypoint.isEmpty else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "pack identity must be non-empty")
      )
    }
  }
}

public struct ViraIOSArtifactIdentity: Codable, Equatable, Sendable {
  public let id: String
  public let role: String
  public let mediaType: String
  public let digest: String

  private enum CodingKeys: String, CodingKey { case id, role, mediaType, digest }

  public init(id: String, role: String = "studio-publication", mediaType: String = "application/json", digest: String) {
    self.id = id
    self.role = role
    self.mediaType = mediaType
    self.digest = digest
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["id", "role", "mediaType", "digest"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    role = try c.decode(String.self, forKey: .role)
    mediaType = try c.decode(String.self, forKey: .mediaType)
    digest = try c.decode(String.self, forKey: .digest)
    guard role == "studio-publication", mediaType == "application/json", !id.isEmpty, !digest.isEmpty else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid Studio publication artifact identity")
      )
    }
  }
}

public struct ViraIOSCompatibilityIdentity: Codable, Equatable, Sendable {
  public let hostId: String
  public let platform: String

  private enum CodingKeys: String, CodingKey { case hostId, platform }

  public init(hostId: String, platform: String = VIRA_IOS_PLATFORM) {
    self.hostId = hostId
    self.platform = platform
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["hostId", "platform"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    hostId = try c.decode(String.self, forKey: .hostId)
    platform = try c.decode(String.self, forKey: .platform)
    guard ViraIOSSemanticIdentifier.isNamespace(hostId, requiresDot: true), platform == VIRA_IOS_PLATFORM else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid iOS compatibility identity")
      )
    }
  }
}

public struct ViraIOSCapability: Codable, Equatable, Hashable, Sendable {
  public let version: String
  public let id: String

  private enum CodingKeys: String, CodingKey { case version, id }

  public init(version: String, id: String) {
    self.version = version
    self.id = id
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["version", "id"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    id = try c.decode(String.self, forKey: .id)
    guard !version.isEmpty, ViraIOSSemanticIdentifier.isNamespace(id) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid Host capability")
      )
    }
  }
}

public struct ViraIOSHostManifest: Codable, Equatable, Sendable {
  public let version: String
  public let id: String
  public let platform: String
  public let implementationIds: [String]
  public let capabilities: [ViraIOSCapability]

  private enum CodingKeys: String, CodingKey {
    case version, id, platform, implementationIds, capabilities
  }

  public init(
    version: String = "1",
    id: String,
    platform: String = VIRA_IOS_PLATFORM,
    implementationIds: [String],
    capabilities: [ViraIOSCapability]
  ) {
    self.version = version
    self.id = id
    self.platform = platform
    self.implementationIds = implementationIds
    self.capabilities = capabilities
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(
      decoder,
      allowed: ["version", "id", "platform", "implementationIds", "capabilities"]
    )
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    id = try c.decode(String.self, forKey: .id)
    platform = try c.decode(String.self, forKey: .platform)
    implementationIds = try c.decode([String].self, forKey: .implementationIds)
    capabilities = try c.decode([ViraIOSCapability].self, forKey: .capabilities)
    guard version == "1", platform == VIRA_IOS_PLATFORM,
          ViraIOSSemanticIdentifier.isNamespace(id, requiresDot: true),
          implementationIds.count <= 512,
          capabilities.count <= 256 else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid iOS Host Manifest")
      )
    }
    var implementations = Set<String>()
    for implementationId in implementationIds {
      guard ViraIOSSemanticIdentifier.isNamespace(implementationId, requiresDot: true),
            implementations.insert(implementationId).inserted else {
        throw DecodingError.dataCorrupted(
          .init(codingPath: decoder.codingPath, debugDescription: "invalid or duplicate iOS implementation ID")
        )
      }
    }
    guard Set(capabilities).count == capabilities.count else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "duplicate Host capability")
      )
    }
  }
}

public enum ViraIOSCatalogValueType: String, Codable, Equatable, Sendable {
  case string
  case number
  case boolean
  case `enum`
}

public enum ViraIOSBindingValueType: String, Codable, Equatable, Sendable {
  case string
  case number
  case boolean
  case `enum`
  case array
  case object
}

public enum ViraIOSBindingSourceKind: String, Codable, Equatable, Sendable {
  case state
  case domain
  case scope
}

public struct ViraIOSBindingSourceDefinition: Codable, Equatable, Sendable {
  public let kind: ViraIOSBindingSourceKind
  public let path: String
  public let valueType: ViraIOSBindingValueType

  private enum CodingKeys: String, CodingKey { case kind, path, valueType }

  public init(kind: ViraIOSBindingSourceKind, path: String, valueType: ViraIOSBindingValueType) {
    self.kind = kind
    self.path = path
    self.valueType = valueType
  }

  public init(kind: StudioBindingSourceKind, path: String, valueType: ViraIOSBindingValueType) {
    switch kind {
    case .state: self.kind = .state
    case .domain: self.kind = .domain
    case .scope: self.kind = .scope
    }
    self.path = path
    self.valueType = valueType
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["kind", "path", "valueType"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    kind = try c.decode(ViraIOSBindingSourceKind.self, forKey: .kind)
    path = try c.decode(String.self, forKey: .path)
    valueType = try c.decode(ViraIOSBindingValueType.self, forKey: .valueType)
    let pathIsValid = kind == .scope
      ? ViraIOSSemanticIdentifier.isScopePath(path)
      : ViraIOSSemanticIdentifier.isNamespace(path)
    guard pathIsValid else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid native binding source")
      )
    }
  }
}

public struct ViraIOSPropDefinition: Codable, Equatable, Sendable {
  public let key: String
  public let type: ViraIOSCatalogValueType
  public let required: Bool
  public let bindable: Bool
  public let options: [String]?

  private enum CodingKeys: String, CodingKey { case key, type, required, bindable, options }

  public init(
    key: String,
    type: ViraIOSCatalogValueType,
    required: Bool,
    bindable: Bool,
    options: [String]? = nil
  ) {
    self.key = key
    self.type = type
    self.required = required
    self.bindable = bindable
    self.options = options
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["key", "type", "required", "bindable", "options"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    type = try c.decode(ViraIOSCatalogValueType.self, forKey: .type)
    required = try c.decode(Bool.self, forKey: .required)
    bindable = try c.decode(Bool.self, forKey: .bindable)
    options = try c.decodeIfPresent([String].self, forKey: .options)
    guard !key.isEmpty else {
      throw DecodingError.dataCorruptedError(forKey: .key, in: c, debugDescription: "empty prop key")
    }
    if type == .enum {
      guard let options, !options.isEmpty, Set(options).count == options.count else {
        throw DecodingError.dataCorruptedError(forKey: .options, in: c, debugDescription: "enum prop requires unique options")
      }
    } else if options != nil {
      throw DecodingError.dataCorruptedError(forKey: .options, in: c, debugDescription: "non-enum prop cannot declare options")
    }
  }
}

public struct ViraIOSEventPayloadDefinition: Codable, Equatable, Sendable {
  public let key: String
  public let type: ViraIOSCatalogValueType
  public let required: Bool
  public let options: [String]?

  private enum CodingKeys: String, CodingKey { case key, type, required, options }

  public init(
    key: String,
    type: ViraIOSCatalogValueType,
    required: Bool,
    options: [String]? = nil
  ) {
    self.key = key
    self.type = type
    self.required = required
    self.options = options
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["key", "type", "required", "options"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    type = try c.decode(ViraIOSCatalogValueType.self, forKey: .type)
    required = try c.decode(Bool.self, forKey: .required)
    options = try c.decodeIfPresent([String].self, forKey: .options)
    guard !key.isEmpty else {
      throw DecodingError.dataCorruptedError(forKey: .key, in: c, debugDescription: "empty event payload key")
    }
    if type == .enum {
      guard let options, !options.isEmpty, Set(options).count == options.count else {
        throw DecodingError.dataCorruptedError(forKey: .options, in: c, debugDescription: "enum event payload requires unique options")
      }
    } else if options != nil {
      throw DecodingError.dataCorruptedError(forKey: .options, in: c, debugDescription: "non-enum prop cannot declare options")
    }
  }
}

public struct ViraIOSEventDefinition: Codable, Equatable, Sendable {
  public let name: String
  public let payload: [ViraIOSEventPayloadDefinition]?

  private enum CodingKeys: String, CodingKey { case name, payload }

  public init(name: String, payload: [ViraIOSEventPayloadDefinition]? = nil) {
    self.name = name
    self.payload = payload
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["name", "payload"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    name = try c.decode(String.self, forKey: .name)
    payload = try c.decodeIfPresent([ViraIOSEventPayloadDefinition].self, forKey: .payload)
    guard !name.isEmpty else {
      throw DecodingError.dataCorruptedError(forKey: .name, in: c, debugDescription: "empty event name")
    }
    if let payload {
      guard Set(payload.map(\.key)).count == payload.count else {
        throw DecodingError.dataCorruptedError(forKey: .payload, in: c, debugDescription: "duplicate event payload field")
      }
    }
  }
}

public struct ViraIOSComponentDefinition: Codable, Equatable, Sendable {
  public let ref: String
  public let implementationId: String
  public let props: [ViraIOSPropDefinition]
  public let slots: [String]
  public let events: [ViraIOSEventDefinition]

  private enum CodingKeys: String, CodingKey { case ref, implementationId, props, slots, events }

  public init(
    ref: String,
    implementationId: String,
    props: [ViraIOSPropDefinition],
    slots: [String],
    events: [ViraIOSEventDefinition]
  ) {
    self.ref = ref
    self.implementationId = implementationId
    self.props = props
    self.slots = slots
    self.events = events
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["ref", "implementationId", "props", "slots", "events"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    ref = try c.decode(String.self, forKey: .ref)
    implementationId = try c.decode(String.self, forKey: .implementationId)
    props = try c.decode([ViraIOSPropDefinition].self, forKey: .props)
    slots = try c.decode([String].self, forKey: .slots)
    events = try c.decode([ViraIOSEventDefinition].self, forKey: .events)
    guard ViraIOSSemanticIdentifier.isNamespace(ref, requiresDot: true),
          ViraIOSSemanticIdentifier.isNamespace(implementationId, requiresDot: true),
          Set(props.map(\.key)).count == props.count,
          Set(slots).count == slots.count,
          slots.allSatisfy({ !$0.isEmpty }),
          Set(events.map(\.name)).count == events.count else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid native component definition")
      )
    }
  }
}

public struct ViraIOSActionMapping: Codable, Equatable, Sendable {
  public let event: String
  public let actionType: String

  private enum CodingKeys: String, CodingKey { case event, actionType }

  public init(event: String, actionType: String) {
    self.event = event
    self.actionType = actionType
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["event", "actionType"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    event = try c.decode(String.self, forKey: .event)
    actionType = try c.decode(String.self, forKey: .actionType)
    guard !event.isEmpty, ViraIOSSemanticIdentifier.isNamespace(actionType) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid action mapping")
      )
    }
  }
}

public struct ViraIOSBrandProjection: Codable, Equatable, Sendable {
  public let version: String
  public let id: String
  public let components: [ViraIOSComponentDefinition]
  public let actions: [ViraIOSActionMapping]
  public let dataSources: [ViraIOSBindingSourceDefinition]

  private enum CodingKeys: String, CodingKey { case version, id, components, actions, dataSources }

  public init(
    version: String = "1",
    id: String,
    components: [ViraIOSComponentDefinition],
    actions: [ViraIOSActionMapping],
    dataSources: [ViraIOSBindingSourceDefinition]
  ) {
    self.version = version
    self.id = id
    self.components = components
    self.actions = actions
    self.dataSources = dataSources
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(decoder, allowed: ["version", "id", "components", "actions", "dataSources"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    id = try c.decode(String.self, forKey: .id)
    components = try c.decode([ViraIOSComponentDefinition].self, forKey: .components)
    actions = try c.decode([ViraIOSActionMapping].self, forKey: .actions)
    dataSources = try c.decode([ViraIOSBindingSourceDefinition].self, forKey: .dataSources)
    let sourceIdentities = dataSources.map { "\($0.kind.rawValue):\($0.path)" }
    guard version == "1", ViraIOSSemanticIdentifier.isNamespace(id),
          Set(components.map(\.ref)).count == components.count,
          Set(actions.map(\.event)).count == actions.count,
          dataSources.count <= 512,
          Set(sourceIdentities).count == sourceIdentities.count else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid native Brand projection")
      )
    }
  }
}

public struct ViraIOSMountEnvelope: Decodable, Equatable {
  public let version: String
  public let instanceId: String
  public let deploymentId: String
  public let pack: ViraIOSPackIdentity
  public let artifact: ViraIOSArtifactIdentity
  public let compatibility: ViraIOSCompatibilityIdentity
  public let host: ViraIOSHostManifest
  public let brand: ViraIOSBrandProjection
  public let document: StudioExperienceDocument

  private enum CodingKeys: String, CodingKey {
    case version, instanceId, deploymentId, pack, artifact, compatibility, host, brand, document
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFields(
      decoder,
      allowed: [
        "version", "instanceId", "deploymentId", "pack", "artifact",
        "compatibility", "host", "brand", "document",
      ]
    )
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    instanceId = try c.decode(String.self, forKey: .instanceId)
    deploymentId = try c.decode(String.self, forKey: .deploymentId)
    pack = try c.decode(ViraIOSPackIdentity.self, forKey: .pack)
    artifact = try c.decode(ViraIOSArtifactIdentity.self, forKey: .artifact)
    compatibility = try c.decode(ViraIOSCompatibilityIdentity.self, forKey: .compatibility)
    host = try c.decode(ViraIOSHostManifest.self, forKey: .host)
    brand = try c.decode(ViraIOSBrandProjection.self, forKey: .brand)
    document = try c.decode(StudioExperienceDocument.self, forKey: .document)

    guard validateViraIOSDocumentGraphSafety(document) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "unsafe native document graph")
      )
    }
    guard validateViraIOSDocumentProjectionIntegrity(document, brand: brand) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid native document projection")
      )
    }

    guard version == VIRA_IOS_MOUNT_ENVELOPE_VERSION,
          !instanceId.isEmpty,
          instanceId.count <= VIRA_IOS_MAX_INSTANCE_ID_LENGTH,
          !deploymentId.isEmpty,
          deploymentId.count <= VIRA_IOS_MAX_INSTANCE_ID_LENGTH,
          compatibility.hostId == host.id,
          compatibility.platform == VIRA_IOS_PLATFORM,
          host.platform == VIRA_IOS_PLATFORM else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid exact iOS mount identity")
      )
    }

    let supported = Set(host.implementationIds)
    guard brand.components.allSatisfy({ supported.contains($0.implementationId) }) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "Brand requires unsupported iOS implementation")
      )
    }
    let components = Set(brand.components.map(\.ref))
    for view in document.views {
      guard view.nodes.allSatisfy({ components.contains($0.component) }) else {
        throw DecodingError.dataCorrupted(
          .init(codingPath: decoder.codingPath, debugDescription: "document references component outside native Brand projection")
        )
      }
    }
    let actions = Set(brand.actions.map(\.event))
    guard document.interactions.allSatisfy({ actions.contains($0.actionEvent) }) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "document references action outside native Brand projection")
      )
    }
  }

  public static func decode(_ data: Data) -> Result<ViraIOSMountEnvelope, ViraIOSIssue> {
    do {
      return .success(try JSONDecoder().decode(ViraIOSMountEnvelope.self, from: data))
    } catch {
      return .failure(.init(
        code: .invalidEnvelope,
        path: "$",
        message: "native mount envelope is invalid"
      ))
    }
  }
}
