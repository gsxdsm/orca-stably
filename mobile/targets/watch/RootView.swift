import SwiftUI

private enum WatchTab: Hashable {
  case needsYou, bots, sessions, updates, usage
}

struct RootView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.colorScheme) private var scheme
  @State private var tab: WatchTab = .needsYou
  @State private var linkVersion = 0

  var body: some View {
    content
      .environment(\.orcaPalette, OrcaPalette.current(scheme))
      .background(OrcaPalette.current(scheme).background.ignoresSafeArea())
      .onOpenURL { url in
        guard url.scheme == "orca-watch" else { return }
        linkVersion += 1
        switch url.host {
        case "needs-you": tab = .needsYou
        case "usage": tab = .usage
        default: break
        }
      }
  }

  @ViewBuilder private var content: some View {
    if model.screenshot {
      screenshot
    } else {
      TabView(selection: $tab) {
        NavigationStack { NeedsYouView(model: model) }.id(linkVersion).tag(WatchTab.needsYou)
        NavigationStack { BotsView(model: model) }.tag(WatchTab.bots)
        NavigationStack { SessionsView(model: model) }.tag(WatchTab.sessions)
        NavigationStack { UpdatesView(model: model) }.tag(WatchTab.updates)
        NavigationStack { UsageView(model: model) }.id(linkVersion).tag(WatchTab.usage)
      }
    }
  }

  @ViewBuilder private var screenshot: some View {
    switch model.screen {
    case .needsYou:
      NeedsYouView(model: model)
    case .bots:
      BotsView(model: model)
    case .usage:
      UsageView(model: model)
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
