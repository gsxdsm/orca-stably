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
import { watchSessionKey } from './watch-snapshot'

type Activity = { bots: WatchBot[]; needsYou: WatchNeed[] }

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
): Promise<{ bot: WatchBot; needsYou: WatchNeed[] }> {
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
    working ||= chat.live === 'replying'
    if (chat.live === 'needs-you' && !(chat.origin === 'home' && pairedAsks.length > 0)) {
      add(
        `chat:${JSON.stringify([bot.id, chat.chatId])}`,
        chat.title,
        chat.lastActiveAt,
        chatSessionKey(hostId, chat)
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
      const sessionKey =
        worker.paneKey && worker.host !== 'remote' && !worker.hostId
          ? watchSessionKey(hostId, 'term', worker.paneKey)
          : undefined
      add(
        `worker:${worker.dispatchId ?? worker.key}`,
        item?.title ?? worker.title,
        item?.lastActivityAt ?? worker.startedAt,
        sessionKey
      )
    }
  }
  const staleDays = botItemStaleDays(bot.itemsStale)
  for (const item of items) {
    if (!matchedItems.has(item.uid) && botItemGroupOf(item, staleDays, now) === 'needs_you') {
      add(`item:${item.uid}`, item.title, item.lastActivityAt)
    }
  }
  for (const request of access) {
    add(
      `access:${request.requestId}`,
      translate('watch.needs.connectorAccess', 'Access request from {{name}}', {
        name: accessRequestPerson(request)
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
      updatedAt: Math.trunc(Math.max(0, lastActivityAt))
    },
    needsYou
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
  const activity: Activity = { bots: [], needsYou: [] }
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
    }
  }
  return current() ? activity : null
}
