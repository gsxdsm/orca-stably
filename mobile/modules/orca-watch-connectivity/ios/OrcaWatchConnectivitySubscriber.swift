import ExpoModulesCore
import UIKit

// Activate the session before React Native exists. The scene plugin starts JS later, when a
// background scene connects; this subscriber must not create a window or start React Native.
public class OrcaWatchConnectivitySubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchSessionBridge.shared.activate()
    return true
  }
}
