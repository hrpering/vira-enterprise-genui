import Foundation
import XCTest
@testable import ViraIOS
import ViraStudioExperienceWire

@MainActor
private final class CanonicalJSONHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"

  var current: ViraIOSHostSnapshot
  var dispatchResult = ViraIOSHostActionResult(outcome: .success)
  private var listener: ((ViraIOSHostSnapshot) -> Void)?
  private(set) var dispatchCount = 0

  init(snapshot: ViraIOSHostSnapshot = .init(revision: 0, state: [:], domain: [:])) {
    current = snapshot
  }

  func snapshot() throws -> ViraIOSHostSnapshot { current }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    dispatchCount += 1
    return dispatchResult
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    self.listener = listener
    return { [weak self] in self?.listener = nil }
  }

  func emit(_ snapshot: ViraIOSHostSnapshot) {
    current = snapshot
    listener?(snapshot)
  }
}

final class HostCanonicalJSONTests: XCTestCase {
  @MainActor
  func testInitialSnapshotsRejectNonCanonicalNumbers() {
    let invalidNumbers = [Double.nan, Double.infinity, -Double.infinity, -0.0]

    for number in invalidNumbers {
      let bridge = CanonicalJSONHostBridge(snapshot: .init(
        revision: 0,
        state: ["value": .number(number)],
        domain: [:]
      ))

      switch ViraIOSHostAdapter.create(bridge: bridge) {
      case .success:
        XCTFail("non-canonical numeric Host snapshot must be rejected")
      case .failure(let issue):
        XCTAssertEqual(issue.code, .invalidSnapshot)
        XCTAssertEqual(issue.path, "$.host.snapshot")
      }
    }
  }

  @MainActor
  func testNestedInvalidSubscriptionSnapshotPoisonsFailClosed() throws {
    let bridge = CanonicalJSONHostBridge()
    let adapter: ViraIOSHostAdapter
    switch ViraIOSHostAdapter.create(bridge: bridge) {
    case .failure(let issue): throw issue
    case .success(let value): adapter = value
    }

    bridge.emit(.init(
      revision: 1,
      state: ["nested": .object(["value": .number(.nan)])],
      domain: [:]
    ))

    switch adapter.snapshot() {
    case .success:
      XCTFail("invalid subscription snapshot must poison the adapter fail-closed")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidSnapshot)
      XCTAssertEqual(issue.path, "$.snapshot")
    }
  }

  @MainActor
  func testInvalidActionResponseSnapshotFailsDispatchWithoutPoisoningNewerState() async throws {
    let bridge = CanonicalJSONHostBridge()
    bridge.dispatchResult = .init(
      outcome: .success,
      snapshot: .init(revision: 1, state: ["value": .number(.infinity)], domain: [:])
    )
    let adapter: ViraIOSHostAdapter
    switch ViraIOSHostAdapter.create(bridge: bridge) {
    case .failure(let issue): throw issue
    case .success(let value): adapter = value
    }

    let result = await adapter.dispatch(.init(type: "submit", payload: [:]))
    switch result {
    case .success:
      XCTFail("invalid action-response snapshot must fail the dispatch")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidSnapshot)
      XCTAssertEqual(issue.path, "$.snapshot")
    }

    switch adapter.snapshot() {
    case .failure(let issue): throw issue
    case .success(let snapshot): XCTAssertEqual(snapshot.revision, 0)
    }
  }

  @MainActor
  func testNonCanonicalOutboundPayloadNeverCrossesHostBridge() async throws {
    let bridge = CanonicalJSONHostBridge()
    let adapter: ViraIOSHostAdapter
    switch ViraIOSHostAdapter.create(bridge: bridge) {
    case .failure(let issue): throw issue
    case .success(let value): adapter = value
    }

    let result = await adapter.dispatch(.init(
      type: "submit",
      payload: ["nested": .array([.number(-0.0)])]
    ))
    switch result {
    case .success:
      XCTFail("non-canonical action payload must not cross the Host boundary")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidHostResult)
      XCTAssertEqual(issue.path, "$.action.payload")
    }
    XCTAssertEqual(bridge.dispatchCount, 0)
  }
}
