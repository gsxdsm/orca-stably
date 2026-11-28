import SwiftUI

private struct InboxRow: Identifiable {
  var id: String
  var hostId: String
  var title: String
  var bot: String?
  var sessionKey: String?
  var promptId: String?
  var updatedAt: Int64
}

func watchHostName(_ id: String, snapshot: WatchSnapshot?) -> String {
  snapshot?.hosts.first { $0.hostId == id }?.name ?? id
}

struct WatchPageHeader: View {
  @ObservedObject var model: WatchSessionModel
  let title: String
  let symbol: String
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 3) {
        Label(title, systemImage: symbol)
          .font(.headline)
          .accessibilityAddTraits(.isHeader)
        Text(model.phase ?? model.reachabilityLabel ??
          (model.snapshot == nil ? "Waiting for iPhone" : model.updatedLabel))
          .font(.caption2)
          .foregroundStyle(palette.mutedForeground)
      }
      Spacer(minLength: 0)
      Button { model.refresh() } label: {
        Image(systemName: "arrow.clockwise")
          .font(.footnote.weight(.semibold))
          .frame(width: 34, height: 34)
          .background(.thinMaterial, in: Circle())
          .padding(5)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Refresh")
      .disabled(model.busy)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 4)
    .padding(.bottom, 3)
  }
}

struct WatchEmptyState: View {
  let title: String
  let symbol: String
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    ScrollView {
      VStack(spacing: 7) {
        Image(systemName: symbol)
          .font(.title2)
          .foregroundStyle(palette.mutedForeground)
          .accessibilityHidden(true)
        Text(title).font(.footnote.weight(.medium)).multilineTextAlignment(.center)
      }
      .padding(10)
      .frame(maxWidth: .infinity)
    }
  }
}

struct WatchRow<Content: View>: View {
  let symbol: String
  let tint: Color
  var navigates = false
  @ViewBuilder var content: Content
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    HStack(alignment: .center, spacing: 7) {
      Image(systemName: symbol)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(tint)
        .frame(width: 22)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 3) { content }
        .frame(maxWidth: .infinity, alignment: .leading)
      if navigates {
        Image(systemName: "chevron.right")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(palette.mutedForeground)
          .accessibilityHidden(true)
      }
    }
    .padding(8)
    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 13))
    .accessibilityElement(children: .combine)
  }
}

struct NeedsYouView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  private var rows: [InboxRow] {
    guard let snapshot = model.snapshot else { return [] }
    if let needs = snapshot.needsYou {
      return needs.map { need in
        InboxRow(id: "\(need.hostId.count):\(need.hostId)\(need.key)", hostId: need.hostId, title: need.title,
                 bot: need.botId.flatMap { id in snapshot.bots?.first { $0.hostId == need.hostId && $0.botId == id }?.name ?? id },
                 sessionKey: need.sessionKey, promptId: need.promptId, updatedAt: need.updatedAt)
      }.sorted { $0.updatedAt > $1.updatedAt }
    }
    let sessions = snapshot.sessions.filter { $0.status == .needsInput || $0.pendingPromptId != nil }.map { session in
      let prompt = snapshot.prompts.first { $0.hostId == session.hostId && $0.promptId == session.pendingPromptId }
      return InboxRow(id: "\(session.hostId.count):\(session.hostId)\(session.key)", hostId: session.hostId,
                      title: prompt?.title ?? session.title, bot: session.agent, sessionKey: session.key,
                      promptId: prompt?.promptId, updatedAt: session.updatedAt)
    }
    let unmatched = snapshot.prompts.filter { prompt in
      !snapshot.sessions.contains { $0.hostId == prompt.hostId && $0.pendingPromptId == prompt.promptId }
    }.map { prompt in
      InboxRow(id: "prompt:\(prompt.hostId.count):\(prompt.hostId)\(prompt.promptId)", hostId: prompt.hostId,
               title: prompt.title, bot: nil, sessionKey: prompt.sessionKey, promptId: prompt.promptId,
               updatedAt: prompt.createdAt)
    }
    return (sessions + unmatched).sorted { $0.updatedAt > $1.updatedAt }
  }

  private func session(for row: InboxRow) -> WatchSession? {
    guard let snapshot = model.snapshot else { return nil }
    let prompt = row.promptId.flatMap { id in
      snapshot.prompts.first { $0.hostId == row.hostId && $0.promptId == id }
    }
    guard let key = row.sessionKey ?? prompt?.sessionKey else { return nil }
    let matches = snapshot.sessions.filter { $0.key == key }
    guard matches.count == 1, let session = matches.first, session.hostId == row.hostId,
          row.promptId == nil || session.pendingPromptId == row.promptId else { return nil }
    if let promptId = session.pendingPromptId {
      let prompts = snapshot.prompts.filter {
        $0.hostId == row.hostId && $0.sessionKey == key && $0.promptId == promptId
      }
      guard prompts.count == 1 else { return nil }
    }
    return session
  }

  var body: some View {
    VStack(spacing: 0) {
      WatchPageHeader(model: model, title: "Needs You", symbol: "tray")
      if model.snapshot == nil {
        WatchEmptyState(title: "Open Orca on iPhone", symbol: "iphone")
      } else if model.snapshot?.hosts.isEmpty == true {
        WatchEmptyState(title: "Connect a computer in Orca on iPhone", symbol: "desktopcomputer")
      } else if rows.isEmpty {
        WatchEmptyState(title: "You’re all caught up", symbol: "checkmark.circle")
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 6) {
            ForEach(rows) { row in
              if let session = session(for: row) {
                NavigationLink {
                  SessionDetailView(model: model, sessionKey: session.key)
                } label: { rowView(row, navigates: true) }
                .buttonStyle(.plain)
              } else {
                NavigationLink {
                  WatchNoticeView(model: model, hostId: row.hostId, title: row.title)
                } label: {
                  rowView(row, navigates: true)
                }
                .buttonStyle(.plain)
              }
            }
          }.padding(.horizontal, 4)
        }
      }
    }.background(palette.background)
  }

  private func rowView(_ row: InboxRow, navigates: Bool) -> some View {
    WatchRow(symbol: row.promptId == nil ? "bubble.left" : "exclamationmark.circle.fill",
             tint: palette.warning, navigates: navigates) {
      Text(row.title).font(.footnote.weight(.semibold)).foregroundStyle(palette.foreground).lineLimit(2)
      Text([row.bot, watchHostName(row.hostId, snapshot: model.snapshot)].compactMap { $0 }.joined(separator: " · "))
        .font(.caption2).foregroundStyle(palette.mutedForeground).lineLimit(1)
      Text(WatchAge.relative(from: row.updatedAt, now: model.now))
        .font(.caption2).foregroundStyle(palette.mutedForeground)
    }
    .privacySensitive()
  }
}

