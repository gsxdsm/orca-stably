import XCTest
@testable import OrcaWatchModel

final class WatchThreadTests: XCTestCase {
  func testPaceUsesThePhoneBandsAndSuppressesExpiredMarkers() {
    let reset = Date(timeIntervalSince1970: 180_000)
    let now = reset.addingTimeInterval(-3 * 3600)
    let window = WatchUsage(hostId: "host", provider: "codex", window: "5h",
                            usedPercent: 47, updatedAt: 0, resetsAt: 180_000_000,
                            windowMinutes: 300)
    XCTAssertEqual(window.expectedPercent(at: now), 40)
    XCTAssertEqual(window.paceBand(at: now, thresholds: nil), .amber)
    XCTAssertEqual(window.paceBand(at: now, thresholds: WatchUsagePace(
      greenMaxOverPacePct: 8, yellowMaxOverPacePct: 12
    )), .green)
    XCTAssertNil(window.expectedPercent(at: reset))
  }

  func testHistoryReplyDecodingAndPagingKeepEditedTailInOrder() async throws {
    let first = #"{"v":1,"id":"read","ok":true,"history":{"before":"cursor-a","messages":[{"id":"m2","role":"user","text":"Continue","at":12},{"id":"m3","role":"agent","text":"Working","at":13}]}}"#
    let initial = try XCTUnwrap(WatchReply.decode(Data(first.utf8)))
    let command = WatchCommand.history(id: "older", sessionKey: "host|chat|session", before: initial.history?.before)
    XCTAssertEqual(command.plist()["sessionKey"] as? String, "host|chat|session")
    XCTAssertEqual(command.plist()["before"] as? String, "cursor-a")
    XCTAssertNil(WatchCommand.history(id: "tail", sessionKey: "host|chat|session", before: nil).plist()["before"])

    var thread = WatchThread()
    thread.apply(try XCTUnwrap(initial.history), older: false)
    let early = WatchThreadMessage(id: "m1", role: .agent, text: "Ready", at: 10)
    let updated = WatchThreadMessage(id: "m3", role: .agent, text: "Done", at: 13)
    thread.apply(WatchThreadPage(messages: [early]), older: true)
    thread.apply(WatchThreadPage(messages: [updated], before: "tail-cursor"), older: false)
    XCTAssertEqual(thread.messages.map(\.id), ["m1", "m2", "m3"])
    XCTAssertEqual(thread.messages.last?.text, "Done")
    XCTAssertNil(thread.before)
  }

  func testNotificationResolvesOnlyThePairedHost() throws {
    var snapshot = try FixtureFiles.snapshot()
    snapshot.hosts[1].fingerprint = "paired-b"
    let target = WatchNotificationTarget(userInfo: [
      "orca": ["hostFingerprint": "paired-b", "replyTarget": ["type": "chat", "sessionId": "ses-2"]]
    ])
    XCTAssertEqual(target.sessionKey(in: snapshot), "host-b|chat|ses-2")
    let unknown = WatchNotificationTarget(userInfo: [
      "orca": ["hostFingerprint": "unknown", "replyTarget": ["type": "chat", "sessionId": "ses-2"]]
    ])
    XCTAssertNil(unknown.sessionKey(in: snapshot))
  }
}
