import Foundation

public final class ViraIOSSessionController {
  private let source: ViraIOSLifecycleSource
  private let lock = NSLock()
  private var stateValue: ViraIOSSessionState
  private var disposed = false
  private var unsubscribe: (() -> Void)?
  private var listeners: [UUID: (ViraIOSSessionState) -> Void] = [:]

  private init(
    source: ViraIOSLifecycleSource,
    state: ViraIOSSessionState
  ) {
    self.source = source
    self.stateValue = state
  }

  public static func create(
    instanceId: String,
    source: ViraIOSLifecycleSource
  ) -> Result<ViraIOSSessionController, ViraIOSIssue> {
    let snapshot: ViraIOSLifecycleSnapshot
    do {
      snapshot = try source.snapshot()
    } catch {
      return .failure(.init(
        code: .invalidLifecycleSource,
        path: "$.lifecycle.snapshot",
        message: "native lifecycle source snapshot failed"
      ))
    }
    let state: ViraIOSSessionState
    switch ViraIOSSessionState.create(instanceId: instanceId, snapshot: snapshot) {
    case .failure(let issue): return .failure(issue)
    case .success(let value): state = value
    }
    return attach(source: source, state: state)
  }

  public static func restore(
    instanceId: String,
    persisted: ViraIOSSessionState,
    source: ViraIOSLifecycleSource
  ) -> Result<ViraIOSSessionController, ViraIOSIssue> {
    let state: ViraIOSSessionState
    switch ViraIOSSessionState.restore(expectedInstanceId: instanceId, persisted: persisted) {
    case .failure(let issue): return .failure(issue)
    case .success(let transition): state = transition.state
    }
    return attach(source: source, state: state)
  }

  private static func attach(
    source: ViraIOSLifecycleSource,
    state: ViraIOSSessionState
  ) -> Result<ViraIOSSessionController, ViraIOSIssue> {
    let controller = ViraIOSSessionController(source: source, state: state)
    do {
      controller.unsubscribe = try source.subscribe { [weak controller] event in
        controller?.receive(event)
      }
    } catch {
      return .failure(.init(
        code: .invalidLifecycleSource,
        path: "$.lifecycle.subscribe",
        message: "native lifecycle source subscription failed"
      ))
    }
    return .success(controller)
  }

  private func receive(_ event: ViraIOSLifecycleEvent) {
    let callbacks: [(ViraIOSSessionState) -> Void]
    let next: ViraIOSSessionState

    lock.lock()
    if disposed {
      lock.unlock()
      return
    }
    switch stateValue.transition(event) {
    case .failure:
      lock.unlock()
      return
    case .success(let transition):
      if !transition.changed {
        lock.unlock()
        return
      }
      stateValue = transition.state
      next = transition.state
      callbacks = Array(listeners.values)
      lock.unlock()
    }

    for callback in callbacks {
      callback(next)
    }
  }

  public func state() -> Result<ViraIOSSessionState, ViraIOSIssue> {
    lock.lock()
    defer { lock.unlock() }
    if disposed {
      return .failure(.init(code: .disposed, path: "$", message: "native lifecycle controller is disposed"))
    }
    return .success(stateValue)
  }

  public func transition(
    _ type: ViraIOSLifecycleEventType
  ) -> Result<ViraIOSSessionTransition, ViraIOSIssue> {
    let callbacks: [(ViraIOSSessionState) -> Void]
    let transition: ViraIOSSessionTransition

    lock.lock()
    if disposed {
      lock.unlock()
      return .failure(.init(code: .disposed, path: "$", message: "native lifecycle controller is disposed"))
    }
    switch stateValue.transition(.init(type: type)) {
    case .failure(let issue):
      lock.unlock()
      return .failure(issue)
    case .success(let value):
      transition = value
      if value.changed {
        stateValue = value.state
        callbacks = Array(listeners.values)
      } else {
        callbacks = []
      }
      lock.unlock()
    }

    if transition.changed {
      for callback in callbacks {
        callback(transition.state)
      }
    }
    return .success(transition)
  }

  public func subscribe(
    _ listener: @escaping (ViraIOSSessionState) -> Void
  ) -> () -> Void {
    let id = UUID()
    lock.lock()
    if disposed {
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