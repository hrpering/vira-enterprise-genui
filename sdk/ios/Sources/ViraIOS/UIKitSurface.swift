#if canImport(UIKit)
import UIKit

@MainActor
public protocol ViraIOSUIKitRenderer: ViraIOSNativeRenderer {
  func renderUIKit(_ context: ViraIOSRenderContext) throws -> UIView
}

@MainActor
public extension ViraIOSUIKitRenderer {
  func render(_ context: ViraIOSRenderContext) throws -> AnyObject {
    try renderUIKit(context)
  }
}

@MainActor
public final class ViraIOSUIKitSurfaceController {
  public let view: UIStackView
  public var onIssue: ((ViraIOSIssue) -> Void)?
  public private(set) var lastIssue: ViraIOSIssue?

  private let session: ViraIOSRuntimeSession
  private let registry: ViraIOSRendererRegistry
  private var unsubscribeHost: (() -> Void)?
  private var disposed = false
  private var refreshing = false
  private var refreshRequested = false

  private init(
    session: ViraIOSRuntimeSession,
    registry: ViraIOSRendererRegistry
  ) {
    self.session = session
    self.registry = registry
    let stack = UIStackView()
    stack.axis = .vertical
    stack.alignment = .fill
    stack.distribution = .fill
    self.view = stack
  }

  public static func create(
    session: ViraIOSRuntimeSession,
    renderers: [any ViraIOSUIKitRenderer]
  ) -> Result<ViraIOSUIKitSurfaceController, ViraIOSIssue> {
    let nativeRenderers: [any ViraIOSNativeRenderer] = renderers.map { $0 as any ViraIOSNativeRenderer }
    let registry: ViraIOSRendererRegistry
    switch ViraIOSRendererRegistry.create(envelope: session.envelope, renderers: nativeRenderers) {
    case .failure(let issue): return .failure(issue)
    case .success(let value): registry = value
    }

    let controller = ViraIOSUIKitSurfaceController(session: session, registry: registry)
    switch controller.refresh() {
    case .failure(let issue): return .failure(issue)
    case .success: break
    }

    controller.unsubscribeHost = session.host.subscribe { [weak controller] _ in
      controller?.requestRefresh()
    }
    return .success(controller)
  }

  @discardableResult
  public func refresh() -> Result<Void, ViraIOSIssue> {
    if disposed {
      return .failure(.init(
        code: .disposed,
        path: "$",
        message: "UIKit surface controller is disposed"
      ))
    }
    if refreshing {
      refreshRequested = true
      return .success(())
    }

    refreshing = true
    defer {
      refreshing = false
      if refreshRequested && !disposed {
        refreshRequested = false
        requestRefresh()
      }
    }

    let roots: [AnyObject]
    switch registry.render(
      session: session,
      onDispatchCompletion: { [weak self] in self?.requestRefresh() }
    ) {
    case .failure(let issue):
      lastIssue = issue
      return .failure(issue)
    case .success(let value):
      roots = value
    }

    var nextViews: [UIView] = []
    nextViews.reserveCapacity(roots.count)
    for object in roots {
      guard let nativeView = object as? UIView else {
        let issue = ViraIOSIssue(
          code: .rendererFailed,
          path: "$.renderers",
          message: "UIKit renderer returned a non-UIView native object"
        )
        lastIssue = issue
        return .failure(issue)
      }
      nextViews.append(nativeView)
    }

    for existing in view.arrangedSubviews {
      view.removeArrangedSubview(existing)
      existing.removeFromSuperview()
    }
    for nativeView in nextViews {
      view.addArrangedSubview(nativeView)
    }
    lastIssue = nil
    return .success(())
  }

  private func requestRefresh() {
    switch refresh() {
    case .success:
      break
    case .failure(let issue):
      lastIssue = issue
      onIssue?(issue)
    }
  }

  public func dispose() {
    if disposed { return }
    disposed = true
    refreshRequested = false
    let cleanup = unsubscribeHost
    unsubscribeHost = nil
    cleanup?()
  }
}

@MainActor
public func createViraIOSUIKitSurface(
  session: ViraIOSRuntimeSession,
  renderers: [any ViraIOSUIKitRenderer]
) -> Result<ViraIOSUIKitSurfaceController, ViraIOSIssue> {
  ViraIOSUIKitSurfaceController.create(session: session, renderers: renderers)
}
#endif
