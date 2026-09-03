import Foundation
import XCTest
@testable import ViraIOS

private let projectionEnvelopeJSON = #"""
{
  "version":"1",
  "instanceId":"projection-instance",
  "deploymentId":"projection-deployment",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"demo.artifact","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.ios","platform":"ios"},
  "host":{"version":"1","id":"demo.host.ios","platform":"ios","implementationIds":["demo.ios.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.ios.button","props":[
      {"key":"title","type":"string","required":true,"bindable":true},
      {"key":"count","type":"number","required":false,"bindable":true}
    ],"slots":[],"events":[{"name":"press"}]}
  ],"actions":[{"event":"button.press","actionType":"submit"}],"dataSources":[
    {"kind":"state","path":"catalog.title","valueType":"string"},
    {"kind":"state","path":"catalog.count","valueType":"number"},
    {"kind":"domain","path":"catalog.items","valueType":"array"},
    {"kind":"scope","path":"currentItem.title","valueType":"string"}
  ]},
  "document":{
    "version":"1",
    "id":"demo.projection",
    "recipeId":"demo.projection.recipe",
    "entryView":"main",
    "views":[
      {"id":"main","nodes":[
        {"id":"button","component":"demo.component.button","order":0,"props":{"title":"Main"}}
      ]},
      {"id":"detail","nodes":[
        {"id":"detail-button","component":"demo.component.button","order":0,"props":{"title":"Detail"}}
      ]}
    ],
    "bindings":[],
    "interactions":[
      {"viewId":"main","nodeId":"button","event":"press","actionEvent":"button.press","routes":[
        {"outcome":"success","viewId":"detail"}
      ]}
    ]
  }
}
"""#

private func assertInvalidProjectionEnvelope(
  _ json: String,
  file: StaticString = #filePath,
  line: UInt = #line
) {
  switch ViraIOSMountEnvelope.decode(Data(json.utf8)) {
  case .success:
    XCTFail("forged native document projection must fail at decode boundary", file: file, line: line)
  case .failure(let issue):
    XCTAssertEqual(issue.code, .invalidEnvelope, file: file, line: line)
  }
}

private func assertValidProjectionEnvelope(
  _ json: String,
  file: StaticString = #filePath,
  line: UInt = #line
) {
  switch ViraIOSMountEnvelope.decode(Data(json.utf8)) {
  case .failure(let issue):
    XCTFail("canonical native projection must decode: \(issue)", file: file, line: line)
  case .success:
    break
  }
}

final class DocumentProjectionIntegrityTests: XCTestCase {
  func testCanonicalProjectionStillDecodes() {
    assertValidProjectionEnvelope(projectionEnvelopeJSON)
  }

  func testStaticPropTypeMismatchFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "\"props\":{\"title\":\"Main\"}",
      with: "\"props\":{\"title\":7}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testUnknownStaticPropFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "\"props\":{\"title\":\"Main\"}",
      with: "\"props\":{\"title\":\"Main\",\"rogue\":true}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testMissingRequiredStaticPropWithoutBindingFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "\"props\":{\"title\":\"Main\"}",
      with: "\"props\":{}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testRequiredPropMayBeSatisfiedByCanonicalBinding() {
    let bound = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "\"props\":{\"title\":\"Main\"}",
        with: "\"props\":{}"
      )
      .replacingOccurrences(
        of: "\"bindings\":[]",
        with: "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"state\",\"path\":\"catalog.title\"}}]"
      )
    assertValidProjectionEnvelope(bound)
  }

  func testUnregisteredBindingSourceFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "\"props\":{\"title\":\"Main\"}",
        with: "\"props\":{}"
      )
      .replacingOccurrences(
        of: "\"bindings\":[]",
        with: "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"state\",\"path\":\"catalog.rogue\"}}]"
      )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testBindingSourceDeclaredTypeMustMatchProjectedProp() {
    let malformed = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "\"props\":{\"title\":\"Main\"}",
        with: "\"props\":{}"
      )
      .replacingOccurrences(
        of: "\"bindings\":[]",
        with: "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"state\",\"path\":\"catalog.count\"}}]"
      )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testStaticAndBoundPropConflictFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "\"bindings\":[]",
      with: "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"state\",\"path\":\"catalog.title\"}}]"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testScopeBindingOutsideRepeatFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "\"props\":{\"title\":\"Main\"}",
        with: "\"props\":{}"
      )
      .replacingOccurrences(
        of: "\"bindings\":[]",
        with: "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"scope\",\"path\":\"currentItem.title\"}}]"
      )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testRegisteredArrayRepeatSourceIsAccepted() {
    let repeated = projectionEnvelopeJSON.replacingOccurrences(
      of: "{\"id\":\"button\",\"component\":\"demo.component.button\",\"order\":0,\"props\":{\"title\":\"Main\"}}",
      with: "{\"id\":\"button\",\"component\":\"demo.component.button\",\"order\":0,\"props\":{\"title\":\"Main\"},\"repeat\":{\"source\":{\"kind\":\"domain\",\"path\":\"catalog.items\"}}}"
    )
    assertValidProjectionEnvelope(repeated)
  }

  func testUnregisteredRepeatSourceFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "{\"id\":\"button\",\"component\":\"demo.component.button\",\"order\":0,\"props\":{\"title\":\"Main\"}}",
      with: "{\"id\":\"button\",\"component\":\"demo.component.button\",\"order\":0,\"props\":{\"title\":\"Main\"},\"repeat\":{\"source\":{\"kind\":\"domain\",\"path\":\"catalog.rogue\"}}}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testRequiredEventPayloadBindingIsAcceptedWhenProjectedTypeMatches() {
    let valid = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "{\"name\":\"press\"}",
        with: "{\"name\":\"press\",\"payload\":[{\"key\":\"label\",\"type\":\"string\",\"required\":true}]}"
      )
      .replacingOccurrences(
        of: "{\"outcome\":\"success\",\"viewId\":\"detail\"}\n      ]}",
        with: "{\"outcome\":\"success\",\"viewId\":\"detail\"}\n      ],\"payloadBindings\":[{\"key\":\"label\",\"source\":{\"kind\":\"literal\",\"value\":\"Main\"}}]}"
      )
    assertValidProjectionEnvelope(valid)
  }

  func testMissingRequiredEventPayloadBindingFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "{\"name\":\"press\"}",
      with: "{\"name\":\"press\",\"payload\":[{\"key\":\"label\",\"type\":\"string\",\"required\":true}]}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testWrongLiteralEventPayloadTypeFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON
      .replacingOccurrences(
        of: "{\"name\":\"press\"}",
        with: "{\"name\":\"press\",\"payload\":[{\"key\":\"label\",\"type\":\"string\",\"required\":true}]}"
      )
      .replacingOccurrences(
        of: "{\"outcome\":\"success\",\"viewId\":\"detail\"}\n      ]}",
        with: "{\"outcome\":\"success\",\"viewId\":\"detail\"}\n      ],\"payloadBindings\":[{\"key\":\"label\",\"source\":{\"kind\":\"literal\",\"value\":7}}]}"
      )
    assertInvalidProjectionEnvelope(malformed)
  }

  func testRouteToMissingViewFailsAtEnvelopeBoundary() {
    let malformed = projectionEnvelopeJSON.replacingOccurrences(
      of: "{\"outcome\":\"success\",\"viewId\":\"detail\"}",
      with: "{\"outcome\":\"success\",\"viewId\":\"missing\"}"
    )
    assertInvalidProjectionEnvelope(malformed)
  }
}
