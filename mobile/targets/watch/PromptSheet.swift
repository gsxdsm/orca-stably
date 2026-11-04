import SwiftUI

struct PromptSheet: View {
  @ObservedObject var model: WatchSessionModel
  var sessionKey: String?
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    let session = model.session(sessionKey)
    let prompt = session.flatMap { model.prompt(for: $0) }
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        if let prompt {
          Text(prompt.title)
            .font(.headline)
            .foregroundStyle(palette.foreground)
          if let detail = prompt.detail {
            Text(detail)
              .font(.caption2)
              .foregroundStyle(palette.mutedForeground)
          }
          if model.confirmOptionId != nil {
            confirm(prompt)
          } else {
            options(prompt)
          }
        } else {
          Text("Already gone")
            .foregroundStyle(palette.mutedForeground)
        }
        if let outcome = model.outcome {
          Text(outcome)
            .font(.caption)
            .foregroundStyle(outcome == "Sent ✓" ? palette.success : palette.warning)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(palette.background)
  }

  private func options(_ prompt: WatchPrompt) -> some View {
    ForEach(prompt.options, id: \.optionId) { option in
      Button(option.label) { model.choose(prompt: prompt, option: option) }
        .buttonStyle(style(for: option.role))
        .disabled(model.busy)
    }
  }

  private func confirm(_ prompt: WatchPrompt) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Allow this every time?")
        .font(.headline)
        .foregroundStyle(palette.foreground)
      Button("Allow always") { model.confirmAlways(prompt: prompt) }
        .buttonStyle(OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground))
        .disabled(model.busy)
      Button("Cancel") { model.cancelConfirm() }
        .buttonStyle(OrcaWideButtonStyle(fill: palette.muted, ink: palette.foreground))
    }
  }

  private func style(for role: WatchOptionRole) -> OrcaWideButtonStyle {
    switch role {
    case .deny:
      return OrcaWideButtonStyle(fill: palette.destructive, ink: palette.destructiveForeground)
    case .approve:
      return OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground)
    case .approveAlways, .other:
      return OrcaWideButtonStyle(fill: palette.muted, ink: palette.foreground)
    }
  }
}
