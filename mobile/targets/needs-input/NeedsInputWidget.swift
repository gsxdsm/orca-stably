import SwiftUI
import WidgetKit

struct NeedsInputEntry: TimelineEntry {
  let date: Date
  let count: Int
}

struct NeedsInputProvider: TimelineProvider {
  func placeholder(in context: Context) -> NeedsInputEntry {
    NeedsInputEntry(date: Date(), count: 0)
  }

  func getSnapshot(in context: Context, completion: @escaping (NeedsInputEntry) -> Void) {
    completion(NeedsInputEntry(date: Date(), count: currentCount()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NeedsInputEntry>) -> Void) {
    let entry = NeedsInputEntry(date: Date(), count: currentCount())
    completion(Timeline(entries: [entry], policy: .never))
  }

  private func currentCount() -> Int {
    let name = Bundle.main.object(forInfoDictionaryKey: "OrcaAppGroup") as? String
    let defaults = name.flatMap { UserDefaults(suiteName: $0) }
    return defaults?.integer(forKey: "needsInputCount") ?? 0
  }
}

struct NeedsInputWidgetView: View {
  var count: Int
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Text("Needs input \(count)")
    case .accessoryCircular, .accessoryCorner:
      Text("\(count)")
        .font(.title2.weight(.semibold))
    default:
      VStack(alignment: .leading, spacing: 2) {
        Text("Needs input")
          .font(.caption2)
        Text("\(count)")
          .font(.title2.weight(.semibold))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct OrcaNeedsInputWidget: Widget {
  let kind = "OrcaNeedsInput"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: NeedsInputProvider()) { entry in
      NeedsInputWidgetView(count: entry.count)
        .containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("Needs input")
    .description("Sessions waiting on you")
    .supportedFamilies([
      .accessoryCircular,
      .accessoryRectangular,
      .accessoryInline,
      .accessoryCorner
    ])
  }
}

@main
struct OrcaNeedsInputBundle: WidgetBundle {
  var body: some Widget {
    OrcaNeedsInputWidget()
  }
}
