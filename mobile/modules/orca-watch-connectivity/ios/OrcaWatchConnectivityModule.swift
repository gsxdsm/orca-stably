import ExpoModulesCore

public class OrcaWatchConnectivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrcaWatchConnectivity")
    Events("onCommand")

    Function("start") {
      WatchSessionBridge.shared.attach { [weak self] payload in
        self?.sendEvent("onCommand", payload)
      }
    }

    Function("sendReply") { (replyToken: String, reply: [String: Any]) in
      WatchSessionBridge.shared.sendReply(token: replyToken, reply: reply)
    }

    Function("updateContext") { (context: [String: Any]) in
      WatchSessionBridge.shared.updateContext(context)
    }
  }
}
