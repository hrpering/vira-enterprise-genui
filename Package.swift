// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "ViraNative",
  platforms: [
    .iOS(.v16),
  ],
  products: [
    .library(name: "ViraIOS", targets: ["ViraIOS"]),
  ],
  targets: [
    .target(
      name: "ViraStudioExperienceWire",
      path: "interop/studio-experience/v1/swift",
      exclude: ["Conformance.swift"],
      sources: ["StudioExperienceModels.swift"]
    ),
    .target(
      name: "ViraIOS",
      dependencies: ["ViraStudioExperienceWire"],
      path: "sdk/ios/Sources/ViraIOS"
    ),
    .testTarget(
      name: "ViraIOSTests",
      dependencies: ["ViraIOS", "ViraStudioExperienceWire"],
      path: "sdk/ios/Tests/ViraIOSTests"
    ),
  ]
)
