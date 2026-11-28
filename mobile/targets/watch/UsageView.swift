import Charts
import SwiftUI

private struct UsageProvider: Identifiable {
  let host: String
  let provider: String
  let windows: [WatchUsage]
  var id: [String] { [host, provider] }
  var title: String {
    switch provider.lowercased() {
    case "opencode": "OpenCode"
    case "openrouter": "OpenRouter"
    default: provider.capitalized
    }
  }
}

struct UsageView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  private var providers: [UsageProvider] {
    Dictionary(grouping: model.snapshot?.usage ?? [], by: { [$0.hostId, $0.provider] })
      .values.compactMap { rows in
        guard let first = rows.first else { return nil }
        return UsageProvider(host: first.hostId, provider: first.provider,
                             windows: rows.sorted { ($0.windowMinutes ?? 0, $0.window) < ($1.windowMinutes ?? 0, $1.window) })
      }
      .sorted { ($0.title, $0.host) < ($1.title, $1.host) }
  }

  var body: some View {
    VStack(spacing: 0) {
      WatchPageHeader(model: model, title: "Usage", symbol: "chart.bar.xaxis")
      if providers.isEmpty {
        WatchEmptyState(title: model.snapshot == nil ? "Open Orca on iPhone" : "Usage unavailable",
                        symbol: "chart.bar.xaxis")
      } else {
        ScrollView {
          LazyVStack(spacing: 8) {
            ForEach(providers) { provider in
              NavigationLink {
                providerDetail(id: provider.id)
              } label: {
                TimelineView(.periodic(from: .now, by: 60)) { timeline in
                  providerCard(provider, now: model.screenshot ? model.now : timeline.date)
                }
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.horizontal, 4)
        }
      }
    }
  }

  private func providerCard(_ provider: UsageProvider, now: Date) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(provider.title).font(.footnote.weight(.semibold)).lineLimit(1)
          Text(watchHostName(provider.host, snapshot: model.snapshot))
            .font(.caption2).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.caption2).foregroundStyle(palette.mutedForeground)
      }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 73), spacing: 5)], spacing: 8) {
        ForEach(provider.windows, id: \.window) { window in
          VStack(spacing: 3) {
            UsageRing(window: window, now: now, thresholds: model.snapshot?.usagePace)
            Text(window.window).font(.caption.weight(.semibold)).lineLimit(1)
            resetLabel(window, now: now)
          }
        }
      }
      if let window = provider.windows.first(where: { ($0.samples?.count ?? 0) >= 2 }) {
        UsageHistoryChart(window: window, color: color(window, now: now), compact: true)
      } else {
        Text("Collecting history").font(.caption2).foregroundStyle(palette.mutedForeground)
      }
    }
    .padding(8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 14))
    .privacySensitive()
  }

  @ViewBuilder private func providerDetail(id: [String]) -> some View {
    if let provider = providers.first(where: { $0.id == id }) {
      ScrollView {
        TimelineView(.periodic(from: .now, by: 60)) { timeline in
          let now = model.screenshot ? model.now : timeline.date
          VStack(alignment: .leading, spacing: 14) {
            ForEach(provider.windows, id: \.window) { window in
              VStack(alignment: .leading, spacing: 6) {
                HStack {
                  UsageRing(window: window, now: now, thresholds: model.snapshot?.usagePace)
                  VStack(alignment: .leading, spacing: 2) {
                    Text(window.window).font(.headline)
                    resetLabel(window, now: now)
                    if let expected = window.expectedPercent(at: now) {
                      Text("\(Int(expected.rounded()))% elapsed").font(.caption2)
                        .foregroundStyle(palette.mutedForeground)
                    }
                  }
                  Spacer(minLength: 0)
                }
                if (window.samples?.count ?? 0) >= 2 {
                  UsageHistoryChart(window: window, color: color(window, now: now), compact: false)
                  if window.start != nil && window.reset != nil {
                    Label("Dashed line is even pace", systemImage: "line.diagonal")
                      .font(.caption2).foregroundStyle(palette.mutedForeground)
                  }
                } else {
                  Text("Collecting history").font(.caption2).foregroundStyle(palette.mutedForeground)
                }
              }
            }
          }
          .padding(.horizontal, 4)
        }
      }
      .navigationTitle(provider.title)
      .privacySensitive()
    } else {
      WatchEmptyState(title: "Usage unavailable", symbol: "chart.bar.xaxis")
    }
  }

  private func resetLabel(_ window: WatchUsage, now: Date) -> some View {
    Group {
      if let reset = window.reset, reset > now {
        let minutes = max(1, Int(ceil(reset.timeIntervalSince(now) / 60)))
        if minutes >= 1440 {
          Text("Resets \(minutes / 1440)d \((minutes / 60) % 24)h")
        } else if minutes >= 60 {
          Text("Resets \(minutes / 60)h \(minutes % 60)m")
        } else {
          Text("Resets \(minutes)m")
        }
      } else if window.reset != nil {
        Text("Awaiting reset")
      } else {
        Text("Reset unknown")
      }
    }
    .font(.caption2)
    .foregroundStyle(palette.mutedForeground)
    .monospacedDigit()
    .lineLimit(1)
    .minimumScaleFactor(0.8)
  }

  private func color(_ window: WatchUsage, now: Date) -> Color {
    palette.usage(window.paceBand(at: now, thresholds: model.snapshot?.usagePace))
  }
}

