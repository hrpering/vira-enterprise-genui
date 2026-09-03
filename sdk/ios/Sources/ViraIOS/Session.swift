import Foundation

public enum ViraIOSSessionVisibility: String, Codable, Equatable, Sendable {
  case foreground
  case background
}

public enum ViraIOSSessionConnectivity: String, Codable, Equatable, Sendable {
  case connected
  case disconnected
}

public enum ViraIOSSessionContinuity: String, Codable, Equatable, Sendable {
  case live
  case restored
}

public enum ViraIOSSessionCacheStatus: String, Codable, Equatable, Sendable {
  case inactive
  case verificationRequired = "verification-required"
}

public enum ViraIOSLifecycleEventType: String, Codable, Equatable, Sendable {
  case foreground
  case background
  case resume
  case disconnect
  case reconnect
}

public struct ViraIOSLifecycleSnapshot: Equatable, Sendable {
  public let visibility: ViraIOSSessionVisibility
  public let connectivity: ViraIOSSessionConnectivity

  public init(
    visibility: ViraIOSSessionVisibility,
    connectivity: ViraIOSSessionConnectivity
  ) {
    self.visibility = visibility
    self.connectivity = connectivity
  }
}

public struct ViraIOSLifecycleEvent: Codable, Equatable, Sendable {
  public let version: String
  public let type: ViraIOSLifecycleEventType

  private enum CodingKeys: String, CodingKey { case version, type }

  public init(type: ViraIOSLifecycleEventType) {
    self.version = "1"
    self.type = type
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFieldsForSession(decoder, allowed: ["version", "type"])
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    type = try c.decode(ViraIOSLifecycleEventType.self, forKey: .type)
    guard version == "1" else {
      throw DecodingError.dataCorruptedError(forKey: .version, in: c, debugDescription: "expected lifecycle event version 1")
    }
  }
}

private struct ViraIOSSessionAnyCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int?
  init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }
  init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
}

private func rejectUnknownFieldsForSession(
  _ decoder: Decoder,
  allowed: Set<String>
) throws {
  let c = try decoder.container(keyedBy: ViraIOSSessionAnyCodingKey.self)
  if let unknown = c.allKeys.first(where: { !allowed.contains($0.stringValue) }) {
    throw DecodingError.dataCorruptedError(forKey: unknown, in: c, debugDescription: "unknown field")
  }
}

public struct ViraIOSSessionState: Codable, Equatable, Sendable {
  public let version: String
  public let instanceId: String
  public let revision: Int64
  public let visibility: ViraIOSSessionVisibility
  public let connectivity: ViraIOSSessionConnectivity
  public let continuity: ViraIOSSessionContinuity
  public let cacheStatus: ViraIOSSessionCacheStatus

  private enum CodingKeys: String, CodingKey {
    case version, instanceId, revision, visibility, connectivity, continuity, cacheStatus
  }

  private init(
    instanceId: String,
    revision: Int64,
    visibility: ViraIOSSessionVisibility,
    connectivity: ViraIOSSessionConnectivity,
    continuity: ViraIOSSessionContinuity,
    cacheStatus: ViraIOSSessionCacheStatus
  ) {
    self.version = "1"
    self.instanceId = instanceId
    self.revision = revision
    self.visibility = visibility
    self.connectivity = connectivity
    self.continuity = continuity
    self.cacheStatus = cacheStatus
  }

