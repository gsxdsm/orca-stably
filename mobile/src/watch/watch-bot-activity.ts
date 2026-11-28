import { botHasConnector } from '../../../src/shared/bot-types'
import { accessRequestPerson } from '../../../src/shared/bots/bot-access-request'
import type { BotChatTreeChat } from '../../../src/shared/bots/bot-chat-tree'
import {
  botItemGroupOf,
  botItemStaleDays,
  botItemsByDispatch
} from '../../../src/shared/bots/bot-item-groups'
import type { ConnectorAccessRequest } from '../../../src/shared/connector-bot-access-contract'
import type { PairedServerAskCard } from '../../../src/shared/rpc-contract/paired-server-asks-params'
import { readHostAccessRequests } from '../bots/bot-access-request-operations'
import { hostBotsKey, readHostBots } from '../bots/host-bots-read'
import type { PhoneBot } from '../bots/host-bots-operations'
import { readBotItems } from '../bots/items/bot-item-operations'
import { botChatTreeRead } from '../bots/use-phone-bot-chat-tree'
import { readHostMethodReply } from '../host-screen/sidebar-feed/host-sidebar-feed-operations'
import { translate } from '../i18n/mobile-i18n'
import {
  pairedServerAskerName,
  readMobilePairedServerAsks
} from '../session/native-chat/input/prompts/use-mobile-paired-server-asks'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { WatchBot, WatchNeed } from './watch-contract'
import { watchSessionKey, type WatchSnapshotChat, type WatchSnapshotItem } from './watch-snapshot'

type Activity = {
  bots: WatchBot[]
  needsYou: WatchNeed[]
  chats: WatchSnapshotChat[]
  items: WatchSnapshotItem[]
}

function chatSessionKey(hostId: string, chat: BotChatTreeChat): string | undefined {
  if (!chat.run) {
    return watchSessionKey(hostId, 'chat', chat.liveSessionId ?? chat.chatId)
  }
  return chat.run.paneKey ? watchSessionKey(hostId, 'term', chat.run.paneKey) : undefined
}

