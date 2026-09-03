import Foundation
import XCTest
@testable import ViraIOS
import ViraStudioExperienceWire

private let expansionEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"expansion-instance",
  "deploymentId":"expansion-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.container"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.container","implementationId":"demo.ios.container","props":[],"slots":["content"],"events":[]}
  ],"actions":[]},
  "document":{
    "version":"1",
    "id":"demo.expansion",
    "recipeId":"demo.expansion.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[
      {"id":"outer","component":"demo.component.container","order":0,"props":{},"repeat":{"source":{"kind":"state","path":"items"}}},
      {"id":"inner","component":"demo.component.container","order":1,"props":{},"parentId":"outer","slot":"content","repeat":{"source":{"kind":"state","path":"items"}}}
    ]}],
    "bindings":[],
    "interactions":[]
  }
}
"""#

@MainActor
private final class ExpansionBudgetHostBridge: ViraIOSHostBridge {
  let version = "1"
  let id = "demo.host.ios"
  private let current: ViraIOSHostSnapshot

  init(itemCount: Int) {
    current = .init(
      revision: 0,
      state: ["items": .array(Array(repeating: .null, count: itemCount))],
      domain: [:]
    )
  }

  func snapshot() throws -> ViraIOSHostSnapshot { current }

  func dispatch(_ action: ViraIOSHostActionDescriptor) async throws -> ViraIOSHostActionResult {
    .init(outcome: .success)
  }

  func subscribe(_ listener: @escaping (ViraIOSHostSnapshot) -> Void) throws -> () -> Void {
    {}
  }
}

final class ExpansionBudgetTests: XCTestCase {
  @MainActor
  func testNestedRepeatsFailBeforeExceedingCumulativeNativeNodeBudget() throws {
    let itemCount = 65
    XCTAssertGreaterThan(itemCount + itemCount * itemCount, VIRA_IOS_MAX_EXPANDED_NODES)

    let envelope: ViraIOSMountEnvelope
    switch ViraIOSMountEnvelope.decode(Data(expansionEnvelopeJSON.utf8)) {
    case .failure(let issue): throw issue
    case .success(let value): envelope = value
    }

    let host: ViraIOSHostAdapter
    switch ViraIOSHostAdapter.create(bridge: ExpansionBudgetHostBridge(itemCount: itemCount)) {
    case .failure(let issue): throw issue
    case .success(let value): host = value
    }

    let policy: ViraIOSPermissionPolicy
    switch ViraIOSPermissionPolicy.create(rules: []) {
    case .failure(let issue): throw issue
    case .success(let value): policy = value
    }

    let session = try ViraIOSRuntimeSession(
      envelope: envelope,
      host: host,
      permissionPolicy: policy
    )

    switch session.currentView() {
    case .success:
      XCTFail("nested repeats must not materialize beyond the cumulative native node budget")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .repeatLimitExceeded)
      XCTAssertEqual(issue.path, "$.view.nodes")
    }
  }
}
