import Foundation
import WatchConnectivity

// Owns the WCSession from process start. JS registers later; until then, and if a warm reply
// misses the deadline, the watch gets phone_unavailable and retries the same command id.
final class WatchSessionBridge: NSObject, WCSessionDelegate {
  static let shared = WatchSessionBridge()

  private let queue = DispatchQueue(label: "dev.onorca.watch-connectivity")
  private let replyDeadline: TimeInterval = 8
  private var emitter: (([String: Any]) -> Void)?
  private var jsReady = false
  private var jsRegisteredAtMs: Double = 0
  private var activated = false
  private var pending: [String: PendingReply] = [:]

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func attach(emitter: @escaping ([String: Any]) -> Void) {
    queue.async {
      self.emitter = emitter
      if !self.jsReady {
        self.jsReady = true
        self.jsRegisteredAtMs = Date().timeIntervalSince1970 * 1000
      }
    }
  }

  func sendReply(token: String, reply: [String: Any]) {
    queue.async {
      self.finish(token: token, body: reply)
    }
  }

  func updateContext(_ context: [String: Any]) {
    queue.async {
      guard self.activated else { return }
      try? WCSession.default.updateApplicationContext(context)
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    queue.async {
      self.activated = activationState == .activated && error == nil
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    let receivedAt = Date().timeIntervalSince1970 * 1000
    let commandId = message["id"] as? String ?? ""
    let decision = queue.sync { () -> Forward? in
      guard self.jsReady, let emitter = self.emitter else { return nil }
      let token = UUID().uuidString
      self.pending[token] = PendingReply(handler: replyHandler)
      let payload: [String: Any] = [
        "replyToken": token,
        "command": message,
        "receivedAt": receivedAt,
        "jsRegisteredAt": self.jsRegisteredAtMs
      ]
      return Forward(token: token, commandId: commandId, payload: payload, emitter: emitter)
    }
    guard let decision else {
      // Stay on the session queue. A hop to main waits behind scene connection and drops the reply.
      replyHandler(phoneUnavailable(commandId))
      return
    }
    DispatchQueue.main.async {
      decision.emitter(decision.payload)
    }
    queue.asyncAfter(deadline: .now() + replyDeadline) { [weak self] in
      self?.finish(token: decision.token, body: phoneUnavailable(decision.commandId))
    }
  }

  private func finish(token: String, body: [String: Any]) {
    guard let reply = pending.removeValue(forKey: token) else { return }
    reply.handler(body)
  }
}

private struct Forward {
  let token: String
  let commandId: String
  let payload: [String: Any]
  let emitter: ([String: Any]) -> Void
}

private struct PendingReply {
  let handler: ([String: Any]) -> Void
}

private func phoneUnavailable(_ id: String) -> [String: Any] {
  [
    "v": NSNumber(value: 1),
    "id": id,
    "ok": NSNumber(value: false),
    "reason": "phone_unavailable"
  ]
}
