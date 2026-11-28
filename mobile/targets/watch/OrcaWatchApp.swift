import SwiftUI
import UserNotifications
import WatchKit

final class WatchNotificationDelegate: NSObject, ObservableObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
  @Published private(set) var target: WatchNotificationTarget?

  func applicationDidFinishLaunching() {
    UNUserNotificationCenter.current().delegate = self
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
    let target = WatchNotificationTarget(userInfo: response.notification.request.content.userInfo)
    await MainActor.run { self.target = target }
  }
}

@main
struct OrcaWatchApp: App {
  @StateObject private var model = WatchSessionModel.make()
  @WKApplicationDelegateAdaptor(WatchNotificationDelegate.self) private var notifications

  var body: some Scene {
    WindowGroup {
      RootView(model: model, notifications: notifications)
    }
  }
}
