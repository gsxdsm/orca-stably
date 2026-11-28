import Foundation

enum WatchAppGroup {
  static func defaults() -> UserDefaults {
    let name = Bundle.main.object(forInfoDictionaryKey: "OrcaAppGroup") as? String
    if let name, let suite = UserDefaults(suiteName: name) {
      return suite
    }
    return .standard
  }
}

enum WatchFixtureLoader {
  static func snapshot(bundle: Bundle = .main) -> WatchSnapshot? {
    let urls = [
      bundle.url(forResource: "snapshot", withExtension: "json", subdirectory: "Fixtures"),
      bundle.url(forResource: "snapshot", withExtension: "json")
    ]
    for url in urls.compactMap({ $0 }) {
      guard let data = try? Data(contentsOf: url), let snapshot = WatchSnapshot.decode(data) else {
        continue
      }
      return snapshot
    }
    return nil
  }
}
