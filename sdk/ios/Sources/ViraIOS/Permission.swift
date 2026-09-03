import Foundation

public enum ViraIOSPermissionSubject: String, Codable, Equatable, Sendable {
  case action
  case capability
}

public enum ViraIOSPermissionEffect: String, Codable, Equatable, Sendable {
  case allow
  case deny
  case confirm
}

public struct ViraIOSPermissionRule: Codable, Equatable, Hashable, Sendable {
  public let subject: ViraIOSPermissionSubject
  public let id: String
  public let effect: ViraIOSPermissionEffect

  private enum CodingKeys: String, CodingKey { case subject, id, effect }

  public init(
    subject: ViraIOSPermissionSubject,
    id: String,
    effect: ViraIOSPermissionEffect
  ) {
    self.subject = subject
    self.id = id
    self.effect = effect
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    subject = try c.decode(ViraIOSPermissionSubject.self, forKey: .subject)
    id = try c.decode(String.self, forKey: .id)
    effect = try c.decode(ViraIOSPermissionEffect.self, forKey: .effect)
    guard ViraIOSSemanticIdentifier.isNamespace(id, requiresDot: true) else {
      throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "invalid permission rule id")
    }
  }
}

public struct ViraIOSPermissionPolicy: Codable, Equatable, Sendable {
  public let version: String
  public let rules: [ViraIOSPermissionRule]

  private enum CodingKeys: String, CodingKey { case version, rules }

  public init(version: String = "1", rules: [ViraIOSPermissionRule]) {
    self.version = version
    self.rules = rules
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    rules = try c.decode([ViraIOSPermissionRule].self, forKey: .rules)
    guard version == "1", rules.count <= 512 else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid runtime permission policy")
      )
    }
    let identities = rules.map { "\($0.subject.rawValue)\u{0}\($0.id)" }
    guard Set(identities).count == identities.count else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "duplicate runtime permission rule")
      )
    }
  }

  public static func decode(_ data: Data) -> Result<ViraIOSPermissionPolicy, ViraIOSIssue> {
    do {
      return .success(try JSONDecoder().decode(ViraIOSPermissionPolicy.self, from: data))
    } catch {
      return .failure(.init(
        code: .invalidEnvelope,
        path: "$.permissionPolicy",
        message: "native runtime permission policy is invalid"
      ))
    }
  }

  public func effect(
    subject: ViraIOSPermissionSubject,
    id: String
  ) -> ViraIOSPermissionEffect {
    rules.first(where: { $0.subject == subject && $0.id == id })?.effect ?? .deny
  }
}
