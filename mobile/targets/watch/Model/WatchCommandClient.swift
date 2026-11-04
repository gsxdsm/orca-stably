import Foundation

struct WatchCommandClient {
  var send: (WatchCommand) async -> WatchReply
  var pause: (Double) async -> Void
  var onPhase: @MainActor (String?) -> Void

  init(
    send: @escaping (WatchCommand) async -> WatchReply,
    pause: @escaping (Double) async -> Void = { seconds in
      try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    },
    onPhase: @escaping @MainActor (String?) -> Void
  ) {
    self.send = send
    self.pause = pause
    self.onPhase = onPhase
  }

  // Same command id. Five attempts, pausing 2.5, 3, 3.5, then 4 seconds.
  @MainActor
  func perform(_ command: WatchCommand) async -> WatchReply {
    var last = WatchReply(v: 1, id: command.id, ok: false, reason: "phone_unavailable")
    for delay in [0, 2.5, 3, 3.5, 4] {
      if delay > 0 {
        onPhase("Waking iPhone…")
        await pause(delay)
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
