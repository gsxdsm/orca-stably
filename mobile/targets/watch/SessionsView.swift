import SwiftUI

struct SessionsView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      footer
      if model.snapshot == nil {
        VStack(spacing: 8) {
          Text("Open Orca on iPhone")
            .font(.headline)
            .multilineTextAlignment(.center)
          Button("Refresh") { model.refresh() }
            .disabled(model.busy)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(model.groups.indices, id: \.self) { index in
              let group = model.groups[index]
              Text(group.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(group.title == "Needs input" ? palette.warning : palette.mutedForeground)
              ForEach(group.sessions, id: \.key) { session in
                if model.screenshot {
                  sessionRow(session)
                } else {
                  NavigationLink {
                    SessionDetailView(model: model, sessionKey: session.key)
                  } label: {
                    sessionRow(session)
                  }
                }
              }
            }
          }
          .padding(.horizontal, 4)
        }
      }
    }
    .background(palette.background)
  }

  private var footer: some View {
    VStack(spacing: 2) {
      StatusLine(updated: model.updatedLabel, reachability: model.reachabilityLabel, phase: model.phase)
      if !model.screenshot {
        Button("Refresh") { model.refresh() }
          .disabled(model.busy)
          .font(.caption)
      }
    }
    .padding(.horizontal, 8)
    .padding(.bottom, 4)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func sessionRow(_ session: WatchSession) -> some View {
    HStack(alignment: .top, spacing: 8) {
      Circle()
        .fill(palette.status(session.status))
        .frame(width: 8, height: 8)
        .padding(.top, 6)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(session.title)
          .font(.headline)
          .foregroundStyle(palette.foreground)
          .lineLimit(1)
        Text("\(session.agent) · \(session.workspace)")
          .font(.caption2)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(1)
        if let latest = session.latest {
          Text(latest)
            .font(.caption2)
            .foregroundStyle(palette.foreground)
            .lineLimit(2)
        }
      }
    }
    .accessibilityElement(children: .combine)
    .padding(6)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 10))
  }
}
