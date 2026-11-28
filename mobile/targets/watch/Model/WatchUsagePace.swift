import Foundation

enum WatchUsageBand: Equatable {
  case green, amber, red
}

extension WatchUsage {
  var reset: Date? {
    resetsAt.map { Date(timeIntervalSince1970: Double($0) / 1000) }
  }

  var start: Date? {
    guard let reset, let windowMinutes, windowMinutes > 0 else { return nil }
    return reset.addingTimeInterval(-Double(windowMinutes) * 60)
  }

  func expectedPercent(at now: Date) -> Double? {
    guard let reset, let start, now > start, now < reset else { return nil }
    return now.timeIntervalSince(start) / reset.timeIntervalSince(start) * 100
  }

  func paceBand(at now: Date, thresholds: WatchUsagePace?) -> WatchUsageBand {
    guard usedPercent < 100 else { return .red }
    guard let expected = expectedPercent(at: now) else {
      let rounded = usedPercent.rounded()
      return rounded >= 80 ? .red : rounded >= 60 ? .amber : .green
    }
    let over = usedPercent - expected
    if over <= (thresholds?.greenMaxOverPacePct ?? 5) + 1e-9 { return .green }
    if over <= (thresholds?.yellowMaxOverPacePct ?? 10) + 1e-9 { return .amber }
    return .red
  }
}