private struct UsageRing: View {
  var window: WatchUsage
  var now: Date
  var thresholds: WatchUsagePace?
  @Environment(\.orcaPalette) private var palette
  @ScaledMetric(relativeTo: .caption) private var size = 51.0

  var body: some View {
    let marker = window.expectedPercent(at: now)
    let color = palette.usage(window.paceBand(at: now, thresholds: thresholds))
    ZStack {
      Circle().strokeBorder(palette.muted, lineWidth: 5)
      Circle().inset(by: 2.5).trim(from: 0, to: window.usedPercent / 100)
        .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if let marker {
        Capsule().fill(palette.foreground)
          .frame(width: 2, height: 9).offset(y: -(size - 5) / 2)
          .rotationEffect(.degrees(marker * 3.6))
      }
      Text("\(Int(window.usedPercent.rounded()))%")
        .font(.system(.caption, design: .rounded).weight(.semibold))
        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        .padding(5)
    }
    .frame(width: size, height: size)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(Int(window.usedPercent.rounded())) percent used")
    .accessibilityValue(marker.map { "\(Int($0.rounded())) percent of time elapsed" } ?? "Pace unavailable")
  }
}

private struct UsageHistoryChart: View {
  var window: WatchUsage
  var color: Color
  var compact: Bool
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    let samples = window.samples ?? []
    let dates = samples.map { Date(timeIntervalSince1970: Double($0.at) / 1_000) }
    let sampleStart = dates.first ?? .now
    let sampleEnd = dates.last ?? sampleStart
    let start = compact ? sampleStart : (window.start ?? sampleStart)
    let end = max(start.addingTimeInterval(60), compact ? sampleEnd : (window.reset ?? sampleEnd))
    Chart {
      ForEach(samples, id: \.at) { point in
        LineMark(x: .value("Time", Date(timeIntervalSince1970: Double(point.at) / 1_000)),
                 y: .value("Used", point.usedPercent), series: .value("Series", "Used"))
          .foregroundStyle(color)
          .lineStyle(StrokeStyle(lineWidth: compact ? 1.5 : 2))
      }
      if !compact && window.start != nil && window.reset != nil {
        ForEach([start, end], id: \.self) { date in
          LineMark(x: .value("Time", date), y: .value("Even pace", date == start ? 0 : 100),
                   series: .value("Series", "Even pace"))
            .foregroundStyle(palette.mutedForeground)
            .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
      }
    }
    .chartXScale(domain: start...end)
    .chartYScale(domain: 0...100)
    .chartXAxis(.hidden)
    .chartYAxis {
      if !compact {
        AxisMarks(position: .leading, values: [0, 50, 100]) { value in
          AxisGridLine()
          AxisValueLabel {
            if let percent = value.as(Int.self) { Text("\(percent)%").font(.caption2) }
          }
        }
      }
    }
    .frame(height: compact ? 22 : 100)
    .accessibilityLabel("\(window.window) usage history")
  }
}

private extension OrcaPalette {
  func usage(_ band: WatchUsageBand) -> Color {
    switch band {
    case .green: success
    case .amber: warning
    case .red: destructive
    }
  }
}
