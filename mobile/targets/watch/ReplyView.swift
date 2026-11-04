import SwiftUI
import WatchKit

struct ReplyView: View {
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
          VStack(alignment: .leading, spacing: 6) {
            Text(session.title)
              .font(.headline)
              .foregroundStyle(palette.foreground)
              .lineLimit(1)
            if let outcome = model.outcome {
              Text(outcome)
                .font(.headline)
                .foregroundStyle(outcome == "Sent ✓" ? palette.success : palette.warning)
            }
            HStack(spacing: 4) {
              quick("Continue", session: session)
              quick("Yes", session: session)
              quick("Stop", session: session)
            }
            TextField("Message", text: $model.draft)
            Button("Dictate") { dictate() }
              .buttonStyle(OrcaWideButtonStyle(fill: palette.muted, ink: palette.foreground, minHeight: 32))
            Button("Send") { model.sendDraft(session: session) }
              .buttonStyle(OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground, minHeight: 32))
              .disabled(model.busy || !session.canSend)
          }
          .padding(.horizontal, 4)
        }
      }
      .background(palette.background)
    } else {
      Text("Session ended")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(palette.background)
    }
  }

  private func quick(_ text: String, session: WatchSession) -> some View {
    Button {
      model.quickReply(session: session, text: text)
    } label: {
      Text(text)
        .font(.caption2)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .frame(maxWidth: .infinity, minHeight: 32)
    }
    .buttonStyle(.bordered)
    .disabled(model.busy || !session.canSend)
  }

  private func dictate() {
    WKApplication.shared().visibleInterfaceController?.presentTextInputController(
      withSuggestions: ["Continue", "Yes", "Stop"],
      allowedInputMode: .plain
    ) { results in
      guard let text = results?.first as? String else {
        return
      }
      Task { @MainActor in
        model.dictate(text)
      }
    }
  }
}
