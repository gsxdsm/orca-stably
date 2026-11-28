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

private func hostName(_ id: String, snapshot: WatchSnapshot?) -> String {
  snapshot?.hosts.first { $0.hostId == id }?.name ?? id
}

private struct InboxStatus: View {
  @ObservedObject var model: WatchSessionModel

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      StatusLine(updated: model.snapshot == nil ? "Waiting for iPhone" : model.updatedLabel,
                 reachability: model.reachabilityLabel, phase: model.phase)
      if model.snapshot != nil && !model.reachable {
        Text("Last known data").font(.caption2)
      }
      Button("Refresh") { model.refresh() }
        .disabled(model.busy)
        .font(.caption)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 8)
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
      let prompts = snapshot.prompts.filter { $0.promptId == promptId }
      guard prompts.count == 1, prompts[0].hostId == row.hostId else { return nil }
    }
    return session
  }

  var body: some View {
    VStack(spacing: 0) {
      InboxStatus(model: model)
      if model.snapshot == nil {
        empty("Open Orca on iPhone")
      } else if model.snapshot?.hosts.isEmpty == true {
        empty("Connect a computer in Orca on iPhone")
      } else if rows.isEmpty {
        empty("No pending asks")
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            Text("Needs You").font(.headline)
            ForEach(rows) { row in
              if let session = session(for: row) {
                NavigationLink {
                  SessionDetailView(model: model, sessionKey: session.key)
                } label: { rowView(row) }
              } else {
                rowView(row)
              }
            }
          }.padding(.horizontal, 4)
        }
      }
    }.background(palette.background)
  }

  private func empty(_ text: String) -> some View {
    Text(text).font(.headline).multilineTextAlignment(.center)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func rowView(_ row: InboxRow) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(row.title).font(.headline).foregroundStyle(palette.foreground)
      Text([row.bot, hostName(row.hostId, snapshot: model.snapshot)].compactMap { $0 }.joined(separator: " · "))
        .font(.caption2).foregroundStyle(palette.mutedForeground)
      Text(WatchAge.relative(from: row.updatedAt, now: model.now))
        .font(.caption2).foregroundStyle(palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, alignment: .leading).padding(6)
    .background(palette.card, in: RoundedRectangle(cornerRadius: 10))
  }
}

struct BotsView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      InboxStatus(model: model)
      if let bots = model.snapshot?.bots, !bots.isEmpty {
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            Text("Bots").font(.headline)
            ForEach(bots.sorted { $0.updatedAt > $1.updatedAt }, id: \.hostIdAndBotId) { bot in
              VStack(alignment: .leading, spacing: 2) {
                Text(bot.name).font(.headline)
                Text("\(hostName(bot.hostId, snapshot: model.snapshot)) · \(bot.status)")
                  .font(.caption2).foregroundStyle(palette.mutedForeground)
                Text(WatchAge.relative(from: bot.updatedAt, now: model.now))
                  .font(.caption2).foregroundStyle(palette.mutedForeground)
              }.frame(maxWidth: .infinity, alignment: .leading).padding(6)
                .background(palette.card, in: RoundedRectangle(cornerRadius: 10))
            }
          }.padding(.horizontal, 4)
        }
      } else if model.snapshot?.bots == nil, let sessions = model.snapshot?.sessions, !sessions.isEmpty {
        ScrollView {
          VStack(alignment: .leading) {
            Text("Bots").font(.headline)
            ForEach(sessions, id: \.key) { session in
              NavigationLink { SessionDetailView(model: model, sessionKey: session.key) } label: {
                VStack(alignment: .leading) {
                  Text(session.agent)
                  Text("\(hostName(session.hostId, snapshot: model.snapshot)) · \(WatchAge.relative(from: session.updatedAt, now: model.now))")
                    .font(.caption2).foregroundStyle(palette.mutedForeground)
                }
              }
            }
          }
        }
      } else {
        Text(model.snapshot == nil ? "Open Orca on iPhone" : "No bots")
          .multilineTextAlignment(.center).frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }.background(palette.background)
  }
}

private extension WatchBot {
  var hostIdAndBotId: String { "\(hostId.count):\(hostId)\(botId)" }
}

struct UsageView: View {
  @ObservedObject var model: WatchSessionModel
  @Environment(\.orcaPalette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      InboxStatus(model: model)
      if let usage = model.snapshot?.usage, !usage.isEmpty {
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            Text("Usage").font(.headline)
            ForEach(Array(usage.enumerated()), id: \.offset) { _, item in
              VStack(alignment: .leading, spacing: 2) {
                Text("\(item.provider) · \(item.window)").font(.headline)
                Text("\(item.usedPercent, specifier: "%.0f")% used")
                Text(hostName(item.hostId, snapshot: model.snapshot)).font(.caption2)
                Text(WatchAge.relative(from: item.updatedAt, now: model.now)).font(.caption2)
              }.frame(maxWidth: .infinity, alignment: .leading).padding(6)
                .background(palette.card, in: RoundedRectangle(cornerRadius: 10))
            }
          }.padding(.horizontal, 4)
        }
      } else {
        Text(model.snapshot == nil ? "Open Orca on iPhone" : "Usage unavailable")
          .multilineTextAlignment(.center).frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }.background(palette.background)
  }
}
