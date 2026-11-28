import SwiftUI

struct ReplyView: View {
  @ObservedObject var model: WatchSessionModel
  var sessionKey: String?
  var knownMessages: [WatchThreadMessage] = []
  @Environment(\.dismiss) private var dismiss
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    if let session = model.session(sessionKey) {
      let draft = model.draft(for: session.key)
      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          Text("Reply").font(.headline)
          TextField(text: draft) {
            Label("Text or dictation", systemImage: "mic")
          }
          .submitLabel(.done)
          Button {
            model.sendThreadDraft(session: session, knownMessages: knownMessages)
            dismiss()
          } label: {
            Label("Send", systemImage: "arrow.up")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground))
          .disabled(model.busy || !session.canSend ||
            draft.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            draft.wrappedValue.utf16.count > 2000)

          if draft.wrappedValue.utf16.count > 2000 {
            Text("Replies can be up to 2,000 characters.").font(.caption)
              .foregroundStyle(palette.warning)
          }

          if model.prompt(for: session) == nil && session.status != .working &&
              !session.key.contains("|item|") && draft.wrappedValue.isEmpty {
            Button("Continue") {
              model.sendThreadQuickReply(session: session, text: "Continue", knownMessages: knownMessages)
              dismiss()
            }
            .frame(maxWidth: .infinity)
            .disabled(model.busy || !session.canSend)
          }
        }
        .padding(.horizontal, 4)
      }
    } else {
      Text("Session ended").font(.headline)
    }
  }
}
