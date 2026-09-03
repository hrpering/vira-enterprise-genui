import Foundation
import XCTest
@testable import ViraIOS
import ViraStudioExperienceWire

private let staleRendererEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"stale-instance",
  "deploymentId":"stale-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.ios.button","props":[],"slots":[],"events":[{"name":"press"}]}
  ],"actions":[{"event":"button.press","actionType":"demo.action.press"}],"dataSources":[]},
  "document":{
    "version":"1",
    "id":"demo.stale-render",
    "recipeId":"demo.stale-render.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[{"id":"button","component":"demo.component.button","order":0,"props":{}}]}],
    "bindings":[],
    "interactions":[{"viewId":"main","nodeId":"button","event":"press","actionEvent":"button.press","routes":[]}]
  }
}
"""#

@MainActor
private final class StaleRendererHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"

  private var current = ViraIOSHostSnapshot(revision: 0, state: [:], domain: [:])
  private var listener: ((ViraIOSHostSnapshot) -> Void)?
  private(set) var dispatchCount = 0

  func snapshot() throws -> ViraIOSHostSnapshot { current }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    dispatchCount += 1
    return .init(outcome: .success)
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    self.listener = listener
    return { [weak self] in self?.listener = nil }
  }

  func advanceRevision() {
    current = .init(revision: current.revision + 1, state: [:], domain: [:])
    listener?(current)
  }
}

@MainActor
private final class CapturingRenderer: ViraIOSNativeRenderer {
  let implementationId = "demo.ios.button"
  private(set) var emitter: ViraIOSRenderEventEmitter?

  func render(_ context: ViraIOSRenderContext) throws -> AnyObject {
    emitter = context.emitter
    return NSObject()
  }
}

final class StaleRendererTests: XCTestCase {
  @MainActor
  func testRetainedEmitterCannotDispatchAfterHostRevisionChanges() async throws {
    let envelope: ViraIOSMountEnvelope
    switch ViraIOSMountEnvelope.decode(Data(staleRendererEnvelopeJSON.utf8)) {
    case .failure(let issue): throw issue
    case .success(let value): envelope = value
    }

    let bridge = StaleRendererHostBridge()
    let host: ViraIOSHostAdapter
    switch ViraIOSHostAdapter.create(bridge: bridge) {
    case .failure(let issue): throw issue
    case .success(let value): host = value
    }

    let policy: ViraIOSPermissionPolicy
    switch ViraIOSPermissionPolicy.create(rules: [
      .init(subject: .action, id: "demo.action.press", effect: .allow),
    ]) {
    case .failure(let issue): throw issue
    case .success(let value): policy = value
    }

    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: host,
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: policy
    )
    let renderer = CapturingRenderer()
    let registry: ViraIOSRendererRegistry
    switch ViraIOSRendererRegistry.create(envelope: envelope, renderers: [renderer]) {
    case .failure(let issue): throw issue
    case .success(let value): registry = value
    }

    switch registry.render(session: session) {
    case .failure(let issue): throw issue
    case .success: break
    }
    let emitter = try XCTUnwrap(renderer.emitter)

    bridge.advanceRevision()

    let result = await emitter.emit("press")
    switch result {
    case .success:
      XCTFail("a retained renderer from an older Host revision must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .interactionNotFound)
      XCTAssertEqual(issue.path, "$.runtimeNodeId")
    }
    XCTAssertEqual(bridge.dispatchCount, 0)
  }
}
