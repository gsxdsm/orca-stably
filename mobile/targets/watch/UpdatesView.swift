import SwiftUI

struct UpdatesView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      StatusLine(updated: model.updatedLabel, reachability: model.reachabilityLabel, phase: model.phase)
        .padding(.horizontal, 8)
        .padding(.top, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
      if model.feed.isEmpty {
        Text("No updates")
          .foregroundStyle(palette.mutedForeground)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(model.feed, id: \.id) { item in
              VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                  Circle()
                    .fill(color(for: item.kind))
                    .frame(width: 8, height: 8)
                  Text(item.title)
                    .font(.headline)
                    .foregroundStyle(palette.foreground)
                    .lineLimit(1)
                }
                Text(item.body)
                  .font(.caption2)
                  .foregroundStyle(palette.foreground)
                  .lineLimit(2)
                Text(WatchAge.relative(from: item.at, now: model.now))
                  .font(.caption2)
                  .foregroundStyle(palette.mutedForeground)
              }
              .padding(6)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(palette.card, in: RoundedRectangle(cornerRadius: 10))
            }
          }
          .padding(.horizontal, 4)
        }
      }
    }
    .background(palette.background)
  }

  private func color(for kind: WatchFeedKind) -> Color {
    switch kind {
    case .needsInput:
      return palette.warning
    case .finished:
      return palette.success
    case .bell, .other:
      return palette.mutedForeground
    }
  }
}
