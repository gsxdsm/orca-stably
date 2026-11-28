import Foundation

struct WatchNotificationTarget: Equatable, Sendable {
  var notificationId: String?
  var fingerprint: String?
  var paneKey: String?
  var sessionId: String?
  var itemId: String?
  var executionHost: String?

  init(userInfo: [AnyHashable: Any]) {
    let payload = userInfo["orca"] as? [AnyHashable: Any] ?? userInfo
    let target = payload["replyTarget"] as? [String: Any]
    let type = target?["type"] as? String
    notificationId = payload["notificationId"] as? String
    fingerprint = payload["hostFingerprint"] as? String
    paneKey = payload["paneKey"] as? String
    sessionId = type == "chat" ? target?["sessionId"] as? String : nil
    itemId = type == "bot-item" ? target?["itemUid"] as? String : nil
    executionHost = payload["executionHost"] as? String
  }

  func sessionKey(in snapshot: WatchSnapshot) -> String? {
    let hosts = snapshot.hosts.filter { fingerprint == nil || $0.fingerprint == fingerprint }
    let ids = Set(hosts.map(\.hostId))
    let linked = Set(snapshot.feed.compactMap { row in
      row.id == notificationId && ids.contains(row.hostId) ? row.sessionKey : nil
    })
    if linked.count == 1, let key = linked.first, snapshot.sessions.contains(where: { $0.key == key }) {
      return key
    }
    guard fingerprint != nil, hosts.count == 1, let host = hosts.first, executionHost == nil else { return nil }
    let address: String
    if let sessionId {
      address = "chat|\(sessionId)"
    } else if let itemId {
      address = "item|\(itemId)"
    } else if let paneKey {
      address = "term|\(paneKey)"
    } else {
      return nil
    }
    let key = "\(host.hostId)|\(address)"
    return snapshot.sessions.contains(where: { $0.key == key }) ? key : nil
  }
}
