import Foundation

private struct ViraIOSPermissionAnyCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int?
  init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }
  init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
}

private func rejectUnknownPermissionFields(
  _ decoder: Decoder,
  allowed: Set<String>
) throws {
  let c = try decoder.container(keyedBy: ViraIOSPermissionAnyCodingKey.self)
  if let unknown = c.allKeys.first(where: { !allowed.contains($0.stringValue) }) {
    throw DecodingError.dataCorruptedError(forKey: unknown, in: c, debugDescription: "unknown field")
  }
}

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
    try rejectUnknownPermissionFields(decoder, allowed: ["subject", "id", "effect"])
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

  private init(validatedRules: [ViraIOSPermissionRule]) {
    self.version = "1"
    self.rules = validatedRules
  }

  private static func validationIssue(
    _ rules: [ViraIOSPermissionRule]
  ) -> ViraIOSIssue? {
    guard rules.count <= 512 else {
      return .init(
        code: .invalidEnvelope,
        path: "$.permissionPolicy.rules",
        message: "native runtime permission policy exceeds the canonical rule limit"
      )
    }
    var identities = Set<String>()
    for rule in rules {
      guard ViraIOSSemanticIdentifier.isNamespace(rule.id, requiresDot: true) else {
        return .init(
          code: .invalidEnvelope,
          path: "$.permissionPolicy.rules",
          message: "native runtime permission rule id is invalid"
        )
      }
      let identity = "\(rule.subject.rawValue)\u{0}\(rule.id)"
      guard identities.insert(identity).inserted else {
        return .init(
          code: .invalidEnvelope,
          path: "$.permissionPolicy.rules",
          message: "native runtime permission policy contains a duplicate rule"
        )
      }
    }
    return nil
  }

  public static func create(
    rules: [ViraIOSPermissionRule]
  ) -> Result<ViraIOSPermissionPolicy, ViraIOSIssue> {
    if let issue = validationIssue(rules) { return .failure(issue) }
    return .success(.init(validatedRules: rules))
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownPermissionFields(decoder, allowed: ["version", "rules"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let version = try c.decode(String.self, forKey: .version)
    let rules = try c.decode([ViraIOSPermissionRule].self, forKey: .rules)
    guard version == "1", Self.validationIssue(rules) == nil else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid runtime permission policy")
      )
    }
    self.version = version
    self.rules = rules
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