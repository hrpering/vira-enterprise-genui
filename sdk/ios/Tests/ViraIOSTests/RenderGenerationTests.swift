import Foundation
import XCTest
@testable import ViraIOS

private let renderGenerationEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"generation-instance",
  "deploymentId":"generation-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.ios.button","props":[],"slots":[],"events":[{"name":"press"}]}
  ],"actions":[{"event":"button.press","actionType":"demo.action.press"}],"dataSources":[]},
  "document":{
    "version":"1",
    "id":"demo.render-generation",
    "recipeId":"demo.render-generation.recipe",
    "entryView":"main",
    "views":[
      {"id":"main","nodes":[{"id":"button-main","component":"demo.component.button","order":0,"props":{}}]},
      {"id":"detail","nodes":[{"id":"button-detail","component":"demo.component.button","order":0,"props":{}}]}
    ],
    "bindings":[],
    "interactions":[
      {"viewId":"main","nodeId":"button-main","event":"press","actionEvent":"button.press","routes":[{"outcome":"success","viewId":"detail"}]},
      {"viewId":"detail","nodeId":"button-detail","event":"press","actionEvent":"button.press","routes":[{"outcome":"success","viewId":"main"}]}
    ]
  }
}
"""#

@MainActor
private final class GenerationHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"
  private(set) var dispatchCount = 0

  func snapshot() throws -> ViraIOSHostSnapshot {
    .init(revision: 0, state: [:], domain: [:])
  }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    dispatchCount += 1
    return .init(outcome: .success)
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    {}
  }
}

@MainActor
private final class GenerationRenderer: ViraIOSNativeRenderer {
  let implementationId = "demo.ios.button"
  private(set) var emitter: ViraIOSRenderEventEmitter?

  func render(_ context: ViraIOSRenderContext) throws -> AnyObject {
    emitter = context.emitter
    return NSObject()
  }
}

final class RenderGenerationTests: XCTestCase {
  @MainActor
  func testEmitterFromEarlierSameViewGenerationCannotDispatchAfterRoundTripNavigation() async throws {
    let envelope: ViraIOSMountEnvelope
    switch ViraIOSMountEnvelope.decode(Data(renderGenerationEnvelopeJSON.utf8)) {
    case .failure(let issue): throw issue
    case .success(let value): envelope = value
    }

    let bridge = GenerationHostBridge()
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
    let renderer = GenerationRenderer()
    let registry: ViraIOSRendererRegistry
    switch ViraIOSRendererRegistry.create(envelope: envelope, renderers: [renderer]) {
    case .failure(let issue): throw issue
    case .success(let value): registry = value
    }

    switch registry.render(session: session) {
    case .failure(let issue): throw issue
    case .success: break
    }
    let firstMainEmitter = try XCTUnwrap(renderer.emitter)

    _ = try unwrapGeneration(await firstMainEmitter.emit("press"))
    XCTAssertEqual(session.currentViewId(), "detail")

    switch registry.render(session: session) {
    case .failure(let issue): throw issue
    case .success: break
    }
    let detailEmitter = try XCTUnwrap(renderer.emitter)
    _ = try unwrapGeneration(await detailEmitter.emit("press"))
    XCTAssertEqual(session.currentViewId(), "main")

    switch registry.render(session: session) {
    case .failure(let issue): throw issue
    case .success: break
    }

    let staleResult = await firstMainEmitter.emit("press")
    switch staleResult {
    case .success:
      XCTFail("an emitter from an earlier same-view generation must stay invalid after navigation returns")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .interactionNotFound)
      XCTAssertEqual(issue.path, "$.runtimeNodeId")
    }
    XCTAssertEqual(bridge.dispatchCount, 2)
  }
}

private func unwrapGeneration<T>(_ result: Result<T, ViraIOSIssue>) throws -> T {
  switch result {
  case .success(let value): return value
  case .failure(let issue): throw issue
  }
}
