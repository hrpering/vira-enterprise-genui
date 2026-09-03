import Foundation
import XCTest
@testable import ViraIOS

private let graphEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"graph-instance",
  "deploymentId":"graph-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.container"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.container","implementationId":"demo.ios.container","props":[],"slots":["content"],"events":[]}
  ],"actions":[]},
  "document":{
    "version":"1",
    "id":"demo.graph",
    "recipeId":"demo.graph.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[
      {"id":"root","component":"demo.component.container","order":0,"props":{}},
      {"id":"child","component":"demo.component.container","order":1,"props":{},"parentId":"root","slot":"content"}
    ]}],
    "bindings":[],
    "interactions":[]
  }
}
"""#

final class DocumentGraphSafetyTests: XCTestCase {
  func testDuplicateNodeIdsFailAtEnvelopeDecodeBoundary() {
    let duplicate = graphEnvelopeJSON.replacingOccurrences(
      of: "\"id\":\"child\"",
      with: "\"id\":\"root\""
    )

    switch ViraIOSMountEnvelope.decode(Data(duplicate.utf8)) {
    case .success:
      XCTFail("duplicate native document node IDs must fail before runtime expansion")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidEnvelope)
    }
  }

  func testCyclicParentGraphFailsAtEnvelopeDecodeBoundary() {
    let cyclic = graphEnvelopeJSON.replacingOccurrences(
      of: "{\"id\":\"root\",\"component\":\"demo.component.container\",\"order\":0,\"props\":{}}",
      with: "{\"id\":\"root\",\"component\":\"demo.component.container\",\"order\":0,\"props\":{},\"parentId\":\"child\",\"slot\":\"content\"}"
    )

    switch ViraIOSMountEnvelope.decode(Data(cyclic.utf8)) {
    case .success:
      XCTFail("cyclic native document parent graphs must fail before rendering")
    case .failure(let issue):
      XCTAssertEqual(issue.code, .invalidEnvelope)
    }
  }
}
