import Foundation

final class MockWatchTransport: @unchecked Sendable {
  var replies: [WatchReply]
  private(set) var sent: [WatchCommand] = []

  init(replies: [WatchReply] = []) {
    self.replies = replies
  }

  func send(_ command: WatchCommand) async -> WatchReply {
    sent.append(command)
    if replies.isEmpty {
      return WatchReply(v: 1, id: command.id, ok: true)
    }
    return replies.removeFirst()
  }
}
