import SwiftUI

@main
struct OrcaWatchApp: App {
  @StateObject private var model = WatchSessionModel.make()

  var body: some Scene {
    WindowGroup {
      RootView(model: model)
    }
  }
}
