import SwiftUI

struct RootView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    content
      .environment(\.orcaPalette, OrcaPalette.current(scheme))
      .background(OrcaPalette.current(scheme).background.ignoresSafeArea())
  }

  @ViewBuilder private var content: some View {
    if model.screenshot {
      screenshot
    } else {
      NavigationStack {
        TabView {
          SessionsView(model: model)
          UpdatesView(model: model)
        }
      }
    }
  }

  @ViewBuilder private var screenshot: some View {
    switch model.screen {
    case .sessions:
      SessionsView(model: model)
    case .detail:
      SessionDetailView(model: model, sessionKey: model.selectedKey)
    case .prompt, .confirm:
      PromptSheet(model: model, sessionKey: model.selectedKey)
    case .reply:
      ReplyView(model: model, sessionKey: model.selectedKey)
    case .updates:
      UpdatesView(model: model)
    case .widget:
      NeedsInputFace(count: model.needsInputCount())
    }
  }
}