  public init(from decoder: Decoder) throws {
    try rejectUnknownFieldsForSession(
      decoder,
      allowed: [
        "version", "instanceId", "revision", "visibility",
        "connectivity", "continuity", "cacheStatus",
      ]
    )
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(String.self, forKey: .version)
    instanceId = try c.decode(String.self, forKey: .instanceId)
    revision = try c.decode(Int64.self, forKey: .revision)
    visibility = try c.decode(ViraIOSSessionVisibility.self, forKey: .visibility)
    connectivity = try c.decode(ViraIOSSessionConnectivity.self, forKey: .connectivity)
    continuity = try c.decode(ViraIOSSessionContinuity.self, forKey: .continuity)
    cacheStatus = try c.decode(ViraIOSSessionCacheStatus.self, forKey: .cacheStatus)
    guard Self.isValid(
      version: version,
      instanceId: instanceId,
      revision: revision,
      continuity: continuity,
      cacheStatus: cacheStatus
    ) else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "invalid runtime session state")
      )
    }
  }

  private static func isValid(
    version: String,
    instanceId: String,
    revision: Int64,
    continuity: ViraIOSSessionContinuity,
    cacheStatus: ViraIOSSessionCacheStatus
  ) -> Bool {
    guard version == "1",
          !instanceId.isEmpty,
          instanceId.count <= VIRA_IOS_MAX_INSTANCE_ID_LENGTH,
          revision >= 0,
          revision <= VIRA_IOS_MAX_SAFE_INTEGER else { return false }
    switch (continuity, cacheStatus) {
    case (.live, .inactive), (.restored, .verificationRequired): return true
    default: return false
    }
  }

  public static func create(
    instanceId: String,
    snapshot: ViraIOSLifecycleSnapshot
  ) -> Result<ViraIOSSessionState, ViraIOSIssue> {
    guard !instanceId.isEmpty, instanceId.count <= VIRA_IOS_MAX_INSTANCE_ID_LENGTH else {
      return .failure(.init(
        code: .invalidSessionState,
        path: "$.instanceId",
        message: "runtime session requires an exact bounded instanceId"
      ))
    }
    return .success(.init(
      instanceId: instanceId,
      revision: 0,
      visibility: snapshot.visibility,
      connectivity: snapshot.connectivity,
      continuity: .live,
      cacheStatus: .inactive
    ))
  }

  public static func restore(
    expectedInstanceId: String,
    persisted: ViraIOSSessionState
  ) -> Result<ViraIOSSessionTransition, ViraIOSIssue> {
    guard !expectedInstanceId.isEmpty,
          expectedInstanceId.count <= VIRA_IOS_MAX_INSTANCE_ID_LENGTH else {
      return .failure(.init(
        code: .invalidSessionState,
        path: "$.expectedInstanceId",
        message: "expected runtime session instanceId is invalid"
      ))
    }
    guard persisted.instanceId == expectedInstanceId else {
      return .failure(.init(
        code: .instanceMismatch,
        path: "$.instanceId",
        message: "persisted runtime session belongs to a different instance"
      ))
    }
    guard persisted.revision < VIRA_IOS_MAX_SAFE_INTEGER else {
      return .failure(.init(
        code: .revisionOverflow,
        path: "$.revision",
        message: "runtime session revision cannot be incremented safely"
      ))
    }
    return .success(.init(
      state: .init(
        instanceId: expectedInstanceId,
        revision: persisted.revision + 1,
        visibility: persisted.visibility,
        connectivity: persisted.connectivity,
        continuity: .restored,
        cacheStatus: .verificationRequired
      ),
      changed: true
    ))
  }

  public func transition(
    _ event: ViraIOSLifecycleEvent
  ) -> Result<ViraIOSSessionTransition, ViraIOSIssue> {
    var nextVisibility = visibility
    var nextConnectivity = connectivity

    switch event.type {
    case .background:
      nextVisibility = .background
    case .foreground, .resume:
      nextVisibility = .foreground
    case .disconnect:
      nextConnectivity = .disconnected
    case .reconnect:
      nextConnectivity = .connected
    }

    if nextVisibility == visibility && nextConnectivity == connectivity {
      return .success(.init(state: self, changed: false))
    }
    guard revision < VIRA_IOS_MAX_SAFE_INTEGER else {
      return .failure(.init(
        code: .revisionOverflow,
        path: "$.revision",
        message: "runtime session revision cannot be incremented safely"
      ))
    }
    return .success(.init(
      state: .init(
        instanceId: instanceId,
        revision: revision + 1,
        visibility: nextVisibility,
        connectivity: nextConnectivity,
        continuity: continuity,
        cacheStatus: cacheStatus
      ),
      changed: true
    ))
  }
}

public struct ViraIOSSessionTransition: Equatable, Sendable {
  public let state: ViraIOSSessionState
  public let changed: Bool

  public init(state: ViraIOSSessionState, changed: Bool) {
    self.state = state
    self.changed = changed
  }
}

public protocol ViraIOSLifecycleSource: AnyObject {
  func snapshot() throws -> ViraIOSLifecycleSnapshot
  func subscribe(_ listener: @escaping (ViraIOSLifecycleEvent) -> Void) throws -> () -> Void
}