async function readBotActivity(
  client: RpcClient,
  hostId: string,
  bot: PhoneBot,
  access: readonly ConnectorAccessRequest[],
  pairedAsks: readonly PairedServerAskCard[],
  connectorSignIn: boolean,
  now: number
): Promise<{
  bot: WatchBot
  needsYou: WatchNeed[]
  chats: WatchSnapshotChat[]
  items: WatchSnapshotItem[]
}> {
  const [tree, read] = await Promise.all([
    botChatTreeRead.request(client, { botId: bot.id }).then(
      (reply) => readHostMethodReply(reply, botChatTreeRead.interpret),
      () => null
    ),
    readBotItems(client, bot.id)
  ])
  const chats = tree?.kind === 'answered' ? tree.value.chats : []
  const items = read.kind === 'read' ? read.value.items : []
  const byDispatch = botItemsByDispatch(items)
  const matchedItems = new Set<string>()
  const needsYou: WatchNeed[] = []
  const threadKeys: string[] = []
  const watchChats: WatchSnapshotChat[] = []
  const watchItems: WatchSnapshotItem[] = []
  const add = (key: string, title: string, updatedAt: number, sessionKey?: string) =>
    needsYou.push({
      hostId,
      botId: bot.id,
      key,
      title,
      updatedAt: Math.trunc(Math.max(0, updatedAt)),
      ...(sessionKey ? { sessionKey } : {})
    })
  let working = false
  let lastActivityAt = bot.updatedAt ?? bot.createdAt ?? 0
  for (const chat of chats) {
    lastActivityAt = Math.max(lastActivityAt, chat.lastActiveAt)
    if (chat.closed) {
      continue
    }
    const sessionKey = chatSessionKey(hostId, chat)
    if (sessionKey && threadKeys.length < 8) {
      threadKeys.push(sessionKey)
      if (!chat.run) {
        watchChats.push({
          hostId,
          sessionId: chat.liveSessionId ?? chat.chatId,
          workspaceId: bot.folderWorkspaceId,
          workspaceName: bot.name,
          agent: bot.agent,
          conversationName: chat.title,
          lastAssistantMessage: chat.preview,
          projectedStatus:
            chat.live === 'replying' ? 'working' : chat.live === 'needs-you' ? 'attention' : 'idle',
          updatedAt: chat.lastActiveAt
        })
      }
    }
    working ||= chat.live === 'replying'
    if (chat.live === 'needs-you' && !(chat.origin === 'home' && pairedAsks.length > 0)) {
      add(
        `chat:${JSON.stringify([bot.id, chat.chatId])}`,
        chat.title,
        chat.lastActiveAt,
        sessionKey
      )
    }
    for (const worker of chat.running) {
      working ||= worker.state === 'running'
      if (worker.state !== 'needs-you') {
        continue
      }
      const item = worker.dispatchId ? byDispatch.get(worker.dispatchId) : undefined
      if (item) {
        matchedItems.add(item.uid)
      }
      // A server's pane key names a terminal on that server, never on the host that listed it.
      const workerKey =
        worker.paneKey && worker.host !== 'remote' && !worker.hostId
          ? watchSessionKey(hostId, 'term', worker.paneKey)
          : item
            ? watchSessionKey(hostId, 'item', item.uid)
            : undefined
      add(
        `worker:${worker.dispatchId ?? worker.key}`,
        item?.title ?? worker.title,
        item?.lastActivityAt ?? worker.startedAt,
        workerKey
      )
    }
  }
  const staleDays = botItemStaleDays(bot.itemsStale)
  const orderedItems = items
    .map((item) => ({
      item,
      needs: botItemGroupOf(item, staleDays, now) === 'needs_you'
    }))
    .sort(
      (a, b) => Number(b.needs) - Number(a.needs) || b.item.lastActivityAt - a.item.lastActivityAt
    )
  for (const { item, needs } of orderedItems.slice(0, 12)) {
    const key = watchSessionKey(hostId, 'item', item.uid)
    if (needs && !matchedItems.has(item.uid)) {
      add(`item:${item.uid}`, item.title, item.lastActivityAt, key)
    }
    watchItems.push({
      key,
      hostId,
      title: item.title,
      workspace: bot.name,
      workspaceId: bot.folderWorkspaceId,
      agent: bot.name,
      status: needs ? 'needs-input' : 'idle',
      updatedAt: item.lastActivityAt,
      canSend: true
    })
    if (threadKeys.length < 12) {
      threadKeys.push(key)
    }
  }
  for (const request of access) {
    add(
      `access:${request.requestId}`,
      translate('bots.needs.access', '{{person}} asked for access', {
        person: accessRequestPerson(request)
      }),
      request.createdAt
    )
  }
  for (const card of pairedAsks) {
    add(
      `paired-ask:${card.messageId}`,
      card.subject.trim() || pairedServerAskerName(card),
      Date.parse(card.createdAt) || 0
    )
  }
  if (connectorSignIn && botHasConnector(bot)) {
    add(
      `connector:${bot.id}`,
      translate('bots.needs.connectorFix', 'Sign in or fix it'),
      bot.updatedAt ?? bot.createdAt ?? 0
    )
  }
  return {
    bot: {
      hostId,
      botId: bot.id,
      name: bot.name.trim() || bot.folder || bot.id,
      status:
        needsYou.length > 0 ? 'needs-you' : bot.paused ? 'paused' : working ? 'working' : 'idle',
      updatedAt: Math.trunc(Math.max(0, lastActivityAt)),
      threadKeys: [...new Set(threadKeys)]
    },
    needsYou,
    chats: watchChats,
    items: watchItems
  }
}

export async function readWatchBotActivity(
  client: RpcClient,
  hostId: string,
  now: number,
  current: () => boolean
): Promise<Activity | null> {
  const listing = await readHostBots(client, hostBotsKey(hostId))
  if (!current() || listing.kind === 'unreadable') {
    return null
  }
  const activity: Activity = { bots: [], needsYou: [], chats: [], items: [] }
  if (listing.kind !== 'bots' || listing.bots.length === 0) {
    return activity
  }
  const [access, pairedAsks] = await Promise.all([
    readHostAccessRequests(client),
    readMobilePairedServerAsks(client, null).catch(() => [])
  ])
  // Keep a single host's burst bounded regardless of how many bots it has.
  for (let index = 0; index < listing.bots.length && current(); index += 4) {
    const batch = await Promise.all(
      listing.bots.slice(index, index + 4).map((bot) =>
        readBotActivity(
          client,
          hostId,
          bot,
          access?.filter((request) => request.botId === bot.id) ?? [],
          pairedAsks.filter((card) => card.botId === bot.id),
          listing.connectorStatus === 'needs-sign-in',
          now
        )
      )
    )
    for (const row of batch) {
      activity.bots.push(row.bot)
      activity.needsYou.push(...row.needsYou)
      activity.chats.push(...row.chats)
      activity.items.push(...row.items)
    }
  }
  return current() ? activity : null
}
