import Foundation

@main
struct Conformance {
  static func main() throws {
    let args = CommandLine.arguments
    guard args.count >= 5 else { fatalError("valid and three invalid fixture paths required") }
    let validData = try Data(contentsOf: URL(fileURLWithPath: args[1]))
    let decoder = JSONDecoder()
    let document = try decoder.decode(StudioExperienceDocument.self, from: validData)
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    let encoded = try encoder.encode(document)
    let lhs = try JSONSerialization.jsonObject(with: validData) as! NSObject
    let rhs = try JSONSerialization.jsonObject(with: encoded) as! NSObject
    guard lhs.isEqual(rhs) else { fatalError("semantic JSON mismatch") }

    for path in [args[2], args[3], args[4]] {
      let invalid = try Data(contentsOf: URL(fileURLWithPath: path))
      do {
        _ = try decoder.decode(StudioExperienceDocument.self, from: invalid)
        fatalError("invalid fixture decoded successfully: \(path)")
      } catch {
        // Expected structural/version rejection.
      }
    }
    print("SWIFT_CONFORMANCE_OK")
  }
}