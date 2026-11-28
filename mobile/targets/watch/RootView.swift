import SwiftUI

private enum WatchTab: Hashable {
  case needsYou, bots, sessions, updates, usage
}

struct RootView: View {
  @ObservedObject var model: WatchSessionModel
  @ObservedObject var notifications: WatchNotificationDelegate
  @Environment(\.colorScheme) private var scheme
  @State private var tab: WatchTab = .needsYou
  @State private var linkVersion = 0
  @State private var updatesPath: [String] = []
  @State private var waitingNotification: WatchNotificationTarget?

  var body: some View {
    content
      .environment(\.orcaPalette, OrcaPalette.current(scheme))
      .tint(OrcaPalette.current(scheme).primary)
      .background(OrcaPalette.current(scheme).background.ignoresSafeArea())
      .onReceive(notifications.$target) { target in
        guard let target else { return }
        waitingNotification = target
        tab = .updates
        openNotification()
      }
      .onChange(of: model.snapshot) { openNotification() }
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
        NavigationStack(path: $updatesPath) {
          UpdatesView(model: model)
            .navigationDestination(for: String.self) { key in
              SessionDetailView(model: model, sessionKey: key)
            }
        }.tag(WatchTab.updates)
        NavigationStack { UsageView(model: model) }.id(linkVersion).tag(WatchTab.usage)
      }
      .tabViewStyle(.page)
    }
  }

  private func openNotification() {
    guard let waitingNotification, let snapshot = model.snapshot,
          let sessionKey = waitingNotification.sessionKey(in: snapshot) else { return }
    self.waitingNotification = nil
    tab = .updates
    updatesPath = [sessionKey]
  }

  @ViewBuilder private var screenshot: some View {
    switch model.screen {
    case .needsYou:
      NeedsYouView(model: model)
    case .bots:
      BotsView(model: model)
    case .usage:
      NavigationStack { UsageView(model: model) }
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
