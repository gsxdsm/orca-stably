import SwiftUI

struct SessionDetailView: View {
  @ObservedObject var model: WatchSessionModel
  var sessionKey: String?
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    if let session = model.session(sessionKey) {
      VStack(spacing: 0) {
        StatusLine(updated: model.updatedLabel, reachability: model.reachabilityLabel, phase: model.phase)
          .padding(.horizontal, 8)
          .padding(.top, 2)
          .frame(maxWidth: .infinity, alignment: .leading)
        ScrollView {
          VStack(alignment: .leading, spacing: 4) {
            Text(session.title)
              .font(.headline)
              .foregroundStyle(palette.foreground)
              .lineLimit(1)
            Text("\(session.agent) · \(session.workspace)")
              .font(.caption2)
              .foregroundStyle(palette.mutedForeground)
              .lineLimit(1)
            if let prompt = model.prompt(for: session) {
              promptCard(prompt)
            }
            if let latest = session.latest {
              Text(latest)
                .font(.caption2)
                .foregroundStyle(palette.foreground)
                .lineLimit(1)
            }
            HStack(spacing: 6) {
              if let toolName = session.toolName {
                Text(toolName)
                  .foregroundStyle(palette.warning)
              }
              Text(WatchAge.relative(from: session.updatedAt, now: model.now))
                .foregroundStyle(palette.mutedForeground)
            }
            .font(.caption2)
            if let outcome = model.outcome {
              Text(outcome)
                .font(.caption)
                .foregroundStyle(outcome == "Sent ✓" ? palette.success : palette.warning)
            }
            if session.canSend && !model.screenshot {
              NavigationLink {
                ReplyView(model: model, sessionKey: session.key)
              } label: {
                Text("Reply")
                  .frame(maxWidth: .infinity, minHeight: 36)
              }
              .buttonStyle(.borderedProminent)
              .tint(palette.primary)
            }
            if !model.screenshot {
              Button("Open on iPhone") { model.openOnPhone(session: session) }
                .disabled(model.busy)
                .font(.caption)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 4)
        }
      }
      .background(palette.background)
      .sheet(isPresented: $model.showingPrompt) {
        PromptSheet(model: model, sessionKey: session.key)
      }
    } else {
      ended(model.outcome)
    }
  }

  private func ended(_ outcome: String?) -> some View {
    let text = WatchDetailCopy.missingSession(outcome)
    return Text(text)
      .font(.headline)
      .foregroundStyle(text == "Sent ✓" ? palette.success : (outcome == nil ? palette.foreground : palette.warning))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(palette.background)
  }

  private func promptCard(_ prompt: WatchPrompt) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(prompt.title)
        .font(.caption.weight(.semibold))
        .lineLimit(1)
      if let approve = prompt.options.first(where: { $0.role == .approve }) {
        Button(approve.label) { model.choose(prompt: prompt, option: approve) }
          .buttonStyle(OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground, minHeight: 32))
          .disabled(model.busy)
      }
      if let deny = prompt.options.first(where: { $0.role == .deny }) {
        Button(deny.label) { model.choose(prompt: prompt, option: deny) }
          .buttonStyle(OrcaWideButtonStyle(fill: palette.destructive, ink: palette.destructiveForeground, minHeight: 32))
          .disabled(model.busy)
      }
      if !model.screenshot {
        Button("All options") { model.showingPrompt = true }
          .font(.caption)
      }
    }
    .padding(6)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 12))
  }
}
