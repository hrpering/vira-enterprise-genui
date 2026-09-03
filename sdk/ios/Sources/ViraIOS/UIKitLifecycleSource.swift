#if canImport(UIKit)
import Foundation
import UIKit

public final class ViraIOSUIKitLifecycleSource: ViraIOSLifecycleSource {
  private let lock = NSLock()
  private var visibility: ViraIOSSessionVisibility
  private let connectivity: ViraIOSSessionConnectivity

  public init(
    initialVisibility: ViraIOSSessionVisibility,
    connectivity: ViraIOSSessionConnectivity
  ) {
    self.visibility = initialVisibility
    self.connectivity = connectivity
  }

  @MainActor
  public static func currentApplication(
    connectivity: ViraIOSSessionConnectivity
  ) -> ViraIOSUIKitLifecycleSource {
    let visibility: ViraIOSSessionVisibility = UIApplication.shared.applicationState == .background
      ? .background
      : .foreground
    return .init(initialVisibility: visibility, connectivity: connectivity)
  }

  public func snapshot() throws -> ViraIOSLifecycleSnapshot {
    lock.lock()
    defer { lock.unlock() }
    return .init(visibility: visibility, connectivity: connectivity)
  }

  public func subscribe(
    _ listener: @escaping (ViraIOSLifecycleEvent) -> Void
  ) throws -> () -> Void {
    let center = NotificationCenter.default
    let background = center.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.setVisibility(.background)
      listener(.init(type: .background))
    }
    let active = center.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.setVisibility(.foreground)
      listener(.init(type: .resume))
    }

    var subscribed = true
    return {
      guard subscribed else { return }
      subscribed = false
      center.removeObserver(background)
      center.removeObserver(active)
    }
  }

  private func setVisibility(_ value: ViraIOSSessionVisibility) {
    lock.lock()
    visibility = value
    lock.unlock()
  }
}
#endif