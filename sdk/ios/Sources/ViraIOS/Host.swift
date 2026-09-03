import Foundation
import ViraStudioExperienceWire

public enum ViraIOSHostActionOutcome: String, Codable, Equatable, Sendable {
  case success
  case empty
  case error
}

public struct ViraIOSHostSnapshot: Equatable {
  public let version: String
  public let revision: Int64
  public let state: [String: ViraJSONValue]
  public let domain: [String: ViraJSONValue]

  public init(
    version: String = "1",
    revision: Int64,
    state: [String: ViraJSONValue],
    domain: [String: ViraJSONValue]
  ) {
    self.version = version
    self.revision = revision
    self.state = state
    self.domain = domain
  }

  public var isCanonical: Bool {
    version == "1" && revision >= 0 && revision <= VIRA_IOS_MAX_SAFE_INTEGER
  }
}

public struct ViraIOSHostActionDescriptor: Equatable {
  public let type: String
  public let payload: [String: ViraJSONValue]

  public init(type: String, payload: [String: ViraJSONValue]) {
    self.type = type
    self.payload = payload
  }
}

public struct ViraIOSHostActionResult: Equatable {
  public let outcome: ViraIOSHostActionOutcome
  public let snapshot: ViraIOSHostSnapshot?

  public init(
    outcome: ViraIOSHostActionOutcome,
    snapshot: ViraIOSHostSnapshot? = nil
  ) {
    self.outcome = outcome
    self.snapshot = snapshot
  }
}

@MainActor
public protocol ViraIOSHostBridge: AnyObject {
  var version: String { get }
  var id: String { get }
  func snapshot() throws -> ViraIOSHostSnapshot
  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult
  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void
}

public enum ViraIOSBindingRoot: Equatable, Sendable {
  case state
  case domain
}

@MainActor
public final class ViraIOSHostAdapter {
  private let bridge: ViraIOSHostBridge
  private let lock = NSLock()
  private var currentSnapshot: ViraIOSHostSnapshot
  private var subscriptionFault: ViraIOSIssue?
  private var disposed = false
  private var unsubscribe: (() -> Void)?
  private var listeners: [UUID: (ViraIOSHostSnapshot) -> Void] = [:]

  public let hostId: String

  private init(
    bridge: ViraIOSHostBridge,
    initial: ViraIOSHostSnapshot
  ) {
    self.bridge = bridge
    self.currentSnapshot = initial
    self.hostId = bridge.id
  }

  public static func create(
    bridge: ViraIOSHostBridge
  ) -> Result<ViraIOSHostAdapter, ViraIOSIssue> {
    guard bridge.version == "1",
          ViraIOSSemanticIdentifier.isNamespace(bridge.id, requiresDot: true) else {
      return .failure(.init(
        code: .invalidHost,
        path: "$.host",
        message: "native host bridge identity is invalid"
      ))
    }

    let initial: ViraIOSHostSnapshot
    do {
      initial = try bridge.snapshot()
    } catch {
      return .failure(.init(
        code: .invalidSnapshot,
        path: "$.host.snapshot",
        message: "native host snapshot failed"
      ))
    }
    guard initial.isCanonical else {
      return .failure(.init(
        code: .invalidSnapshot,
        path: "$.host.snapshot",
        message: "native host snapshot is invalid"
      ))
    }

    let adapter = ViraIOSHostAdapter(bridge: bridge, initial: initial)
    do {
      let candidate = try bridge.subscribe { [weak adapter] snapshot in
        adapter?.receive(snapshot)
      }
      adapter.unsubscribe = candidate
    } catch {
      return .failure(.init(
        code: .invalidHost,
        path: "$.host.subscribe",
        message: "native host subscription failed"
      ))
    }
    return .success(adapter)
  }

