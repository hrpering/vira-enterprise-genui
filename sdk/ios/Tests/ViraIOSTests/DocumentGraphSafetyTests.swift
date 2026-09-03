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
  ],"actions":[],"dataSources":[]},
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

private func assertInvalidGraphEnvelope(
  _ json: String,
  file: StaticString = #filePath,
  line: UInt = #line
) {
  switch ViraIOSMountEnvelope.decode(Data(json.utf8)) {
  case .success:
    XCTFail("unsafe native document graph must fail before runtime expansion", file: file, line: line)
  case .failure(let issue):
    XCTAssertEqual(issue.code, .invalidEnvelope, file: file, line: line)
  }
}

final class DocumentGraphSafetyTests: XCTestCase {
  func testCanonicalGraphFixtureDecodes() {
    switch ViraIOSMountEnvelope.decode(Data(graphEnvelopeJSON.utf8)) {
    case .failure(let issue):
      XCTFail("canonical graph fixture must reach graph validation successfully: \(issue)")
    case .success:
      break
    }
  }

  func testDuplicateNodeIdsFailAtEnvelopeDecodeBoundary() {
    let duplicate = graphEnvelopeJSON.replacingOccurrences(
      of: "\"id\":\"child\"",
      with: "\"id\":\"root\""
    )
    assertInvalidGraphEnvelope(duplicate)
  }

  func testCyclicParentGraphFailsAtEnvelopeDecodeBoundary() {
    let cyclic = graphEnvelopeJSON.replacingOccurrences(
      of: "{\"id\":\"root\",\"component\":\"demo.component.container\",\"order\":0,\"props\":{}}",
      with: "{\"id\":\"root\",\"component\":\"demo.component.container\",\"order\":0,\"props\":{},\"parentId\":\"child\",\"slot\":\"content\"}"
    )
    assertInvalidGraphEnvelope(cyclic)
  }

  func testCanonicalNodeLimitIsCheckedBeforeParentTraversal() {
    let root = "{\"id\":\"root\",\"component\":\"demo.component.container\",\"order\":0,\"props\":{}}"
    let extraNodes = (1...255).map { index in
      "{\"id\":\"extra-\(index)\",\"component\":\"demo.component.container\",\"order\":\(index + 1),\"props\":{}}"
    }
    let replacement = ([root] + extraNodes).joined(separator: ",")
    let overLimit = graphEnvelopeJSON.replacingOccurrences(of: root, with: replacement)
    assertInvalidGraphEnvelope(overLimit)
  }
}
