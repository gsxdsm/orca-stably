import SwiftUI
import WidgetKit

private let staleInterval: TimeInterval = 15 * 60

private func glanceAge(_ time: Date?, at date: Date, stale: Bool) -> String {
  if stale { return "Stale" }
  guard let time else { return "Age unknown" }
  let minutes = max(0, Int(date.timeIntervalSince(time) / 60))
  return minutes == 0 ? "Just now" : "\(minutes)m ago"
}

private struct GlanceUsage: Decodable {
  let hostId: String
  let provider: String
  let window: String
  let usedPercent: Double
  let updatedAt: Int64
  let resetsAt: Int64?
}

private struct GlanceSummary: Decodable {
  let v: Int
  let generatedAt: Int64
  let needsYouCount: Int
  let usage: [GlanceUsage]?
}

struct GlanceEntry: TimelineEntry {
  let date: Date
  fileprivate let count: Int?
  fileprivate let generatedAt: Date?
  fileprivate let usage: GlanceUsage?

  fileprivate var stale: Bool {
    guard let generatedAt else { return true }
    return date.timeIntervalSince(generatedAt) >= staleInterval
  }

  fileprivate var usageStale: Bool {
    guard let usage else { return true }
    return stale || date.timeIntervalSince1970 - Double(usage.updatedAt) / 1000 >= staleInterval
  }
}

struct GlanceProvider: TimelineProvider {
  func placeholder(in context: Context) -> GlanceEntry {
    GlanceEntry(date: Date(), count: nil, generatedAt: nil, usage: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (GlanceEntry) -> Void) {
    completion(read(at: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<GlanceEntry>) -> Void) {
    let now = Date()
    let entry = read(at: now)
    let dates = [entry.generatedAt, entry.usage.map { Date(timeIntervalSince1970: Double($0.updatedAt) / 1_000) }]
      .compactMap { $0 }
    let transitions = Set(dates.flatMap { date in
      [1, 5, 10, 15].map { date.addingTimeInterval(Double($0) * 60) }
    }).filter { $0 > now }.sorted()
    let entries = [entry] + transitions.map {
      GlanceEntry(date: $0, count: entry.count, generatedAt: entry.generatedAt, usage: entry.usage)
    }
    completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(5 * 60))))
  }

  private func read(at date: Date) -> GlanceEntry {
    let name = Bundle.main.object(forInfoDictionaryKey: "OrcaAppGroup") as? String
    let defaults = name.flatMap { UserDefaults(suiteName: $0) }
    if let data = defaults?.data(forKey: "orcaWatchGlanceV1"),
       let summary = try? JSONDecoder().decode(GlanceSummary.self, from: data), summary.v == 1,
       summary.generatedAt > 0, summary.needsYouCount >= 0 {
      let usage = (summary.usage ?? []).filter {
        $0.usedPercent.isFinite && (0...100).contains($0.usedPercent) && $0.updatedAt > 0
      }.sorted {
        if $0.hostId != $1.hostId { return $0.hostId < $1.hostId }
        if $0.provider != $1.provider { return $0.provider < $1.provider }
        if $0.window != $1.window { return $0.window < $1.window }
        return $0.updatedAt > $1.updatedAt
      }.first
      return GlanceEntry(date: date, count: summary.needsYouCount,
                         generatedAt: Date(timeIntervalSince1970: Double(summary.generatedAt) / 1000), usage: usage)
    }
    let count = defaults?.object(forKey: "needsInputCount") as? Int
    return GlanceEntry(date: date, count: count, generatedAt: nil, usage: nil)
  }
}

