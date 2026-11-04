import Foundation
import WatchConnectivity

final class PhoneWatchTransport: NSObject, WCSessionDelegate {
  var onSnapshot: (@MainActor (WatchSnapshot) -> Void)?
  var onReachable: (@MainActor (Bool) -> Void)?

  func activate() {
    guard WCSession.isSupported() else {
      return
    }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func send(_ command: WatchCommand) async -> WatchReply {
    let payload = command.plist()
    let commandId = command.id
    return await withCheckedContinuation { continuation in
      let gate = ResumeOnce()
      let finish: (WatchReply) -> Void = { reply in
        gate.run { continuation.resume(returning: reply) }
      }
      guard WCSession.isSupported() else {
        finish(WatchTransportFailure.reply(id: commandId))
        return
      }
      WCSession.default.sendMessage(payload, replyHandler: { message in
        let reply = WatchReply.decode(message: message)
          ?? WatchReply(v: 1, id: commandId, ok: false, reason: "invalid")
        finish(reply)
      }, errorHandler: { _ in
        finish(WatchTransportFailure.reply(id: commandId))
      })
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    deliver(context: session.receivedApplicationContext, reachable: session.isReachable)
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    deliver(context: applicationContext, reachable: session.isReachable)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    let report = onReachable
    Task { @MainActor in
      report?(reachable)
    }
  }

  private func deliver(context: [String: Any], reachable: Bool) {
    let snapshot = WatchContext.snapshot(from: context)
    let reportSnapshot = onSnapshot
    let reportReachable = onReachable
    Task { @MainActor in
      reportReachable?(reachable)
      if let snapshot {
        reportSnapshot?(snapshot)
      }
    }
  }
}

private final class ResumeOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false

  func run(_ body: () -> Void) {
    lock.lock()
    if done {
      lock.unlock()
      return
    }
    done = true
    lock.unlock()
    body()
  }
}
