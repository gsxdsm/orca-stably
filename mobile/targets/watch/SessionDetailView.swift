import SwiftUI

struct SessionDetailView: View {
  @ObservedObject var model: WatchSessionModel
  var sessionKey: String?
  @Environment(\.orcaPalette) private var palette
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.isLuminanceReduced) private var dimmed
  @State private var thread = WatchThread()
  @State private var historyError = false
  @State private var reading = false
  @State private var bottomVisible = true
  @State private var showingReply = false
  @State private var confirmingStop = false
  @State private var scrollToLatest = 0
  @State private var newestSeen = false
  @State private var resumeBefore: String?
  @State private var preserveAnchor: String?

  private var replies: [WatchThreadReply] {
    sessionKey.flatMap { model.threadReplies[$0] } ?? []
  }

  var body: some View {
    if let session = model.session(sessionKey) {
      transcript(session)
        .safeAreaInset(edge: .bottom, spacing: 0) {
          VStack(spacing: 2) {
            if session.status == .working || session.status == .needsInput {
              Label(WatchSections.title(session.status), systemImage: statusIcon(session.status))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(palette.status(session.status))
            }
            if session.canSend {
              HStack(spacing: 4) {
                Button { showingReply = true } label: {
                  Label("Reply", systemImage: "arrowshape.turn.up.left")
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(OrcaWideButtonStyle(fill: palette.primary, ink: palette.primaryForeground))
                if session.canStop == true {
                  Button(role: .destructive) { confirmingStop = true } label: {
                    Image(systemName: "stop.fill")
                  }.accessibilityLabel("Stop agent")
                }
              }
              .disabled(model.busy)
            }
          }
          .padding(.horizontal, 4)
          .padding(.top, 3)
          .background(.thinMaterial)
        }
        .sheet(isPresented: $model.showingPrompt) {
          PromptSheet(model: model, sessionKey: session.key)
        }
        .sheet(isPresented: $showingReply) {
          ReplyView(model: model, sessionKey: session.key, knownMessages: thread.messages)
        }
        .alert("Stop the agent?", isPresented: $confirmingStop) {
          Button("Stop", role: .destructive) { model.controlAgent(session: session, resume: false) }
          Button("Cancel", role: .cancel) {}
        }
        .toolbar {
          Button { model.openOnPhone(session: session) } label: {
            Image(systemName: "iphone")
          }
          .accessibilityLabel("Open on iPhone")
          .disabled(model.busy)
        }
        .task(id: scenePhase == .background || dimmed) {
          guard scenePhase != .background else { return }
          await load()
          guard !dimmed else { return }
          while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { await load() }
          }
        }
        .onChange(of: replies) { _, next in
          if next.last?.state == .sending { scrollToLatest += 1 }
        }
    } else {
      Text(WatchDetailCopy.missingSession(model.replyOutcome(for: sessionKey)))
        .font(.headline)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func transcript(_ session: WatchSession) -> some View {
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 8) {
          VStack(alignment: .leading, spacing: 4) {
            Label(WatchSections.title(session.status), systemImage: statusIcon(session.status))
              .font(.caption.weight(.semibold))
              .foregroundStyle(palette.status(session.status))
            Text(session.title)
              .font(.headline)
              .lineLimit(2)
            Text(session.agent)
              .font(.caption)
              .foregroundStyle(palette.mutedForeground)
              .lineLimit(1)
          }
          .accessibilityElement(children: .combine)
          .padding(.top, 12)
          if let before = thread.before {
            Button("Older messages") { Task { await load(before: before) } }
              .font(.caption)
              .disabled(reading)
              .onAppear {
                if newestSeen && resumeBefore != before {
                  Task { await load(before: before) }
                }
              }
          }
          if thread.messages.isEmpty && thread.before == nil {
            if !thread.loaded && !historyError {
              ProgressView().accessibilityLabel("Loading messages")
            } else if let latest = session.latest {
              Text(latest)
                .font(.footnote)
                .foregroundStyle(palette.mutedForeground)
                .lineLimit(4)
            } else if !historyError {
              Text("No messages yet").font(.footnote).foregroundStyle(palette.mutedForeground)
            }
          }
          if historyError || resumeBefore != nil {
            Button("Retry history") { Task { await load(before: resumeBefore) } }.font(.caption)
          }
          ForEach(thread.messages) { message in
            ThreadBubble(
              text: message.text, agent: session.agent, user: message.role == .user,
              date: message.at.map { Date(timeIntervalSince1970: Double($0) / 1000) },
              shortened: message.shortened == true
            )
            .id(message.id)
          }
          ForEach(replies) { reply in
            ThreadBubble(
              text: reply.text, agent: session.agent, user: true, date: reply.at,
              delivery: reply.state
            )
          }
          if let prompt = model.prompt(for: session) {
            promptCard(prompt)
          }
          if thread.canContinue && session.canSend && session.status != .working && model.prompt(for: session) == nil {
            Button { model.controlAgent(session: session, resume: true) } label: {
              Label("Continue agent", systemImage: "play.fill")
            }
            .disabled(model.busy || model.agentOutcomes[session.key] == "Continuing")
          }
          if let outcome = model.agentOutcomes[session.key] {
            Text(outcome).font(.caption2).foregroundStyle(palette.mutedForeground)
          }
          if !model.reachable {
            Label("iPhone not reachable", systemImage: "iphone.slash")
              .font(.caption2)
              .foregroundStyle(palette.mutedForeground)
          }
          Color.clear.frame(height: 1).id("latest")
            .onAppear { bottomVisible = true }
            .onDisappear { bottomVisible = false }
        }
        .padding(.horizontal, 4)
      }
      .defaultScrollAnchor(.bottom)
      .onChange(of: scrollToLatest) {
        reader.scrollTo("latest", anchor: .bottom)
        newestSeen = true
      }
      .onChange(of: preserveAnchor) { _, anchor in
        if let anchor { reader.scrollTo(anchor, anchor: .top) }
      }
    }
  }

  private func load(before: String? = nil) async {
    guard let sessionKey, !reading else { return }
    let wasAtBottom = bottomVisible
    reading = true
    defer { reading = false }
    let reply = await model.loadHistory(sessionKey: sessionKey, before: before)
    guard !Task.isCancelled else { return }
    guard reply.ok, let page = reply.history else {
      if let before { resumeBefore = before } else { historyError = true }
      return
    }
    if before == nil { historyError = false } else { resumeBefore = nil }
    let previous = thread
    thread.apply(page, older: before != nil)
    model.reconcileReplies(sessionKey: sessionKey, with: thread.messages)
    if page.reset == true || previous.generation != thread.generation || !previous.loaded ||
        (before == nil && previous.messages != thread.messages && wasAtBottom) {
      scrollToLatest += 1
    } else if before != nil && previous.messages.first?.id != thread.messages.first?.id {
      preserveAnchor = previous.messages.first?.id
    }
  }

  private func statusIcon(_ status: WatchSessionStatus) -> String {
    switch status {
    case .needsInput: "exclamationmark.circle.fill"
    case .working: "waveform"
    case .done: "checkmark.circle"
    case .idle: "bubble.left"
    }
  }

  private func promptCard(_ prompt: WatchPrompt) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Label(prompt.title, systemImage: "exclamationmark.circle")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(palette.warning)
      if prompt.kind == "permission" {
        ForEach(prompt.options.filter { $0.role == .approve || $0.role == .deny }, id: \.optionId) { option in
          Button(option.role == .approve ? "Allow once" : option.label) {
            model.choose(prompt: prompt, option: option)
          }
          .disabled(model.busy)
        }
      }
      Button("All options") { model.showingPrompt = true }
        .disabled(model.busy)
    }
    .font(.caption)
    .padding(8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 12))
  }
}
