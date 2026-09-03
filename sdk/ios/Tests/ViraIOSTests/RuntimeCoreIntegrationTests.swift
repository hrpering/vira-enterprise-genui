import Foundation
import XCTest
@testable import ViraIOS
import ViraStudioExperienceWire

private let runtimeCoreEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"runtime-core-instance",
  "deploymentId":"runtime-core-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.ios.button","props":[],"slots":[],"events":[
      {"name":"patch"},
      {"name":"lifecycle"},
      {"name":"custom","payload":[{"key":"note","type":"string","required":false}]}
    ]}
  ],"actions":[
    {"event":"runtime.patch","actionType":"runtime.patch.apply"},
    {"event":"runtime.lifecycle","actionType":"runtime.lifecycle.transition"},
    {"event":"runtime.custom","actionType":"runtime.custom.action"}
  ],"dataSources":[]},
  "document":{
    "version":"1",
    "id":"demo.runtime-core",
    "recipeId":"demo.runtime-core.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[
      {"id":"button","component":"demo.component.button","order":0,"props":{}}
    ]}],
    "bindings":[],
    "interactions":[
      {"viewId":"main","nodeId":"button","event":"patch","actionEvent":"runtime.patch","routes":[]},
      {"viewId":"main","nodeId":"button","event":"lifecycle","actionEvent":"runtime.lifecycle","routes":[]},
      {"viewId":"main","nodeId":"button","event":"custom","actionEvent":"runtime.custom","routes":[]}
    ]
  }
}
"""#

@MainActor
private final class RuntimeCoreIntegrationHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"
  private(set) var actions: [ViraIOSHostActionDescriptor] = []

  func snapshot() throws -> ViraIOSHostSnapshot {
    .init(revision: 0, state: [:], domain: [:])
  }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    actions.append(action)
    return .init(outcome: .success)
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    {}
  }
}

private func runtimeCoreEnvelope() throws -> ViraIOSMountEnvelope {
  switch ViraIOSMountEnvelope.decode(Data(runtimeCoreEnvelopeJSON.utf8)) {
  case .failure(let issue): throw issue
  case .success(let value): return value
  }
}

private func runtimeCorePolicy() throws -> ViraIOSPermissionPolicy {
  switch ViraIOSPermissionPolicy.create(rules: [
    .init(subject: .action, id: "runtime.patch.apply", effect: .allow),
    .init(subject: .action, id: "runtime.lifecycle.transition", effect: .allow),
    .init(subject: .action, id: "runtime.custom.action", effect: .allow),
  ]) {
  case .failure(let issue): throw issue
  case .success(let value): return value
  }
}

@MainActor
private func runtimeCoreSession(
  bridge: RuntimeCoreIntegrationHostBridge
) throws -> ViraIOSRuntimeSession {
  let host: ViraIOSHostAdapter
  switch ViraIOSHostAdapter.create(bridge: bridge) {
  case .failure(let issue): throw issue
  case .success(let value): host = value
  }
  return try ViraIOSRuntimeSession(
    envelope: runtimeCoreEnvelope(),
    host: host,
    runtimeState: makeTestRuntimeCoreState(),
    permissionPolicy: runtimeCorePolicy()
  )
}

final class RuntimeCoreIntegrationTests: XCTestCase {
  @MainActor
  func testPatchBuiltInReducesLocallyAndNeverCrossesHostBoundary() async throws {
    let bridge = RuntimeCoreIntegrationHostBridge()
    let session = try runtimeCoreSession(bridge: bridge)
    let patch: ViraJSONValue = .object([
      "version": .string("1"),
      "operations": .array([
        .object([
          "op": .string("set"),
          "path": .string("/state/counter"),
          "value": .number(1),
        ]),
      ]),
    ])

    let completion = await session.dispatch(
      runtimeNodeId: "button",
      event: "patch",
      payload: ["patch": patch]
    )
    switch completion {
    case .failure(let issue): throw issue
    case .success(let value):
      XCTAssertEqual(value.actionType, "runtime.patch.apply")
      XCTAssertEqual(value.outcome, .success)
      XCTAssertFalse(value.transitioned)
    }

    XCTAssertEqual(bridge.actions.count, 0)
    let state = session.currentRuntimeState()
    XCTAssertEqual(state.revision, 1)
    guard case .object(let plan) = state.plan,
          case .object(let planState)? = plan["state"] else {
      return XCTFail("runtime plan state must remain canonical object data")
    }
    XCTAssertEqual(planState["counter"], .number(1))
  }

  @MainActor
  func testLifecycleBuiltInReducesLocallyAndNeverCrossesHostBoundary() async throws {
    let bridge = RuntimeCoreIntegrationHostBridge()
    let session = try runtimeCoreSession(bridge: bridge)

    let completion = await session.dispatch(
      runtimeNodeId: "button",
      event: "lifecycle",
      payload: ["target": .string("updating")]
    )
    switch completion {
    case .failure(let issue): throw issue
    case .success(let value):
      XCTAssertEqual(value.actionType, "runtime.lifecycle.transition")
      XCTAssertEqual(value.outcome, .success)
    }

    XCTAssertEqual(bridge.actions.count, 0)
    XCTAssertEqual(session.currentRuntimeState().lifecycle, .updating)
    XCTAssertEqual(session.currentRuntimeState().revision, 1)
  }

  @MainActor
  func testOrdinaryRuntimePrefixedActionStillUsesHostPath() async throws {
    let bridge = RuntimeCoreIntegrationHostBridge()
    let session = try runtimeCoreSession(bridge: bridge)

    let completion = await session.dispatch(
      runtimeNodeId: "button",
      event: "custom",
      payload: ["note": .string("host-owned")]
    )
    switch completion {
    case .failure(let issue): throw issue
    case .success(let value):
      XCTAssertEqual(value.actionType, "runtime.custom.action")
      XCTAssertEqual(value.outcome, .success)
    }

    XCTAssertEqual(bridge.actions.count, 1)
    XCTAssertEqual(bridge.actions[0].type, "runtime.custom.action")
    XCTAssertEqual(bridge.actions[0].payload["note"], .string("host-owned"))
    XCTAssertEqual(session.currentRuntimeState().revision, 0)
  }

  @MainActor
  func testMalformedPatchBuiltInFailsClosedBeforeHostDispatch() async throws {
    let bridge = RuntimeCoreIntegrationHostBridge()
    let session = try runtimeCoreSession(bridge: bridge)

    let result = await session.dispatch(
      runtimeNodeId: "button",
      event: "patch",
      payload: ["patch": .object(["version": .string("1")])]
    )
    switch result {
    case .success:
      XCTFail("malformed Runtime Core patch must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .runtimeReductionFailed)
    }

    XCTAssertEqual(bridge.actions.count, 0)
    XCTAssertEqual(session.currentRuntimeState().revision, 0)
  }
}
