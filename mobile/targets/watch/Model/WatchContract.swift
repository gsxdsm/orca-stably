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

struct WatchSnapshot: Codable, Equatable, Sendable {
  var v: Int
  var generatedAt: Int64
  var hosts: [WatchHost]
  var sessions: [WatchSession]
  var prompts: [WatchPrompt]
  var feed: [WatchFeedItem]

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

  static func refresh(id: String) -> WatchCommand {
    WatchCommand(id: id, type: "refresh")
  }

  static func respond(id: String, hostId: String, promptId: String, optionId: String) -> WatchCommand {
    WatchCommand(id: id, type: "respond", hostId: hostId, promptId: promptId, optionId: optionId)
  }

  static func send(id: String, sessionKey: String, text: String) -> WatchCommand {
    WatchCommand(id: id, type: "send", sessionKey: sessionKey, text: text)
  }

  static func openOnPhone(id: String, sessionKey: String) -> WatchCommand {
    WatchCommand(id: id, type: "openOnPhone", sessionKey: sessionKey)
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
    return values
  }
}

struct WatchReply: Codable, Equatable, Sendable {
  var v: Int
  var id: String
  var ok: Bool
  var snapshot: WatchSnapshot?
  var reason: String?
  var detail: String? = nil

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
