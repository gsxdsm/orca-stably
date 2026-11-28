import type { WatchNeed, WatchPrompt, WatchSession } from './watch-contract'

export function buildWatchNeeds(
  activity: readonly WatchNeed[],
  sessions: readonly WatchSession[],
  prompts: readonly WatchPrompt[]
): WatchNeed[] {
  const sessionActivity = new Map<string, WatchNeed>()
  const rows = new Map<string, WatchNeed>()
  const add = (row: WatchNeed) => {
    const id = JSON.stringify([row.hostId, row.key])
    if ((rows.get(id)?.updatedAt ?? -1) < row.updatedAt) {
      rows.set(id, row)
    }
  }
  for (const row of activity) {
    if (row.sessionKey && (sessionActivity.get(row.sessionKey)?.updatedAt ?? -1) < row.updatedAt) {
      sessionActivity.set(row.sessionKey, row)
    }
  }
  const prompted = new Set(prompts.map((prompt) => prompt.sessionKey))
  for (const prompt of prompts) {
    add({
      hostId: prompt.hostId,
      key: `prompt:${prompt.promptId}`,
      title: prompt.title,
      botId: sessionActivity.get(prompt.sessionKey)?.botId,
      sessionKey: prompt.sessionKey,
      promptId: prompt.promptId,
      updatedAt: Math.trunc(prompt.createdAt)
    })
  }
  const sessionNeeds = new Set<string>()
  for (const session of sessions) {
    if (session.status === 'needs-input' && !prompted.has(session.key)) {
      sessionNeeds.add(session.key)
      add({
        hostId: session.hostId,
        key: `session:${session.key}`,
        title: sessionActivity.get(session.key)?.title ?? session.title,
        botId: sessionActivity.get(session.key)?.botId,
        sessionKey: session.key,
        updatedAt: Math.trunc(session.updatedAt)
      })
    }
  }
  for (const row of activity) {
    if (
      !row.sessionKey ||
      (!prompted.has(row.sessionKey) &&
        !sessionNeeds.has(row.sessionKey) &&
        sessionActivity.get(row.sessionKey) === row)
    ) {
      add(row)
    }
  }
  return [...rows.values()].sort(
    (a, b) => Number(!!b.promptId) - Number(!!a.promptId) || b.updatedAt - a.updatedAt
  )
}
