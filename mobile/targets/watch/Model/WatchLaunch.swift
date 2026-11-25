import Foundation

enum WatchScreen: String {
  case sessions
  case detail
  case prompt
  case confirm
  case reply
  case updates
  case widget
}

struct WatchLaunch: Equatable {
  var screen: WatchScreen = .sessions
  var reachable = true
  var outcome: String?
  var phase: String?
  var useMock = false
  var screenshot = false

  static func parse(_ arguments: [String] = CommandLine.arguments) -> WatchLaunch {
    var launch = WatchLaunch()
    var index = 0
    while index < arguments.count {
      let arg = arguments[index]
      let next = index + 1 < arguments.count ? arguments[index + 1] : nil
      switch arg {
      case "-OrcaWatchScreen":
        if let next, let screen = WatchScreen(rawValue: next) {
          launch.screen = screen
          launch.screenshot = true
        }
        index += 2
      case "-OrcaWatchReachable":
        if let next {
          launch.reachable = next == "true"
          launch.screenshot = true
        }
        index += 2
      case "-OrcaWatchOutcome":
        if next == "sent" {
          launch.outcome = "Sent ✓"
        } else if next == "stale" {
          launch.outcome = "That prompt changed"
        }
        launch.screenshot = true
        index += 2
      case "-OrcaWatchPhase":
        if next == "waking" {
          launch.phase = "Waking iPhone…"
        }
        launch.screenshot = true
        index += 2
      case "-OrcaWatchMock":
        launch.useMock = true
        index += 1
      case "-OrcaWatchPhone":
        launch.useMock = false
        index += 1
      default:
        index += 1
      }
    }
    return launch
  }
}

func watchUsesPhoneTransport(_ launch: WatchLaunch, release: Bool) -> Bool {
  release || !launch.useMock
}
