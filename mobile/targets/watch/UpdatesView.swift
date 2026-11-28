import SwiftUI

struct UpdatesView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      WatchPageHeader(model: model, title: "Updates", symbol: "bell")
      if model.feed.isEmpty {
        WatchEmptyState(title: "No updates", symbol: "bell")
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 6) {
            ForEach(model.feed, id: \.id) { item in
              if let key = item.sessionKey, model.session(key) != nil {
                NavigationLink(value: key) {
                  row(item, navigates: true)
                }.buttonStyle(.plain)
              } else {
                NavigationLink {
                  WatchNoticeView(model: model, hostId: item.hostId, title: item.title, detail: item.body)
                } label: { row(item, navigates: true) }
                  .buttonStyle(.plain)
              }
            }
          }
          .padding(.horizontal, 4)
        }
      }
    }
    .background(palette.background)
  }

  private func row(_ item: WatchFeedItem, navigates: Bool) -> some View {
    WatchRow(symbol: item.kind == .finished ? "checkmark.circle" : "bell",
             tint: color(for: item.kind), navigates: navigates) {
      Text(item.title).font(.footnote.weight(.semibold)).lineLimit(2)
      Text(item.body).font(.caption2).lineLimit(2)
      Text(WatchAge.relative(from: item.at, now: model.now))
        .font(.caption2).foregroundStyle(palette.mutedForeground)
    }
    .privacySensitive()
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
