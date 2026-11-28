import SwiftUI

struct SessionsView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      WatchPageHeader(model: model, title: "Sessions", symbol: "bubble.left.and.bubble.right")
      if model.snapshot == nil {
        VStack(spacing: 8) {
          Text("Open Orca on iPhone")
            .font(.headline)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if model.snapshot?.hosts.isEmpty == true {
        Text("Connect a computer in Orca on iPhone")
          .font(.headline)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if model.groups.isEmpty {
        Text("No sessions")
          .foregroundStyle(palette.mutedForeground)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 6) {
            ForEach(model.groups.indices, id: \.self) { index in
              let group = model.groups[index]
              Text(group.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(group.title == "Needs input" ? palette.warning : palette.mutedForeground)
              ForEach(group.sessions, id: \.key) { session in
                NavigationLink {
                  SessionDetailView(model: model, sessionKey: session.key)
                } label: {
                  sessionRow(session)
                }
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

  private func sessionRow(_ session: WatchSession) -> some View {
    WatchRow(symbol: "bubble.left", tint: palette.status(session.status), navigates: true) {
      Text(session.title).font(.footnote.weight(.semibold)).lineLimit(2)
      Text("\(session.agent) · \(session.workspace)")
        .font(.caption2).foregroundStyle(palette.mutedForeground).lineLimit(1)
      if let latest = session.latest {
        Text(latest).font(.caption2).lineLimit(1)
      }
    }
    .privacySensitive()
  }
}
