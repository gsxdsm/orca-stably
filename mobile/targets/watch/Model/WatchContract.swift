import Foundation

enum WatchConnection: String, Codable, Equatable, Sendable {
  case connected
  case connecting
  case offline
}

enum WatchSessionStatus: String, Codable, Equatable, Sendable {
  case needsInput = "needs-input"
  case working
  case done
  case idle
}

enum WatchOptionRole: String, Codable, Equatable, Sendable {
  case approve
  case approveAlways = "approve-always"
  case deny
  case other
}

enum WatchFeedKind: String, Codable, Equatable, Sendable {
  case needsInput = "needs-input"
  case finished
  case bell
  case other
}

struct WatchHost: Codable, Equatable, Sendable {
  var hostId: String
  var name: String
  var connection: WatchConnection
  var fingerprint: String? = nil
}

struct WatchSession: Codable, Equatable, Sendable {
  var key: String
  var hostId: String
  var title: String
  var agent: String
  var workspace: String
  var status: WatchSessionStatus
  var latest: String?
  var toolName: String?
  var updatedAt: Int64
  var canSend: Bool
  var pendingPromptId: String?
  var canStop: Bool? = nil
}

struct WatchPromptOption: Codable, Equatable, Sendable {
  var optionId: String
  var label: String
  var role: WatchOptionRole
}

struct WatchPrompt: Codable, Equatable, Sendable {
  var hostId: String
  var promptId: String
  var sessionKey: String
  var kind: String
  var title: String
  var detail: String?
  var options: [WatchPromptOption]
  var createdAt: Int64
}

struct WatchFeedItem: Codable, Equatable, Sendable {
  var id: String
  var hostId: String
  var sessionKey: String?
  var title: String
  var body: String
  var at: Int64
  var kind: WatchFeedKind
}

struct WatchBot: Codable, Equatable, Sendable {
  var hostId: String
  var botId: String
  var name: String
  var status: String
  var updatedAt: Int64
  var threadKeys: [String]? = nil
}

struct WatchNeed: Codable, Equatable, Sendable {
  var hostId: String
  var key: String
  var title: String
  var botId: String?
  var sessionKey: String?
  var promptId: String?
  var updatedAt: Int64
}

struct WatchUsage: Codable, Equatable, Sendable {
  var hostId: String
  var provider: String
  var window: String
  var usedPercent: Double
  var updatedAt: Int64
  var resetsAt: Int64?
  var windowMinutes: Int? = nil
  var samples: [WatchUsageSample]? = nil
}

struct WatchUsageSample: Codable, Equatable, Sendable {
  var at: Int64
  var usedPercent: Double
}

struct WatchUsagePace: Codable, Equatable, Sendable {
  var greenMaxOverPacePct: Double
  var yellowMaxOverPacePct: Double
}

struct WatchSnapshot: Codable, Equatable, Sendable {
  var v: Int
  var generatedAt: Int64
  var hosts: [WatchHost]
  var sessions: [WatchSession]
  var prompts: [WatchPrompt]
  var feed: [WatchFeedItem]
  var bots: [WatchBot]? = nil
  var needsYou: [WatchNeed]? = nil
  var usage: [WatchUsage]? = nil
  var usagePace: WatchUsagePace? = nil

  static func decode(_ data: Data) -> WatchSnapshot? {
    guard let snapshot = try? JSONDecoder().decode(WatchSnapshot.self, from: data), snapshot.v == 1 else {
      return nil
    }
    return snapshot
  }
}

struct WatchCommand: Equatable, Sendable {
  var v: Int = 1
  var id: String
  var type: String
  var hostId: String?
  var promptId: String?
  var optionId: String?
  var sessionKey: String?
  var text: String?
  var before: String?

  static func refresh(id: String) -> WatchCommand {
    WatchCommand(id: id, type: "refresh")
  }

  static func respond(id: String, hostId: String, promptId: String, optionId: String) -> WatchCommand {
    WatchCommand(id: id, type: "respond", hostId: hostId, promptId: promptId, optionId: optionId)
  }

  static func send(id: String, sessionKey: String, text: String) -> WatchCommand {
    WatchCommand(id: id, type: "send", sessionKey: sessionKey, text: text)
  }

  static func history(id: String, sessionKey: String, before: String?) -> WatchCommand {
    WatchCommand(id: id, type: "history", sessionKey: sessionKey, before: before)
  }

  static func controlAgent(id: String, sessionKey: String, resume: Bool) -> WatchCommand {
    WatchCommand(id: id, type: resume ? "continue" : "stop", sessionKey: sessionKey)
  }

  static func openOnPhone(id: String, sessionKey: String) -> WatchCommand {
    WatchCommand(id: id, type: "openOnPhone", sessionKey: sessionKey)
  }

  static func openHost(id: String, hostId: String) -> WatchCommand {
    WatchCommand(id: id, type: "openHost", hostId: hostId)
  }

  func plist() -> [String: Any] {
    var values: [String: Any] = ["v": v, "id": id, "type": type]
    if let hostId {
      values["hostId"] = hostId
    }
    if let promptId {
      values["promptId"] = promptId
    }
    if let optionId {
      values["optionId"] = optionId
    }
    if let sessionKey {
      values["sessionKey"] = sessionKey
    }
    if let text {
      values["text"] = text
    }
    if let before {
      values["before"] = before
    }
    return values
  }
}

struct WatchThreadMessage: Codable, Equatable, Sendable, Identifiable {
  enum Role: String, Codable, Sendable { case user, agent }
  var id: String
  var role: Role
  var text: String
  var at: Int64?
  var shortened: Bool? = nil
}

struct WatchThreadPage: Codable, Equatable, Sendable {
  var messages: [WatchThreadMessage]
  var before: String? = nil
  var reset: Bool? = nil
  var generation: String? = nil
  var canContinue: Bool? = nil
}

struct WatchReply: Codable, Equatable, Sendable {
  var v: Int
  var id: String
  var ok: Bool
  var snapshot: WatchSnapshot?
  var reason: String?
  var detail: String? = nil
  var history: WatchThreadPage? = nil
  var messageId: String? = nil

  static func decode(_ data: Data) -> WatchReply? {
    guard let reply = try? JSONDecoder().decode(WatchReply.self, from: data), reply.v == 1 else {
      return nil
    }
    return reply
  }

  static func decode(message: [String: Any]) -> WatchReply? {
    guard JSONSerialization.isValidJSONObject(message),
          let data = try? JSONSerialization.data(withJSONObject: message) else {
      return nil
    }
    return decode(data)
  }
}

enum WatchTransportFailure {
  static func reply(id: String) -> WatchReply {
    WatchReply(v: 1, id: id, ok: false, reason: "phone_unavailable")
  }
}

enum WatchContext {
  static func snapshot(from context: [String: Any]) -> WatchSnapshot? {
    if let data = context["snapshot"] as? Data {
      return WatchSnapshot.decode(data)
    }
    if let text = context["snapshot"] as? String, let data = text.data(using: .utf8) {
      return WatchSnapshot.decode(data)
    }
    if let nested = context["snapshot"] as? [String: Any] {
      return decodeObject(nested)
    }
    return decodeObject(context)
  }

  private static func decodeObject(_ object: [String: Any]) -> WatchSnapshot? {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object) else {
      return nil
    }
    return WatchSnapshot.decode(data)
  }
}
