import Foundation

struct WatchCommandClient {
  var send: (WatchCommand) async -> WatchReply
  var pause: (Int) async -> Void
  var onPhase: @MainActor (String?) -> Void

  init(
    send: @escaping (WatchCommand) async -> WatchReply,
    pause: @escaping (Int) async -> Void = { seconds in
      try? await Task.sleep(nanoseconds: UInt64(seconds) * 1_000_000_000)
    },
    onPhase: @escaping @MainActor (String?) -> Void
  ) {
    self.send = send
    self.pause = pause
    self.onPhase = onPhase
  }

  // The phone dedupes by command id, so a wake retry has to repeat this same command.
  @MainActor
  func perform(_ command: WatchCommand) async -> WatchReply {
    var last = WatchReply(v: 1, id: command.id, ok: false, reason: "phone_unavailable")
    for attempt in 1...3 {
      if attempt > 1 {
        onPhase("Waking iPhone…")
        await pause(3)
      }
      last = await send(command)
      if last.ok || last.reason != "phone_unavailable" {
        onPhase(nil)
        return last
      }
    }
    onPhase("Open Orca on iPhone")
    return last
  }
}
