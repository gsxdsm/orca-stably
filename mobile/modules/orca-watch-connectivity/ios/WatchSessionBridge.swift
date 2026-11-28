import Foundation
import WatchConnectivity

// A cold wake can retry safely. After forwarding a mutation, a missed deadline is ambiguous.
final class WatchSessionBridge: NSObject, WCSessionDelegate {
  static let shared = WatchSessionBridge()

  private let queue = DispatchQueue(label: "dev.onorca.watch-connectivity")
  private let replyDeadline: TimeInterval = 24
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
    let commandType = message["type"] as? String
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
      return Forward(token: token, payload: payload, emitter: emitter)
    }
    guard let decision else {
      // Stay on the session queue. A hop to main waits behind scene connection and drops the reply.
      replyHandler(failure(commandId, reason: "phone_unavailable"))
      return
    }
    DispatchQueue.main.async {
      decision.emitter(decision.payload)
    }
    queue.asyncAfter(deadline: .now() + replyDeadline) { [weak self] in
      let reason = commandType.map { ["send", "respond", "stop", "continue"].contains($0) } == true
        ? "unknown" : "phone_unavailable"
      self?.finish(token: decision.token, body: failure(commandId, reason: reason))
    }
  }

  private func finish(token: String, body: [String: Any]) {
    guard let reply = pending.removeValue(forKey: token) else { return }
    reply.handler(body)
  }
}

private struct Forward {
  let token: String
  let payload: [String: Any]
  let emitter: ([String: Any]) -> Void
}

private struct PendingReply {
  let handler: ([String: Any]) -> Void
}

private func failure(_ id: String, reason: String) -> [String: Any] {
  [
    "v": NSNumber(value: 1),
    "id": id,
    "ok": NSNumber(value: false),
    "reason": reason
  ]
}
