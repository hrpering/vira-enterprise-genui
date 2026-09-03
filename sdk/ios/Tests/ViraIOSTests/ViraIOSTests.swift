import Foundation
import XCTest
@testable import ViraIOS
import ViraStudioExperienceWire

private let canonicalEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"instance-a",
  "deploymentId":"deployment-a",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.stack","demo.ios.item","demo.ios.text"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.layout.stack","implementationId":"demo.ios.stack","props":[],"slots":["content"],"events":[]},
    {"ref":"demo.component.item","implementationId":"demo.ios.item","props":[
      {"key":"emphasis","type":"boolean","required":true,"bindable":false},
      {"key":"largeFiniteNumber","type":"number","required":true,"bindable":false},
      {"key":"title","type":"string","required":true,"bindable":true}
    ],"slots":[],"events":[{"name":"press","payload":[
      {"key":"itemId","type":"string","required":true},
      {"key":"source","type":"string","required":true},
      {"key":"userNote","type":"string","required":false}
    ]}]},
    {"ref":"demo.component.text","implementationId":"demo.ios.text","props":[{"key":"text","type":"string","required":true,"bindable":false}],"slots":[],"events":[]}
  ],"actions":[{"event":"catalog.item.select","actionType":"demo.action.select"}],"dataSources":[
    {"kind":"domain","path":"catalog.items","valueType":"array"},
    {"kind":"scope","path":"currentItem.title","valueType":"string"},
    {"kind":"scope","path":"currentItem.id","valueType":"string"}
  ]},
  "document":{
    "version":"1",
    "id":"demo.catalog",
    "recipeId":"demo.catalog.browse",
    "entryView":"main",
    "views":[
      {"id":"main","nodes":[
        {"id":"root","component":"demo.layout.stack","order":0,"props":{}},
        {"id":"item","component":"demo.component.item","order":0,"props":{"emphasis":true,"largeFiniteNumber":1e20},"parentId":"root","slot":"content","repeat":{"source":{"kind":"domain","path":"catalog.items"}}}
      ]},
      {"id":"result","nodes":[{"id":"message","component":"demo.component.text","order":0,"props":{"text":"Selected"}}]}
    ],
    "bindings":[{"viewId":"main","nodeId":"item","prop":"title","source":{"kind":"scope","path":"currentItem.title"}}],
    "interactions":[{"viewId":"main","nodeId":"item","event":"press","actionEvent":"catalog.item.select","routes":[{"outcome":"success","viewId":"result"}],"payloadBindings":[
      {"key":"itemId","source":{"kind":"scope","path":"currentItem.id"}},
      {"key":"source","source":{"kind":"literal","value":"catalog"}}
    ]}]
  }
}
"""#

private func decodeEnvelope(_ json: String = canonicalEnvelopeJSON) throws -> ViraIOSMountEnvelope {
  switch ViraIOSMountEnvelope.decode(Data(json.utf8)) {
  case .success(let value): return value
  case .failure(let issue): throw issue
  }
}

private func makePolicy(
  _ effect: ViraIOSPermissionEffect,
  id: String = "demo.action.select"
) throws -> ViraIOSPermissionPolicy {
  let rule = ViraIOSPermissionRule(subject: .action, id: id, effect: effect)
  switch ViraIOSPermissionPolicy.create(rules: [rule]) {
  case .success(let value): return value
  case .failure(let issue): throw issue
  }
}

@MainActor
private final class TestHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"

  private let lock = NSLock()
  private var snapshotValue: ViraIOSHostSnapshot
  private var actionsValue: [ViraIOSHostActionDescriptor] = []
  private var listener: ((ViraIOSHostSnapshot) -> Void)?
  private var resultSnapshotValue: ViraIOSHostSnapshot?
  var nextOutcome: ViraIOSHostActionOutcome = .success

  init(revision: Int64 = 0) {
    self.snapshotValue = .init(
      revision: revision,
      state: [:],
      domain: [
        "catalog": .object([
          "items": .array([
            .object(["id": .string("a"), "title": .string("Alpha")]),
            .object(["id": .string("b"), "title": .string("Beta")]),
          ]),
        ]),
      ]
    )
  }

  func snapshot() throws -> ViraIOSHostSnapshot {
    lock.lock()
    defer { lock.unlock() }
    return snapshotValue
  }

  private func record(
    _ action: ViraIOSHostActionDescriptor
  ) -> (outcome: ViraIOSHostActionOutcome, snapshot: ViraIOSHostSnapshot?) {
    lock.lock()
    defer { lock.unlock() }
    actionsValue.append(action)
    return (nextOutcome, resultSnapshotValue)
  }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    let recorded = record(action)
    return .init(outcome: recorded.outcome, snapshot: recorded.snapshot)
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    lock.lock()
    self.listener = listener
    lock.unlock()
    return { [weak self] in
      self?.listener = nil
    }
  }

  func emit(_ snapshot: ViraIOSHostSnapshot) {
    let callback: ((ViraIOSHostSnapshot) -> Void)?
    lock.lock()
    snapshotValue = snapshot
    callback = listener
    lock.unlock()
    callback?(snapshot)
  }

  func setResultSnapshot(_ snapshot: ViraIOSHostSnapshot?) {
    lock.lock()
    resultSnapshotValue = snapshot
    lock.unlock()
  }

  func actions() -> [ViraIOSHostActionDescriptor] {
    lock.lock()
    defer { lock.unlock() }
    return actionsValue
  }
}

private final class TestLifecycleSource: ViraIOSLifecycleSource {
  private var snapshotValue: ViraIOSLifecycleSnapshot
  private var listener: ((ViraIOSLifecycleEvent) -> Void)?

  init(
    visibility: ViraIOSSessionVisibility = .foreground,
    connectivity: ViraIOSSessionConnectivity = .connected
  ) {
    snapshotValue = .init(visibility: visibility, connectivity: connectivity)
  }

  func snapshot() throws -> ViraIOSLifecycleSnapshot { snapshotValue }

  func subscribe(_ listener: @escaping (ViraIOSLifecycleEvent) -> Void) throws -> () -> Void {
    self.listener = listener
    return { [weak self] in self?.listener = nil }
  }

  func emit(_ type: ViraIOSLifecycleEventType) {
    listener?(.init(type: type))
  }
}

private final class RenderedObject: NSObject {
  let runtimeNodeId: String
  init(_ runtimeNodeId: String) { self.runtimeNodeId = runtimeNodeId }
}

@MainActor
private final class TestRenderer: ViraIOSNativeRenderer {
  let implementationId: String
  private(set) var renderedNodeIds: [String] = []
  private(set) var lastSlotSizes: [String: Int] = [:]
  private(set) var lastEmitter: ViraIOSRenderEventEmitter?

  init(_ implementationId: String) {
    self.implementationId = implementationId
  }

  func render(_ context: ViraIOSRenderContext) throws -> AnyObject {
    renderedNodeIds.append(context.runtimeNodeId)
    lastSlotSizes = context.slots.mapValues(\.count)
    lastEmitter = context.emitter
    return RenderedObject(context.runtimeNodeId)
  }
}

final class ViraIOSTests: XCTestCase {
  func testMountEnvelopeRejectsUnknownTopLevelField() throws {
    let hostile = canonicalEnvelopeJSON.replacingOccurrences(
      of: "{\n  \"version\"",
      with: "{\n  \"remoteCode\":\"https://example.invalid/app.swift\",\n  \"version\"",
      options: [],
      range: canonicalEnvelopeJSON.startIndex..<canonicalEnvelopeJSON.endIndex
    )
    switch ViraIOSMountEnvelope.decode(Data(hostile.utf8)) {
    case .success:
      XCTFail("unknown executable metadata must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidEnvelope)
    }
  }

  func testPermissionPolicyRejectsUnknownFields() {
    let data = Data(#"{"version":"1","rules":[],"endpoint":"https://example.invalid"}"#.utf8)
    switch ViraIOSPermissionPolicy.decode(data) {
    case .success:
      XCTFail("unknown permission fields must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidEnvelope)
    }
  }

  func testPermissionPolicyAcceptsCanonicalSingleSegmentIds() throws {
    let created = ViraIOSPermissionPolicy.create(rules: [
      .init(subject: .capability, id: "select-date", effect: .allow),
    ])
    let policy = try unwrap(created)
    XCTAssertEqual(policy.effect(subject: .capability, id: "select-date"), .allow)

    let decoded = try unwrap(ViraIOSPermissionPolicy.decode(Data(
      #"{"version":"1","rules":[{"subject":"capability","id":"select-date","effect":"allow"}]}"#.utf8
    )))
    XCTAssertEqual(decoded.effect(subject: .capability, id: "select-date"), .allow)
  }

  @MainActor
  func testCanonicalSingleSegmentActionTypeDecodesAndDispatches() async throws {
    let json = canonicalEnvelopeJSON.replacingOccurrences(
      of: "demo.action.select",
      with: "submit"
    )
    let envelope = try decodeEnvelope(json)
    XCTAssertEqual(envelope.brand.actions.first?.actionType, "submit")

    let bridge = TestHostBridge()
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: host,
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow, id: "submit")
    )
    let item = try XCTUnwrap(try unwrap(session.currentView()).nodes.first { $0.sourceNodeId == "item" })
    _ = try unwrap(await session.dispatch(runtimeNodeId: item.id, event: "press"))
    XCTAssertEqual(bridge.actions().first?.type, "submit")
  }

  @MainActor
  func testRepeatDispatchUsesExactRuntimeInstancePayload() async throws {
    let envelope = try decodeEnvelope()
    let bridge = TestHostBridge()
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: host,
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow)
    )

    let view = try unwrap(session.currentView())
    let repeated = view.nodes.filter { $0.sourceNodeId == "item" }.sorted { $0.id < $1.id }
    XCTAssertEqual(repeated.map(\.id), ["item~item-0", "item~item-1"])
    XCTAssertEqual(repeated[1].props["title"], .string("Beta"))

    let completion = try unwrap(await session.dispatch(runtimeNodeId: repeated[1].id, event: "press"))
    XCTAssertEqual(completion.viewId, "result")
    XCTAssertTrue(completion.transitioned)

    let actions = bridge.actions()
    XCTAssertEqual(actions.count, 1)
    XCTAssertEqual(actions[0].type, "demo.action.select")
    XCTAssertEqual(actions[0].payload["itemId"], .string("b"))
    XCTAssertEqual(actions[0].payload["source"], .string("catalog"))
  }

  @MainActor
  func testDenyAndConfirmNeverCrossHostBoundary() async throws {
    let envelope = try decodeEnvelope()
    for effect in [ViraIOSPermissionEffect.deny, .confirm] {
      let bridge = TestHostBridge()
      let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
      let session = try ViraIOSRuntimeSession(
        envelope: envelope,
        host: host,
        runtimeState: try makeTestRuntimeCoreState(),
        permissionPolicy: try makePolicy(effect)
      )
      let view = try unwrap(session.currentView())
      let item = try XCTUnwrap(view.nodes.first { $0.sourceNodeId == "item" })
      let result = await session.dispatch(runtimeNodeId: item.id, event: "press")
      switch result {
      case .success:
        XCTFail("deny/confirm cannot dispatch to the Host")
      case .failure(let issue):
        XCTAssertEqual(issue.code, effect == .deny ? .permissionDenied : .confirmationRequired)
      }
      XCTAssertEqual(bridge.actions().count, 0)
    }
  }

  @MainActor
  func testHostAdapterFailsClosedOnLowerSubscriptionRevision() throws {
    let bridge = TestHostBridge(revision: 2)
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    bridge.emit(.init(revision: 1, state: [:], domain: [:]))
    switch host.snapshot() {
    case .success:
      XCTFail("lower subscription revision must poison the adapter")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .staleSnapshot)
    }
  }

  @MainActor
  func testStaleDispatchSnapshotDoesNotPoisonNewerSubscriptionState() async throws {
    let bridge = TestHostBridge(revision: 1)
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    bridge.emit(.init(revision: 2, state: ["ready": .bool(true)], domain: [:]))
    bridge.setResultSnapshot(.init(revision: 1, state: [:], domain: [:]))

    let dispatch = await host.dispatch(.init(type: "submit", payload: [:]))
    switch dispatch {
    case .success:
      XCTFail("stale action-response snapshot must fail that dispatch")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .staleSnapshot)
    }

    let current = try unwrap(host.snapshot())
    XCTAssertEqual(current.revision, 2)
    XCTAssertEqual(current.state["ready"], .bool(true))
  }

  @MainActor
  func testHostSubscribersReceiveOnlyActiveMonotonicUpdates() throws {
    let bridge = TestHostBridge()
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    var revisions: [Int64] = []
    let unsubscribe = host.subscribe { snapshot in
      revisions.append(snapshot.revision)
    }

    bridge.emit(.init(revision: 1, state: [:], domain: [:]))
    XCTAssertEqual(revisions, [1])
    unsubscribe()
    bridge.emit(.init(revision: 2, state: [:], domain: [:]))
    XCTAssertEqual(revisions, [1])
  }

  func testLifecycleDuplicateSignalIsNoOpAndInstancesStayIsolated() throws {
    let sourceA = TestLifecycleSource()
    let sourceB = TestLifecycleSource()
    let controllerA = try unwrap(ViraIOSSessionController.create(instanceId: "instance-a", source: sourceA))
    let controllerB = try unwrap(ViraIOSSessionController.create(instanceId: "instance-b", source: sourceB))

    sourceA.emit(.background)
    let stateA = try unwrap(controllerA.state())
    let stateB = try unwrap(controllerB.state())
    XCTAssertEqual(stateA.visibility, .background)
    XCTAssertEqual(stateA.revision, 1)
    XCTAssertEqual(stateB.visibility, .foreground)
    XCTAssertEqual(stateB.revision, 0)

    sourceA.emit(.background)
    XCTAssertEqual(try unwrap(controllerA.state()).revision, 1)
    XCTAssertEqual(try unwrap(controllerB.state()).revision, 0)

    _ = try unwrap(controllerA.transition(.disconnect))
    XCTAssertEqual(try unwrap(controllerA.state()).connectivity, .disconnected)
    XCTAssertEqual(try unwrap(controllerB.state()).connectivity, .connected)
  }

  func testRestoreRejectsDifferentInstance() throws {
    let persisted = try unwrap(ViraIOSSessionState.create(
      instanceId: "instance-a",
      snapshot: .init(visibility: .foreground, connectivity: .connected)
    ))
    let source = TestLifecycleSource()
    switch ViraIOSSessionController.restore(instanceId: "instance-b", persisted: persisted, source: source) {
    case .success:
      XCTFail("restoration cannot switch exact instances")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .instanceMismatch)
    }
  }

  @MainActor
  func testRendererRegistryRequiresExactLocalImplementations() throws {
    let envelope = try decodeEnvelope()
    let stack = TestRenderer("demo.ios.stack")
    let item = TestRenderer("demo.ios.item")
    let text = TestRenderer("demo.ios.text")

    switch ViraIOSRendererRegistry.create(envelope: envelope, renderers: [stack, item]) {
    case .success:
      XCTFail("missing renderer must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .missingRenderer)
    }

    let extra = TestRenderer("demo.ios.extra")
    switch ViraIOSRendererRegistry.create(envelope: envelope, renderers: [stack, item, text, extra]) {
    case .success:
      XCTFail("extra renderer must fail closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .extraRenderer)
    }

    let registry = try unwrap(ViraIOSRendererRegistry.create(envelope: envelope, renderers: [stack, item, text]))
    let bridge = TestHostBridge()
    let host = try unwrap(ViraIOSHostAdapter.create(bridge: bridge))
    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: host,
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow)
    )
    let roots = try unwrap(registry.render(session: session))
    XCTAssertEqual(roots.count, 1)
    XCTAssertEqual(stack.lastSlotSizes["content"], 2)
    XCTAssertEqual(item.renderedNodeIds.count, 2)
  }

  @MainActor
  func testRendererDispatchCompletionHookFiresAfterRouteTransition() async throws {
    let envelope = try decodeEnvelope()
    let stack = TestRenderer("demo.ios.stack")
    let item = TestRenderer("demo.ios.item")
    let text = TestRenderer("demo.ios.text")
    let registry = try unwrap(ViraIOSRendererRegistry.create(
      envelope: envelope,
      renderers: [stack, item, text]
    ))
    let bridge = TestHostBridge()
    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: try unwrap(ViraIOSHostAdapter.create(bridge: bridge)),
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow)
    )
    var refreshRequests = 0
    _ = try unwrap(registry.render(
      session: session,
      onDispatchCompletion: { refreshRequests += 1 }
    ))
    let emitter = try XCTUnwrap(item.lastEmitter)
    XCTAssertEqual(refreshRequests, 0)

    _ = try unwrap(await emitter.emit("press"))
    XCTAssertEqual(session.currentViewId(), "result")
    XCTAssertEqual(refreshRequests, 1)
  }

  @MainActor
  func testRuntimeInstancesDoNotShareViewTransitions() async throws {
    let envelopeA = try decodeEnvelope()
    let envelopeB = try decodeEnvelope(canonicalEnvelopeJSON.replacingOccurrences(
      of: "\"instanceId\":\"instance-a\"",
      with: "\"instanceId\":\"instance-b\""
    ))
    let bridgeA = TestHostBridge()
    let bridgeB = TestHostBridge()
    let sessionA = try ViraIOSRuntimeSession(
      envelope: envelopeA,
      host: try unwrap(ViraIOSHostAdapter.create(bridge: bridgeA)),
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow)
    )
    let sessionB = try ViraIOSRuntimeSession(
      envelope: envelopeB,
      host: try unwrap(ViraIOSHostAdapter.create(bridge: bridgeB)),
      runtimeState: try makeTestRuntimeCoreState(),
      permissionPolicy: try makePolicy(.allow)
    )
    let itemA = try XCTUnwrap(try unwrap(sessionA.currentView()).nodes.first { $0.sourceNodeId == "item" })
    _ = try unwrap(await sessionA.dispatch(runtimeNodeId: itemA.id, event: "press"))
    XCTAssertEqual(sessionA.currentViewId(), "result")
    XCTAssertEqual(sessionB.currentViewId(), "main")
    XCTAssertEqual(bridgeA.actions().count, 1)
    XCTAssertEqual(bridgeB.actions().count, 0)
  }
}

private func unwrap<T>(_ result: Result<T, ViraIOSIssue>) throws -> T {
  switch result {
  case .success(let value): return value
  case .failure(let issue): throw issue
  }
}
