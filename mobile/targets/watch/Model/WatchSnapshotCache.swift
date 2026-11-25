import Foundation

struct WatchSnapshotCache {
  var defaults: UserDefaults

  func write(_ snapshot: WatchSnapshot) {
    if let data = try? JSONEncoder().encode(snapshot) {
      defaults.set(data, forKey: "snapshot")
    }
    defaults.set(Self.count(snapshot), forKey: "needsInputCount")
  }

  func read() -> WatchSnapshot? {
    guard let data = defaults.data(forKey: "snapshot") else {
      return nil
    }
    return WatchSnapshot.decode(data)
  }

  static func count(_ snapshot: WatchSnapshot) -> Int {
    snapshot.sessions.filter { $0.status == .needsInput }.count
  }
}
