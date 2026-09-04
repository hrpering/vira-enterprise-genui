import XCTest
@testable import ViraIOS

#if canImport(UIKit)
final class ExternalBrandSurfaceTests: XCTestCase {
  @MainActor
  func testStableCustomerEntrypointIsAvailable() {
    XCTAssertNotNil(ViraExperience.self)
  }
}
#endif