  private func receive(_ candidate: ViraIOSHostSnapshot) {
    let callbacks: [(ViraIOSHostSnapshot) -> Void]
    lock.lock()
    if disposed || subscriptionFault != nil {
      lock.unlock()
      return
    }
    guard candidate.isCanonical else {
      subscriptionFault = .init(
        code: .invalidSnapshot,
        path: "$.snapshot",
        message: "native host emitted an invalid snapshot"
      )
      lock.unlock()
      return
    }
    if candidate.revision < currentSnapshot.revision {
      subscriptionFault = .init(
        code: .staleSnapshot,
        path: "$.snapshot.revision",
        message: "native host snapshot revision moved backwards"
      )
      lock.unlock()
      return
    }
    if candidate.revision == currentSnapshot.revision {
      lock.unlock()
      return
    }
    currentSnapshot = candidate
    callbacks = Array(listeners.values)
    lock.unlock()

    for callback in callbacks {
      callback(candidate)
    }
  }

  private func dispatchStateIssue() -> ViraIOSIssue? {
    lock.lock()
    defer { lock.unlock() }
    if disposed {
      return .init(code: .disposed, path: "$", message: "native host adapter is disposed")
    }
    return subscriptionFault
  }

  public func snapshot() -> Result<ViraIOSHostSnapshot, ViraIOSIssue> {
    lock.lock()
    defer { lock.unlock() }
    if disposed {
      return .failure(.init(code: .disposed, path: "$", message: "native host adapter is disposed"))
    }
    if let subscriptionFault { return .failure(subscriptionFault) }
    return .success(currentSnapshot)
  }

  public func read(
    root: ViraIOSBindingRoot,
    path: String
  ) -> Result<ViraJSONValue, ViraIOSIssue> {
    let snapshot: ViraIOSHostSnapshot
    switch self.snapshot() {
    case .failure(let issue): return .failure(issue)
    case .success(let value): snapshot = value
    }

    let object = root == .state ? snapshot.state : snapshot.domain
    guard let value = ViraIOSHostAdapter.lookup(object: object, path: path) else {
      return .failure(.init(
        code: .dataValueInvalid,
        path: "$.binding",
        message: "native host binding value is unavailable"
      ))
    }
    return .success(value)
  }

  private static func lookup(
    object: [String: ViraJSONValue],
    path: String
  ) -> ViraJSONValue? {
    let segments = path.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
    guard !segments.isEmpty, segments.allSatisfy({ !$0.isEmpty }) else { return nil }
    var current: ViraJSONValue = .object(object)
    for segment in segments {
      guard case .object(let record) = current, let next = record[segment] else { return nil }
      current = next
    }
    return current
  }

  public func subscribe(
    _ listener: @escaping (ViraIOSHostSnapshot) -> Void
  ) -> () -> Void {
    let id = UUID()
    lock.lock()
    guard !disposed else {
      lock.unlock()
      return {}
    }
    listeners[id] = listener
    lock.unlock()

    var active = true
    return { [weak self] in
      guard active else { return }
      active = false
      self?.lock.lock()
      self?.listeners.removeValue(forKey: id)
      self?.lock.unlock()
    }
  }

  public func dispatch(
    _ action: ViraIOSHostActionDescriptor
  ) async -> Result<ViraIOSHostActionResult, ViraIOSIssue> {
    guard ViraIOSSemanticIdentifier.isNamespace(action.type, requiresDot: true) else {
      return .failure(.init(
        code: .invalidHostResult,
        path: "$.action.type",
        message: "native action type is invalid"
      ))
    }
    if let issue = dispatchStateIssue() { return .failure(issue) }

    let result: ViraIOSHostActionResult
    do {
      result = try await bridge.dispatch(action)
    } catch {
      if let issue = dispatchStateIssue() { return .failure(issue) }
      return .failure(.init(
        code: .hostDispatchFailed,
        path: "$.host.dispatch",
        message: "native host dispatch failed"
      ))
    }

    if let issue = dispatchStateIssue() { return .failure(issue) }
    if let snapshot = result.snapshot {
      receive(snapshot)
      if let issue = dispatchStateIssue() { return .failure(issue) }
    }
    return .success(result)
  }

  public func dispose() {
    let cleanup: (() -> Void)?
    lock.lock()
    if disposed {
      lock.unlock()
      return
    }
    disposed = true
    cleanup = unsubscribe
    unsubscribe = nil
    listeners.removeAll()
    lock.unlock()
    cleanup?()
  }

  deinit {
    dispose()
  }
}
