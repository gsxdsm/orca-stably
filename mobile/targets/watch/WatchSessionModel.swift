import SwiftUI
import WidgetKit

@MainActor
final class WatchSessionModel: ObservableObject {
  @Published var snapshot: WatchSnapshot?
  @Published var reachable: Bool
  @Published var phase: String?
  @Published var outcome: String?
  @Published var selectedKey: String?
  @Published var showingPrompt = false
  @Published private var drafts: [String: String] = [:]
  @Published private var replyOutcomes: [String: String] = [:]
  @Published private var confirmation: (prompt: WatchPrompt, optionId: String)?
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
    let selectedKey = snapshot?.sessions.first { $0.pendingPromptId != nil }?.key
    self.selectedKey = selectedKey
    if launch.screen == .confirm,
       let prompt = snapshot?.prompts.first(where: { $0.sessionKey == selectedKey }),
       let option = prompt.options.first(where: { $0.role == .approveAlways }) {
      self.confirmation = (prompt, option.optionId)
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
    let cache = WatchSnapshotCache(defaults: WatchAppGroup.defaults())
    #if DEBUG
    let releaseBuild = false
    #else
    let releaseBuild = true
    #endif
    if watchUsesPhoneTransport(launch, release: releaseBuild) {
      let phone = PhoneWatchTransport()
      let model = WatchSessionModel(
        launch: launch,
        snapshot: cache.read(),
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
      snapshot: WatchFixtureLoader.snapshot(),
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
    return snapshot?.prompts.first {
      $0.hostId == session.hostId && $0.sessionKey == session.key && $0.promptId == promptId
    }
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
    perform(.refresh(id: nextId()))
  }

  func choose(prompt: WatchPrompt, option: WatchPromptOption) {
    guard !busy, session(prompt.sessionKey).flatMap({ self.prompt(for: $0) }) == prompt else {
      return
    }
    switch WatchActions.respond(prompt: prompt, option: option, nextId: nextId()) {
    case .needsConfirm(let optionId):
      confirmation = (prompt, optionId)
      showingPrompt = true
    case .rejected(let reason):
      outcome = reason
    case .send(let command):
      perform(command)
    }
  }

  func confirmAlways(prompt: WatchPrompt) {
    guard let confirmation, isConfirming(prompt), !busy,
          session(prompt.sessionKey).flatMap({ self.prompt(for: $0) }) == prompt else {
      return
    }
    perform(WatchActions.confirm(prompt: prompt, optionId: confirmation.optionId, nextId: nextId()))
  }

  func isConfirming(_ prompt: WatchPrompt) -> Bool {
    confirmation?.prompt == prompt
  }

  func confirmationTitle(for prompt: WatchPrompt) -> String {
    prompt.options.first { $0.optionId == confirmation?.optionId }?.label ?? "Confirm"
  }

  func cancelConfirm() {
    confirmation = nil
  }

  func draft(for sessionKey: String) -> Binding<String> {
    Binding(get: { self.drafts[sessionKey] ?? "" }, set: { self.drafts[sessionKey] = $0 })
  }

  func replyOutcome(for sessionKey: String?) -> String? {
    if screenshot {
      return outcome
    }
    return sessionKey.flatMap { replyOutcomes[$0] }
  }

  func sendDraft(session: WatchSession) {
    let text = drafts[session.key] ?? ""
    submit(session: session, text: text, clearsDraft: true)
  }

  func quickReply(session: WatchSession, text: String) {
    guard !busy else { return }
    if drafts[session.key, default: ""].isEmpty {
      drafts[session.key] = text
    }
    submit(session: session, text: text, clearsDraft: drafts[session.key] == text)
  }

  func openOnPhone(session: WatchSession) {
    guard !busy, !screenshot else {
      return
    }
    perform(.openOnPhone(id: nextId(), sessionKey: session.key))
  }

  func dictate(_ text: String, session: WatchSession) {
    drafts[session.key] = text
    sendDraft(session: session)
  }

  private func submit(session: WatchSession, text: String, clearsDraft: Bool) {
    guard !busy else {
      return
    }
    guard let current = self.session(session.key) else {
      replyOutcomes[session.key] = "Session ended"
      return
    }
    switch WatchActions.sendText(session: current, text: text, nextId: nextId()) {
    case .rejected(let reason):
      replyOutcomes[session.key] = reason
    case .send(let command):
      perform(command, draftToClear: clearsDraft ? text : nil)
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

  private func perform(_ command: WatchCommand, draftToClear: String? = nil) {
    busy = true
    Task {
      let reply = await client.perform(command)
      finish(command, reply: reply, draftToClear: draftToClear)
    }
  }

  private func finish(_ command: WatchCommand, reply: WatchReply, draftToClear: String?) {
    busy = false
    if command.type == "send", let key = command.sessionKey {
      replyOutcomes[key] = WatchOutcomeCopy.text(for: reply)
      if reply.ok, let draftToClear, drafts[key] == draftToClear {
        drafts.removeValue(forKey: key)
      }
    } else if command.type == "respond" || !reply.ok {
      outcome = WatchOutcomeCopy.text(for: reply)
    }
    if command.type == "respond" {
      confirmation = nil
      if reply.ok {
        showingPrompt = false
      }
    }
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
  }
}