struct WatchNoticeView: View {
  @ObservedObject var model: WatchSessionModel
  var hostId: String
  var title: String
  var detail: String? = nil

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text(title).font(.headline)
        if let detail, !detail.isEmpty { Text(detail).font(.footnote) }
        Button { model.openHostOnPhone(hostId) } label: {
          Label("Open on iPhone", systemImage: "iphone")
        }
        .disabled(model.busy)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 4)
      .privacySensitive()
    }
  }
}

struct BotsView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      WatchPageHeader(model: model, title: "Bots", symbol: "sparkles")
      if let bots = model.snapshot?.bots, !bots.isEmpty {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 6) {
            ForEach(bots.sorted { $0.updatedAt > $1.updatedAt }, id: \.hostIdAndBotId) { bot in
              NavigationLink {
                botThreads(bot)
              } label: {
                WatchRow(symbol: "sparkle", tint: bot.status == "needs-you" ? palette.warning : palette.primary,
                         navigates: true) {
                  Text(bot.name).font(.footnote.weight(.semibold)).lineLimit(1)
                  Text("\(botStatus(bot.status)) · \(watchHostName(bot.hostId, snapshot: model.snapshot))")
                    .font(.caption2).foregroundStyle(palette.mutedForeground).lineLimit(1)
                  Text(WatchAge.relative(from: bot.updatedAt, now: model.now))
                    .font(.caption2).foregroundStyle(palette.mutedForeground)
                }
              }
              .buttonStyle(.plain)
            }
          }.padding(.horizontal, 4)
        }
      } else if model.snapshot?.bots == nil, let sessions = model.snapshot?.sessions, !sessions.isEmpty {
        ScrollView {
          VStack(alignment: .leading) {
            ForEach(sessions, id: \.key) { session in
              NavigationLink { SessionDetailView(model: model, sessionKey: session.key) } label: {
                VStack(alignment: .leading) {
                  Text(session.agent)
                  Text("\(watchHostName(session.hostId, snapshot: model.snapshot)) · \(WatchAge.relative(from: session.updatedAt, now: model.now))")
                    .font(.caption2).foregroundStyle(palette.mutedForeground)
                }
              }
            }
          }
        }
      } else {
        WatchEmptyState(title: model.snapshot == nil ? "Open Orca on iPhone" : "No bots", symbol: "sparkles")
      }
    }.background(palette.background)
  }

  private func botStatus(_ status: String) -> String {
    switch status {
    case "needs-you": "Needs you"
    case "working": "Working"
    case "paused": "Paused"
    default: "Idle"
    }
  }

  @ViewBuilder private func botThreads(_ bot: WatchBot) -> some View {
    let current = model.snapshot?.bots?.first { $0.hostIdAndBotId == bot.hostIdAndBotId } ?? bot
    let keys = current.threadKeys ?? model.snapshot?.needsYou?.compactMap {
      $0.hostId == bot.hostId && $0.botId == bot.botId ? $0.sessionKey : nil
    } ?? []
    let sessions = keys.compactMap { model.session($0) }
    if sessions.isEmpty {
      WatchEmptyState(title: "No recent threads", symbol: "bubble.left.and.bubble.right")
        .navigationTitle(bot.name)
    } else {
      ScrollView {
        LazyVStack(spacing: 6) {
          ForEach(sessions, id: \.key) { session in
            NavigationLink {
              SessionDetailView(model: model, sessionKey: session.key)
            } label: {
              WatchRow(symbol: "bubble.left", tint: palette.status(session.status), navigates: true) {
                Text(session.title).font(.footnote.weight(.semibold)).lineLimit(2)
                Text(WatchSections.title(session.status)).font(.caption2).foregroundStyle(palette.mutedForeground)
              }
            }.buttonStyle(.plain)
          }
        }.padding(.horizontal, 4)
      }.navigationTitle(bot.name)
    }
  }
}

private extension WatchBot {
  var hostIdAndBotId: String { "\(hostId.count):\(hostId)\(botId)" }
}
