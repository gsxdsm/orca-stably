import SwiftUI
import WidgetKit

@MainActor
final class WatchSessionModel: ObservableObject {
  @Published var snapshot: WatchSnapshot?
  @Published var reachable: Bool
  @Published var phase: String?
  @Published var outcome: String?
  @Published var selectedKey: String?
  @Published var confirmOptionId: String?
  @Published var showingPrompt = false
  @Published var draft = ""
  @Published var busy = false
  @Published private(set) var now: Date

  let screen: WatchScreen
  let screenshot: Bool

  private let cache: WatchSnapshotCache
  private let send: (WatchCommand) async -> WatchReply
  private let nextId: () -> String
  private var phone: PhoneWatchTransport?

  init(
    launch: WatchLaunch,
    snapshot: WatchSnapshot?,
    cache: WatchSnapshotCache,
    send: @escaping (WatchCommand) async -> WatchReply,
    nextId: @escaping () -> String
  ) {
    self.screen = launch.screen
    self.screenshot = launch.screenshot
    self.snapshot = snapshot
    self.reachable = launch.reachable
    self.phase = launch.phase
    self.outcome = launch.outcome
    self.cache = cache
    self.send = send
    self.nextId = nextId
    self.selectedKey = snapshot?.sessions.first { $0.pendingPromptId != nil }?.key
    if launch.screen == .confirm {
      self.confirmOptionId = "always"
    }
    if launch.screenshot, let generatedAt = snapshot?.generatedAt {
      self.now = Date(timeIntervalSince1970: Double(generatedAt + 180_000) / 1000)
    } else {
      self.now = Date()
    }
    if let snapshot {
      cache.write(snapshot)
      WidgetCenter.shared.reloadTimelines(ofKind: "OrcaNeedsInput")
    }
  }

  static func make() -> WatchSessionModel {
    let launch = WatchLaunch.parse()
    let loaded = WatchFixtureLoader.snapshot()
    let cache = WatchSnapshotCache(defaults: WatchAppGroup.defaults())
    if launch.usePhone {
      let phone = PhoneWatchTransport()
      let model = WatchSessionModel(
        launch: launch,
        snapshot: loaded,
        cache: cache,
        send: { command in await phone.send(command) },
        nextId: { UUID().uuidString }
      )
      model.attach(phone)
      return model
    }
    let transport = MockWatchTransport()
    return WatchSessionModel(
      launch: launch,
      snapshot: loaded,
      cache: cache,
      send: { command in await transport.send(command) },
      nextId: { UUID().uuidString }
    )
  }

  func attach(_ phone: PhoneWatchTransport) {
    self.phone = phone
    phone.onSnapshot = { [weak self] snapshot in
      self?.replace(snapshot)
    }
    phone.onReachable = { [weak self] reachable in
      self?.reachable = reachable
    }
    phone.activate()
    if !screenshot {
      refresh()
    }
  }

  func session(_ key: String?) -> WatchSession? {
    snapshot?.sessions.first { $0.key == key }
  }

  func prompt(for session: WatchSession) -> WatchPrompt? {
    guard let promptId = session.pendingPromptId else {
      return nil
    }
    return snapshot?.prompts.first { $0.promptId == promptId }
  }

  var groups: [(title: String, sessions: [WatchSession])] {
    WatchSections.grouped(snapshot?.sessions ?? [])
  }

  var feed: [WatchFeedItem] {
    WatchFeedList.newest(snapshot?.feed ?? [])
  }

  var updatedLabel: String {
    guard let generatedAt = snapshot?.generatedAt else {
      return "Updated just now"
    }
    return WatchAge.updatedLabel(generatedAt: generatedAt, now: now)
  }

  var reachabilityLabel: String? {
    WatchReachabilityCopy.label(reachable: reachable)
  }

  func needsInputCount() -> Int {
    snapshot.map(WatchSnapshotCache.count) ?? 0
  }

  func replace(_ snapshot: WatchSnapshot) {
    self.snapshot = snapshot
    if !screenshot {
      now = Date()
    }
    cache.write(snapshot)
    WidgetCenter.shared.reloadTimelines(ofKind: "OrcaNeedsInput")
  }

  func refresh() {
    guard !busy, !screenshot else {
      return
    }
    Task { await perform(.refresh(id: nextId())) }
  }

  func choose(prompt: WatchPrompt, option: WatchPromptOption) {
    guard !busy else {
      return
    }
    switch WatchActions.respond(prompt: prompt, option: option, nextId: nextId()) {
    case .needsConfirm(let optionId):
      confirmOptionId = optionId
      showingPrompt = true
    case .rejected(let reason):
      outcome = reason
    case .send(let command):
      Task { await perform(command) }
    }
  }

  func confirmAlways(prompt: WatchPrompt) {
    guard let optionId = confirmOptionId, !busy else {
      return
    }
    let command = WatchActions.confirm(prompt: prompt, optionId: optionId, nextId: nextId())
    Task { await perform(command) }
  }

  func cancelConfirm() {
    confirmOptionId = nil
  }

  func sendDraft(session: WatchSession) {
    submit(session: session, text: draft)
  }

  func quickReply(session: WatchSession, text: String) {
    submit(session: session, text: text)
  }

  func openOnPhone(session: WatchSession) {
    guard !busy, !screenshot else {
      return
    }
    Task { await perform(.openOnPhone(id: nextId(), sessionKey: session.key)) }
  }

  func dictate(_ text: String) {
    draft = text
  }

  private func submit(session: WatchSession, text: String) {
    guard !busy else {
      return
    }
    switch WatchActions.sendText(session: session, text: text, nextId: nextId()) {
    case .rejected(let reason):
      outcome = reason
    case .send(let command):
      Task { await perform(command) }
    case .needsConfirm:
      break
    }
  }

  private var client: WatchCommandClient {
    WatchCommandClient(
      send: send,
      onPhase: { [weak self] phase in
        self?.phase = phase
      }
    )
  }

  private func perform(_ command: WatchCommand) async {
    busy = true
    let reply = await client.perform(command)
    busy = false
    outcome = WatchOutcomeCopy.text(for: reply)
    guard reply.ok else {
      return
    }
    if let replacement = reply.snapshot {
      replace(replacement)
    } else if let current = snapshot {
      let next = WatchActions.apply(snapshot: current, reply: reply, command: command)
      snapshot = next
      cache.write(next)
      WidgetCenter.shared.reloadTimelines(ofKind: "OrcaNeedsInput")
    }
    if command.type == "send" {
      draft = ""
    }
    if command.type == "respond" {
      confirmOptionId = nil
      showingPrompt = false
    }
  }
}
