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
  @Published private(set) var threadReplies: [String: [WatchThreadReply]] = [:]
  @Published private(set) var agentOutcomes: [String: String] = [:]
  @Published private var confirmation: (prompt: WatchPrompt, optionId: String)?
  @Published var busy = false
  @Published private(set) var now: Date

  let screen: WatchScreen
  let screenshot: Bool

  private let cache: WatchSnapshotCache
  private let writesCache: Bool
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
    self.writesCache = !launch.screenshot && !launch.useMock
    self.send = send
    self.nextId = nextId
    let selectedKey = snapshot?.sessions.first { $0.pendingPromptId != nil }?.key
      ?? snapshot?.sessions.first?.key
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
      persist(snapshot)
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
    persist(snapshot)
  }

  private func persist(_ snapshot: WatchSnapshot) {
    guard writesCache else { return }
    for kind in cache.write(snapshot) {
      WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }
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

  func openOnPhone(session: WatchSession) {
    guard !busy, !screenshot else {
      return
    }
    perform(.openOnPhone(id: nextId(), sessionKey: session.key))
  }

  func openHostOnPhone(_ hostId: String) {
    guard !busy, !screenshot else { return }
    perform(.openHost(id: nextId(), hostId: hostId))
  }

  func controlAgent(session: WatchSession, resume: Bool) {
    guard !busy, session.canSend, resume || session.canStop == true else { return }
    agentOutcomes[session.key] = resume ? "Continuing…" : "Stopping…"
    perform(.controlAgent(id: nextId(), sessionKey: session.key, resume: resume))
  }

  func loadHistory(sessionKey: String, before: String?) async -> WatchReply {
    let command = WatchCommand.history(id: nextId(), sessionKey: sessionKey, before: before)
    return await send(command)
  }

  func reconcileReplies(sessionKey: String, with messages: [WatchThreadMessage]) {
    guard let replies = threadReplies[sessionKey] else { return }
    let unresolved = replies.filter { !$0.echoed(in: messages) }
    if unresolved.count != replies.count {
      threadReplies[sessionKey] = unresolved.isEmpty ? nil : unresolved
    }
  }

  func sendThreadDraft(session: WatchSession, knownMessages: [WatchThreadMessage]) {
    submit(session: session, text: drafts[session.key] ?? "", knownMessages: knownMessages)
  }

  func sendThreadQuickReply(session: WatchSession, text: String, knownMessages: [WatchThreadMessage]) {
    drafts[session.key] = text
    sendThreadDraft(session: session, knownMessages: knownMessages)
  }

  private func submit(
    session: WatchSession, text: String, knownMessages: [WatchThreadMessage]
  ) {
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
      threadReplies[session.key, default: []].removeAll {
        if case .failed = $0.state { return true }
        return false
      }
      threadReplies[session.key, default: []].append(WatchThreadReply(
        id: command.id, text: text, at: Date(), state: .sending,
        earlierMessageIds: Set(knownMessages.map(\.id))
      ))
      perform(command, draftToClear: text)
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
      if let index = threadReplies[key]?.firstIndex(where: { $0.id == command.id }) {
        threadReplies[key]?[index].state = reply.ok ? .sent : .failed(WatchOutcomeCopy.text(for: reply))
        threadReplies[key]?[index].messageId = reply.messageId
      }
      if reply.ok, let draftToClear, drafts[key] == draftToClear {
        drafts.removeValue(forKey: key)
      }
    } else if (command.type == "stop" || command.type == "continue"), let key = command.sessionKey {
      agentOutcomes[key] = reply.ok
        ? (command.type == "stop" ? "Stop requested" : "Continuing")
        : (reply.reason == "unknown" ? "Action unconfirmed" : WatchOutcomeCopy.text(for: reply))
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
      persist(next)
    }
  }
}
