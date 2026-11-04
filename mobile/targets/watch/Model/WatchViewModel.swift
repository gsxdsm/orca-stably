import Foundation

enum WatchAge {
  static func relative(from milliseconds: Int64, now: Date) -> String {
    let seconds = Int(now.timeIntervalSince1970 - Double(milliseconds) / 1000)
    if seconds < 60 {
      return "Just now"
    }
    if seconds < 3600 {
      return "\(seconds / 60)m ago"
    }
    if seconds < 86400 {
      return "\(seconds / 3600)h ago"
    }
    return "\(seconds / 86400)d ago"
  }

  static func updatedLabel(generatedAt: Int64, now: Date) -> String {
    let age = relative(from: generatedAt, now: now)
    if age == "Just now" {
      return "Updated just now"
    }
    return "Updated \(age)"
  }
}

enum WatchReachabilityCopy {
  static func label(reachable: Bool) -> String {
    reachable ? "iPhone" : "iPhone not reachable"
  }
}

enum WatchOutcomeCopy {
  static func text(for reply: WatchReply) -> String {
    if reply.ok {
      return "Sent ✓"
    }
    switch reply.reason {
    case "stale":
      return "That prompt changed"
    case "not_found":
      return "Already gone"
    case "rejected":
      return "Rejected"
    case "unavailable":
      return "Unavailable"
    case "phone_unavailable":
      return "Open Orca on iPhone"
    case "invalid":
      return "Invalid"
    default:
      return "Invalid"
    }
  }
}

enum WatchSections {
  static func title(_ status: WatchSessionStatus) -> String {
    switch status {
    case .needsInput:
      return "Needs input"
    case .working:
      return "Working"
    case .done:
      return "Done"
    case .idle:
      return "Idle"
    }
  }

  static func grouped(_ sessions: [WatchSession]) -> [(title: String, sessions: [WatchSession])] {
    let order: [WatchSessionStatus] = [.needsInput, .working, .done, .idle]
    return order.compactMap { status in
      let rows = sessions.filter { $0.status == status }.sorted { $0.updatedAt > $1.updatedAt }
      if rows.isEmpty {
        return nil
      }
      return (title(status), rows)
    }
  }
}

enum WatchFeedList {
  static func newest(_ feed: [WatchFeedItem]) -> [WatchFeedItem] {
    Array(feed.sorted { $0.at > $1.at }.prefix(20))
  }
}

enum WatchLocalDecision: Equatable, Sendable {
  case send(WatchCommand)
  case needsConfirm(optionId: String)
  case rejected(String)
}

enum WatchActions {
  static func respond(prompt: WatchPrompt, option: WatchPromptOption, nextId: String) -> WatchLocalDecision {
    if option.role == .approveAlways {
      return .needsConfirm(optionId: option.optionId)
    }
    return .send(.respond(id: nextId, hostId: prompt.hostId, promptId: prompt.promptId, optionId: option.optionId))
  }

  static func confirm(prompt: WatchPrompt, optionId: String, nextId: String) -> WatchCommand {
    .respond(id: nextId, hostId: prompt.hostId, promptId: prompt.promptId, optionId: optionId)
  }

  static func sendText(session: WatchSession, text: String, nextId: String) -> WatchLocalDecision {
    if !session.canSend {
      return .rejected("Can't reply")
    }
    if text.isEmpty || text.count > 2000 {
      return .rejected("Invalid")
    }
    return .send(.send(id: nextId, sessionKey: session.key, text: text))
  }

  static func apply(snapshot: WatchSnapshot, reply: WatchReply, command: WatchCommand) -> WatchSnapshot {
    if reply.ok, let replacement = reply.snapshot {
      return replacement
    }
    guard reply.ok, command.type == "respond", let promptId = command.promptId else {
      return snapshot
    }
    var next = snapshot
    next.prompts.removeAll { $0.promptId == promptId }
    next.sessions = next.sessions.map { session in
      guard session.pendingPromptId == promptId else {
        return session
      }
      var copy = session
      copy.pendingPromptId = nil
      if copy.status == .needsInput {
        copy.status = .working
      }
      return copy
    }
    return next
  }
}
