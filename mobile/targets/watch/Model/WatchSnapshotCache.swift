import Foundation

private struct WatchGlance: Codable {
  var v = 1
  var generatedAt: Int64
  var needsYouCount: Int
  var usage: [WatchUsage]
}

struct WatchSnapshotCache {
  var defaults: UserDefaults

  func write(_ snapshot: WatchSnapshot) -> [String] {
    let encoder = JSONEncoder()
    let glanceKey = "orcaWatchGlanceV1"
    let next = WatchGlance(
      generatedAt: snapshot.generatedAt,
      needsYouCount: Self.count(snapshot),
      usage: (snapshot.usage ?? []).map { entry in
        var glance = entry
        glance.samples = nil
        glance.windowMinutes = nil
        return glance
      }
    )
    guard let data = try? encoder.encode(snapshot),
          let glanceData = try? encoder.encode(next) else {
      return []
    }
    let previous = defaults.data(forKey: glanceKey)
      .flatMap { try? JSONDecoder().decode(WatchGlance.self, from: $0) }
      .flatMap { $0.v == 1 ? $0 : nil }
    defaults.set(data, forKey: "snapshot")
    defaults.set(next.needsYouCount, forKey: "needsInputCount")
    defaults.set(glanceData, forKey: glanceKey)
    // Snapshot time advances on every phone refresh, independently of the widget's content.
    var changed: [String] = []
    if previous?.needsYouCount != next.needsYouCount {
      changed.append("OrcaNeedsInput")
    }
    if previous?.usage != next.usage {
      changed.append("OrcaUsage")
    }
    return changed
  }

  func read() -> WatchSnapshot? {
    guard let data = defaults.data(forKey: "snapshot") else {
      return nil
    }
    return WatchSnapshot.decode(data)
  }

  static func count(_ snapshot: WatchSnapshot) -> Int {
    snapshot.needsYou?.count ?? snapshot.sessions.filter { $0.status == .needsInput }.count
  }
}
