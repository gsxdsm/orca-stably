// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "OrcaWatchModel",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "OrcaWatchModel", path: "Sources"),
    .testTarget(
      name: "OrcaWatchModelTests",
      dependencies: ["OrcaWatchModel"],
      path: "Tests"
    )
  ]
)
