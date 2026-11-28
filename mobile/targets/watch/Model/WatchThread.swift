import Foundation

struct WatchThread: Equatable {
  var messages: [WatchThreadMessage] = []
  var before: String?
  var loaded = false
  var generation: String?
  var canContinue = false

  mutating func apply(_ page: WatchThreadPage, older: Bool) {
    let reset = page.reset == true || (generation != nil && page.generation != generation)
    if reset {
      self = WatchThread()
    }
    generation = page.generation
    if !older || reset {
      canContinue = page.canContinue == true
    }
    var seen = Set<String>()
    let incoming = page.messages.filter { seen.insert($0.id).inserted }
    let hasWindow = loaded
    if older && !reset {
      messages = incoming.filter { row in !messages.contains { $0.id == row.id } } + messages
    } else {
      if let start = messages.firstIndex(where: { seen.contains($0.id) }) {
        messages = Array(messages[..<start])
      }
      messages.append(contentsOf: incoming)
    }
    if !hasWindow || older || messages.first?.id == incoming.first?.id && !incoming.isEmpty {
      before = page.before
    }
    let maxRetained = 100
    if messages.count > maxRetained {
      messages.removeFirst(messages.count - maxRetained)
      before = nil
    }
    loaded = true
  }
}

struct WatchThreadReply: Identifiable, Equatable {
  enum State: Equatable { case sending, sent, failed(String) }

  var id: String
  var text: String
  var at: Date
  var state: State
  var messageId: String?
  var earlierMessageIds: Set<String>

  func echoed(in messages: [WatchThreadMessage]) -> Bool {
    guard state == .sent else { return false }
    if let messageId {
      return messages.contains { $0.id == messageId }
    }
    return messages.contains { message in
      message.role == .user &&
        !earlierMessageIds.contains(message.id) &&
        (message.at.map { Double($0) >= at.timeIntervalSince1970 * 1000 - 2_000 } ?? false) &&
        text.trimmingCharacters(in: .whitespacesAndNewlines) == message.text
    }
  }
}