struct NeedsInputWidgetView: View {
  let entry: GlanceEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      switch family {
      case .accessoryInline:
        Text(entry.count.map { "Needs you \($0)\(entry.stale ? " · Old" : "")" } ?? "Needs you unavailable")
      case .accessoryCircular, .accessoryCorner:
        VStack(spacing: 0) {
          Image(systemName: entry.stale && entry.count != nil ? "clock" : "tray")
            .font(.caption2.weight(.semibold))
            .widgetAccentable()
          Text(entry.count.map(String.init) ?? "—")
            .font(.title2.weight(.semibold)).monospacedDigit()
        }
        .accessibilityLabel(entry.count.map { "\($0) need you\(entry.stale ? ", stale" : "")" } ?? "Needs You unavailable")
      default:
        VStack(alignment: .leading, spacing: 3) {
          Label("Needs You", systemImage: "tray").font(.caption.weight(.semibold)).lineLimit(1)
            .widgetAccentable()
          if let count = entry.count {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
              Text(count.formatted()).font(.title3.weight(.semibold)).monospacedDigit()
              Text(glanceAge(entry.generatedAt, at: entry.date, stale: entry.stale))
                .font(.caption2).lineLimit(1)
            }
          } else {
            Text("Open Orca").font(.caption2)
          }
        }.frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .combine)
      }
    }.privacySensitive()
  }
}

struct UsageWidgetView: View {
  let entry: GlanceEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let usage = entry.usage {
        switch family {
        case .accessoryInline:
          Text("\(usage.provider) \(usage.window): \(Int(usage.usedPercent.rounded()))% used\(entry.usageStale ? " · Old" : "")")
        case .accessoryCircular, .accessoryCorner:
          Gauge(value: usage.usedPercent, in: 0...100) {
            Image(systemName: entry.usageStale ? "clock" : "chart.bar")
              .font(.caption2.weight(.semibold))
          } currentValueLabel: {
            Text("\(Int(usage.usedPercent.rounded()))%")
              .font(.system(.headline, design: .rounded).weight(.semibold))
              .monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
          }.gaugeStyle(.accessoryCircular)
            .accessibilityLabel("\(usage.hostId), \(usage.provider), \(usage.window), \(Int(usage.usedPercent.rounded())) percent used\(entry.usageStale ? ", stale" : "")")
        default:
          HStack(spacing: 7) {
            Gauge(value: usage.usedPercent, in: 0...100) { Text("Used") } currentValueLabel: {
              Text("\(Int(usage.usedPercent.rounded()))%").monospacedDigit()
            }.gaugeStyle(.accessoryCircular)
            VStack(alignment: .leading, spacing: 1) {
              Text(usage.provider).font(.caption.weight(.semibold)).lineLimit(1)
              Text(usage.window).font(.caption2).lineLimit(1)
              HStack(spacing: 3) {
                Text(usage.hostId).lineLimit(1)
                Text(glanceAge(Date(timeIntervalSince1970: Double(usage.updatedAt) / 1_000),
                               at: entry.date, stale: entry.usageStale))
                  .lineLimit(1).layoutPriority(1)
              }
              .font(.caption2)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("\(usage.hostId), \(usage.provider), \(usage.window), \(Int(usage.usedPercent.rounded())) percent used. \(glanceAge(Date(timeIntervalSince1970: Double(usage.updatedAt) / 1_000), at: entry.date, stale: entry.usageStale))")
        }
      } else {
        Text(family == .accessoryRectangular ? "Usage unavailable\nOpen Orca to update" : "Usage —")
          .font(.caption2)
      }
    }.privacySensitive()
  }
}

struct OrcaNeedsInputWidget: Widget {
  let kind = "OrcaNeedsInput"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: GlanceProvider()) { entry in
      NeedsInputWidgetView(entry: entry)
        .widgetURL(URL(string: "orca-watch://needs-you"))
        .containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("Needs you")
    .description("Sessions waiting on you")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
  }
}

struct OrcaUsageWidget: Widget {
  let kind = "OrcaUsage"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: GlanceProvider()) { entry in
      UsageWidgetView(entry: entry)
        .widgetURL(URL(string: "orca-watch://usage"))
        .containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("Usage")
    .description("Account usage for one host, provider and window")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
  }
}

@main
struct OrcaNeedsInputBundle: WidgetBundle {
  var body: some Widget {
    OrcaNeedsInputWidget()
    OrcaUsageWidget()
  }
}
