import Foundation
@testable import OrcaWatchModel

enum FixtureFiles {
  static func data(_ name: String) throws -> Data {
    let url = URL(filePath: #filePath)
      .deletingLastPathComponent()
      .appendingPathComponent("../../watch/Fixtures/\(name).json")
    return try Data(contentsOf: url)
  }

  static func snapshot() throws -> WatchSnapshot {
    let decoded = WatchSnapshot.decode(try data("snapshot"))
    if let decoded {
      return decoded
    }
    throw FixtureError.missingSnapshot
  }
}

enum FixtureError: Error {
  case missingSnapshot
}
