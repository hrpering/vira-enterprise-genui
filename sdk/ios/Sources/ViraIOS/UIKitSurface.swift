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
public func createViraIOSUIKitSurface(
  session: ViraIOSRuntimeSession,
  renderers: [any ViraIOSUIKitRenderer]
) -> Result<UIView, ViraIOSIssue> {
  let nativeRenderers: [any ViraIOSNativeRenderer] = renderers.map { $0 as any ViraIOSNativeRenderer }
  let registry: ViraIOSRendererRegistry
  switch ViraIOSRendererRegistry.create(envelope: session.envelope, renderers: nativeRenderers) {
  case .failure(let issue): return .failure(issue)
  case .success(let value): registry = value
  }

  let roots: [AnyObject]
  switch registry.render(session: session) {
  case .failure(let issue): return .failure(issue)
  case .success(let value): roots = value
  }

  let stack = UIStackView()
  stack.axis = .vertical
  stack.alignment = .fill
  stack.distribution = .fill
  for object in roots {
    guard let view = object as? UIView else {
      return .failure(.init(
        code: .rendererFailed,
        path: "$.renderers",
        message: "UIKit renderer returned a non-UIView native object"
      ))
    }
    stack.addArrangedSubview(view)
  }
  return .success(stack)
}
#endif