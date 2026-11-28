import XCTest
@testable import OrcaWatchModel

final class WatchContractTests: XCTestCase {
  func testDecodesFixtureCounts() throws {
    let data = try FixtureFiles.data("snapshot")
    let snapshot = WatchSnapshot.decode(data)
    XCTAssertEqual(snapshot?.v, 1)
    XCTAssertEqual(snapshot?.sessions.count, 5)
    XCTAssertEqual(snapshot?.hosts.count, 2)
    XCTAssertEqual(snapshot?.prompts.count, 1)
    XCTAssertEqual(snapshot?.feed.count, 3)
    XCTAssertNil(snapshot?.bots)
    XCTAssertNil(snapshot?.needsYou)
    XCTAssertNil(snapshot?.usage)
    XCTAssertLessThan(data.count, 60000)
    XCTAssertEqual(snapshot?.hosts.first { $0.hostId == "host-a" }?.connection, .connected)
    XCTAssertEqual(snapshot?.hosts.first { $0.hostId == "host-b" }?.connection, .offline)
    XCTAssertEqual(snapshot?.prompts.first?.options.map(\.optionId), ["allow", "always", "deny", "other"])
  }

  func testRejectsSchemaVersionTwo() {
    let json = #"{"v":2,"generatedAt":1,"hosts":[],"sessions":[],"prompts":[],"feed":[]}"#
    XCTAssertNil(WatchSnapshot.decode(Data(json.utf8)))
  }

  func testDecodesConnectingHost() {
    let json = #"{"hostId":"host-c","name":"Cabin","connection":"connecting"}"#
    let host = try? JSONDecoder().decode(WatchHost.self, from: Data(json.utf8))
    XCTAssertEqual(host?.connection, .connecting)
    XCTAssertEqual(host?.name, "Cabin")
  }

  func testDecodesReplyFixtures() throws {
    let ok = WatchReply.decode(try FixtureFiles.data("reply-ok"))
    XCTAssertEqual(ok, WatchReply(v: 1, id: "cmd-1", ok: true))
    let stale = WatchReply.decode(try FixtureFiles.data("reply-stale"))
    XCTAssertEqual(stale?.ok, false)
    XCTAssertEqual(stale?.reason, "stale")
    XCTAssertEqual(WatchOutcomeCopy.text(for: stale!), "That prompt changed")
  }

  func testRefreshPlistOmitsText() {
    let plist = WatchCommand.refresh(id: "cmd-1").plist()
    XCTAssertEqual(plist.keys.sorted(), ["id", "type", "v"])
    XCTAssertNil(plist["text"])
    XCTAssertNil(plist["hostId"])
    XCTAssertEqual(plist["type"] as? String, "refresh")
    XCTAssertEqual(plist["id"] as? String, "cmd-1")
    XCTAssertEqual(plist["v"] as? Int, 1)
  }

  func testCacheWritesNeedsInputCount() throws {
    var snapshot = try FixtureFiles.snapshot()
    let suite = "orca.watch.tests.cache.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let cache = WatchSnapshotCache(defaults: defaults)
    _ = cache.write(snapshot)
    XCTAssertEqual(defaults.integer(forKey: "needsInputCount"), 2)
    XCTAssertNotNil(defaults.data(forKey: "snapshot"))
    XCTAssertEqual(cache.read()?.sessions.count, 5)
    XCTAssertEqual(cache.read()?.feed.count, 3)
    snapshot.generatedAt = 1762272005000
    XCTAssertEqual(cache.write(snapshot), [])

    let json = #"""
      {"v":1,"generatedAt":1762272010000,"hosts":[],"sessions":[],"prompts":[],"feed":[],
      "bots":[{"hostId":"studio","botId":"bot-1","name":"Triage","status":"needs-you","updatedAt":1762272000000}],
      "needsYou":[{"hostId":"studio","key":"item:1","title":"Choose a release date","botId":"bot-1","updatedAt":1762272000000}],
      "usage":[{"hostId":"studio","provider":"codex","window":"5h","usedPercent":0.5,"updatedAt":1762272000000,"resetsAt":1762290000000}]}
      """#
    let activity = try XCTUnwrap(WatchSnapshot.decode(Data(json.utf8)))
    XCTAssertEqual(cache.write(activity), ["OrcaNeedsInput", "OrcaUsage"])
    XCTAssertEqual(cache.read(), activity)
    XCTAssertEqual(defaults.integer(forKey: "needsInputCount"), 1)
    let summary = try XCTUnwrap(defaults.data(forKey: "orcaWatchGlanceV1"))
    let glance = try XCTUnwrap(JSONSerialization.jsonObject(with: summary) as? [String: Any])
    XCTAssertEqual(glance["v"] as? Int, 1)
    XCTAssertEqual(glance["generatedAt"] as? Int64, 1762272010000)
    XCTAssertEqual(glance["needsYouCount"] as? Int, 1)
    XCTAssertEqual((glance["usage"] as? [[String: Any]])?.first?["usedPercent"] as? Double, 0.5)
  }

  func testContextSnapshotAndTransportFailure() throws {
    let snapshot = try FixtureFiles.snapshot()
    let data = try JSONEncoder().encode(snapshot)
    let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    let decoded = WatchContext.snapshot(from: object)
    XCTAssertEqual(decoded?.sessions.count, 5)
    XCTAssertEqual(decoded?.generatedAt, 1762272000000)
    let wrapped = WatchContext.snapshot(from: ["snapshot": object])
    XCTAssertEqual(wrapped?.hosts.count, 2)
    let failure = WatchTransportFailure.reply(id: "cmd-1")
    XCTAssertEqual(failure.reason, "phone_unavailable")
    XCTAssertEqual(failure.ok, false)
    XCTAssertEqual(WatchOutcomeCopy.text(for: failure), "Open Orca on iPhone")
  }
}
