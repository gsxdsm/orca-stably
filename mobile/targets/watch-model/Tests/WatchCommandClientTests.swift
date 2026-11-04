import XCTest
@testable import OrcaWatchModel

@MainActor
final class WatchCommandClientTests: XCTestCase {
  func testRetriesSameIdWhenPhoneUnavailableTwice() async {
    let transport = MockWatchTransport(replies: [
      WatchReply(v: 1, id: "cmd-1", ok: false, reason: "phone_unavailable"),
      WatchReply(v: 1, id: "cmd-1", ok: false, reason: "phone_unavailable"),
      WatchReply(v: 1, id: "cmd-1", ok: true)
    ])
    var phases: [String?] = []
    var pauses: [Double] = []
    let client = WatchCommandClient(
      send: { command in await transport.send(command) },
      pause: { seconds in pauses.append(seconds) },
      onPhase: { phases.append($0) }
    )
    let reply = await client.perform(.refresh(id: "cmd-1"))
    XCTAssertEqual(transport.sent.map(\.id), ["cmd-1", "cmd-1", "cmd-1"])
    XCTAssertEqual(transport.sent.map(\.type), ["refresh", "refresh", "refresh"])
    XCTAssertEqual(pauses, [2.5, 3])
    XCTAssertEqual(phases, ["Waking iPhone…", "Waking iPhone…", nil])
    XCTAssertEqual(reply.ok, true)
    XCTAssertEqual(reply.id, "cmd-1")
  }

  func testShowsOpenOrcaAfterTheWakeWindow() async {
    let unavailable = WatchReply(v: 1, id: "cmd-1", ok: false, reason: "phone_unavailable")
    let transport = MockWatchTransport(replies: Array(repeating: unavailable, count: 5))
    var phases: [String?] = []
    var pauses: [Double] = []
    let client = WatchCommandClient(
      send: { command in await transport.send(command) },
      pause: { seconds in pauses.append(seconds) },
      onPhase: { phases.append($0) }
    )
    let reply = await client.perform(.respond(id: "cmd-1", hostId: "host-a", promptId: "chat:ses-1:item-1:1", optionId: "deny"))
    XCTAssertEqual(transport.sent.count, 5)
    XCTAssertEqual(transport.sent.map(\.id), ["cmd-1", "cmd-1", "cmd-1", "cmd-1", "cmd-1"])
    XCTAssertEqual(transport.sent.map(\.optionId), ["deny", "deny", "deny", "deny", "deny"])
    XCTAssertEqual(pauses, [2.5, 3, 3.5, 4])
    XCTAssertEqual(phases, ["Waking iPhone…", "Waking iPhone…", "Waking iPhone…", "Waking iPhone…", "Open Orca on iPhone"])
    XCTAssertEqual(reply.ok, false)
    XCTAssertEqual(reply.reason, "phone_unavailable")
  }

  func testStaleDoesNotRetry() async {
    let transport = MockWatchTransport(replies: [
      WatchReply(v: 1, id: "cmd-1", ok: false, reason: "stale")
    ])
    var phases: [String?] = []
    var pauses: [Double] = []
    let client = WatchCommandClient(
      send: { command in await transport.send(command) },
      pause: { seconds in pauses.append(seconds) },
      onPhase: { phases.append($0) }
    )
    let reply = await client.perform(.refresh(id: "cmd-1"))
    XCTAssertEqual(transport.sent.count, 1)
    XCTAssertEqual(pauses, [])
    XCTAssertEqual(phases, [nil])
    XCTAssertEqual(reply.reason, "stale")
  }
}
