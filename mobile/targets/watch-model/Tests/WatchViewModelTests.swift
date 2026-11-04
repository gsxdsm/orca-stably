import XCTest
@testable import OrcaWatchModel

final class WatchViewModelTests: XCTestCase {
  func testGroupsNeedsInputFirstByNewest() throws {
    let snapshot = try FixtureFiles.snapshot()
    let grouped = WatchSections.grouped(snapshot.sessions)
    XCTAssertEqual(grouped.map(\.title), ["Needs input", "Working", "Done", "Idle"])
    XCTAssertEqual(grouped[0].sessions.map(\.key), ["host-a|chat|ses-1", "host-a|chat|ses-9"])
    XCTAssertEqual(grouped[1].sessions.map(\.key), ["host-b|term|pty-1"])
    XCTAssertEqual(grouped[2].sessions.map(\.key), ["host-a|chat|ses-3"])
    XCTAssertEqual(grouped[3].sessions.map(\.key), ["host-b|chat|ses-2"])
  }

  func testRelativeAgeUsesLiteralInstants() {
    XCTAssertEqual(
      WatchAge.relative(from: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 180)),
      "3m ago"
    )
    XCTAssertEqual(
      WatchAge.relative(from: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 30)),
      "Just now"
    )
    XCTAssertEqual(
      WatchAge.relative(from: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 7200)),
      "2h ago"
    )
    XCTAssertEqual(
      WatchAge.relative(from: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 93600)),
      "1d ago"
    )
    XCTAssertEqual(
      WatchAge.updatedLabel(generatedAt: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 180)),
      "Updated 3m ago"
    )
    XCTAssertEqual(
      WatchAge.updatedLabel(generatedAt: 1762272000000, now: Date(timeIntervalSince1970: 1762272000 + 30)),
      "Updated just now"
    )
  }

  func testReachabilityAndReplyCopy() {
    XCTAssertNil(WatchReachabilityCopy.label(reachable: true))
    XCTAssertEqual(WatchReachabilityCopy.label(reachable: false), "iPhone not reachable")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: true)), "Sent ✓")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: false, reason: "stale")), "That prompt changed")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: false, reason: "not_found")), "Already gone")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: false, reason: "rejected")), "Rejected")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: false, reason: "unavailable")), "Unavailable")
    XCTAssertEqual(WatchOutcomeCopy.text(for: WatchReply(v: 1, id: "cmd-1", ok: false, reason: "invalid")), "Invalid")
    XCTAssertEqual(WatchDetailCopy.missingSession("That prompt changed"), "That prompt changed")
    XCTAssertEqual(WatchDetailCopy.missingSession("Sent ✓"), "Sent ✓")
    XCTAssertEqual(WatchDetailCopy.missingSession("Already gone"), "Already gone")
    XCTAssertEqual(WatchDetailCopy.missingSession(nil), "Session ended")
  }

  func testDenyUsesInjectedId() throws {
    let prompt = try XCTUnwrap(FixtureFiles.snapshot().prompts.first)
    let deny = try XCTUnwrap(prompt.options.first { $0.role == .deny })
    let decision = WatchActions.respond(prompt: prompt, option: deny, nextId: "cmd-1")
    guard case .send(let command) = decision else {
      return XCTFail("deny should send")
    }
    XCTAssertEqual(command.id, "cmd-1")
    XCTAssertEqual(command.optionId, "deny")
    XCTAssertEqual(command.type, "respond")
    XCTAssertEqual(command.promptId, "chat:ses-1:item-1:1")
    XCTAssertEqual(command.hostId, "host-a")
    XCTAssertNil(command.text)
  }

  func testApproveAlwaysConfirmsBeforeSend() throws {
    let prompt = try XCTUnwrap(FixtureFiles.snapshot().prompts.first)
    let always = try XCTUnwrap(prompt.options.first { $0.role == .approveAlways })
    let decision = WatchActions.respond(prompt: prompt, option: always, nextId: "cmd-2")
    XCTAssertEqual(decision, .needsConfirm(optionId: "always"))
    let command = WatchActions.confirm(prompt: prompt, optionId: "always", nextId: "cmd-3")
    XCTAssertEqual(command.id, "cmd-3")
    XCTAssertEqual(command.optionId, "always")
    XCTAssertEqual(command.type, "respond")
    XCTAssertEqual(command.promptId, "chat:ses-1:item-1:1")
  }

  func testRejectsEmptyTooLongAndBlockedSend() throws {
    let snapshot = try FixtureFiles.snapshot()
    let open = try XCTUnwrap(snapshot.sessions.first { $0.key == "host-a|chat|ses-1" })
    let blocked = try XCTUnwrap(snapshot.sessions.first { $0.key == "host-a|chat|ses-3" })
    XCTAssertEqual(WatchActions.sendText(session: open, text: "", nextId: "cmd-4"), .rejected("Invalid"))
    XCTAssertEqual(
      WatchActions.sendText(session: open, text: String(repeating: "a", count: 2001), nextId: "cmd-5"),
      .rejected("Invalid")
    )
    XCTAssertEqual(WatchActions.sendText(session: blocked, text: "Continue", nextId: "cmd-6"), .rejected("Can't reply"))
    let allowed = WatchActions.sendText(session: open, text: String(repeating: "a", count: 2000), nextId: "cmd-7")
    guard case .send(let command) = allowed else {
      return XCTFail("2000 characters should send")
    }
    XCTAssertEqual(command.id, "cmd-7")
    XCTAssertEqual(command.text, String(repeating: "a", count: 2000))
    XCTAssertEqual(command.sessionKey, "host-a|chat|ses-1")
    let quick = WatchActions.sendText(session: open, text: "Continue", nextId: "cmd-8")
    guard case .send(let quickCommand) = quick else {
      return XCTFail("Continue should send")
    }
    XCTAssertEqual(quickCommand.text, "Continue")
    XCTAssertEqual(quickCommand.id, "cmd-8")
  }

  func testDictatedAndTypedTextBothSubmitSend() throws {
    let snapshot = try FixtureFiles.snapshot()
    let open = try XCTUnwrap(snapshot.sessions.first { $0.key == "host-a|chat|ses-1" })
    let dictated = WatchActions.sendText(session: open, text: "Yeti", nextId: "dictate")
    let typed = WatchActions.sendText(session: open, text: "Yeti", nextId: "typed")
    guard case .send(let dictatedCommand) = dictated, case .send(let typedCommand) = typed else {
      return XCTFail("dictation and typed text should both submit a send")
    }
    XCTAssertEqual(dictatedCommand.type, "send")
    XCTAssertEqual(typedCommand.type, "send")
    XCTAssertEqual(dictatedCommand.text, "Yeti")
    XCTAssertEqual(typedCommand.text, "Yeti")
    XCTAssertEqual(dictatedCommand.sessionKey, open.key)
    XCTAssertEqual(typedCommand.sessionKey, open.key)
    let refused = WatchReply(v: 1, id: "cmd-9", ok: false, reason: "rejected", detail: "host refused the envelope")
    XCTAssertEqual(WatchOutcomeCopy.text(for: refused), "host refused the envelope")
  }

  func testOkRespondClearsPromptLocally() throws {
    let snapshot = try FixtureFiles.snapshot()
    let command = WatchCommand.respond(id: "cmd-1", hostId: "host-a", promptId: "chat:ses-1:item-1:1", optionId: "deny")
    let reply = WatchReply(v: 1, id: "cmd-1", ok: true)
    let next = WatchActions.apply(snapshot: snapshot, reply: reply, command: command)
    XCTAssertNil(next.prompts.first { $0.promptId == "chat:ses-1:item-1:1" })
    let session = next.sessions.first { $0.key == "host-a|chat|ses-1" }
    XCTAssertNil(session?.pendingPromptId)
    XCTAssertEqual(session?.status, .working)
    XCTAssertEqual(WatchSnapshotCache.count(next), 1)
    let stale = WatchReply(v: 1, id: "cmd-1", ok: false, reason: "stale")
    let unchanged = WatchActions.apply(snapshot: snapshot, reply: stale, command: command)
    XCTAssertEqual(unchanged.prompts.count, 1)
    XCTAssertEqual(unchanged.sessions.first { $0.key == "host-a|chat|ses-1" }?.status, .needsInput)
  }

  func testFeedKeepsTwentyNewest() {
    let older = WatchFeedItem(id: "old", hostId: "host-a", title: "Old", body: "Old", at: 10, kind: .other)
    var items = [older]
    for index in 1...20 {
      items.append(WatchFeedItem(id: "id-\(index)", hostId: "host-a", title: "T", body: "B", at: Int64(index * 100), kind: .bell))
    }
    let newest = WatchFeedList.newest(items)
    XCTAssertEqual(newest.count, 20)
    XCTAssertEqual(newest.first?.id, "id-20")
    XCTAssertFalse(newest.contains { $0.id == "old" })
  }
}
