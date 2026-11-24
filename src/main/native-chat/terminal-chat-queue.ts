import { randomUUID } from 'node:crypto'
import type {
  NativeChatTerminalActivity,
  NativeChatTerminalQueueSnapshot
} from '../../shared/native-chat/native-chat-terminal-queue'
import type { AgentSessionQueuedMessage } from '../../shared/agent-session/requests/agent-session-queued-message-wire'
import { agentSessionSendBodyFingerprint } from '../../shared/agent-session/requests/structured-agent-session-send-mutation'
import { computePublishedQueuedMessages } from './agent-session-wire/delivery/structured-agent-session-queued-publication'
import type { AgentSessionJournal } from './agent-session-journal/journal-store'
import { agentSessionFailureFact } from '../../shared/agent-session/failures/agent-session-failure'
import { agentSessionFailureWords } from '../../shared/agent-session/failures/agent-session-failure-words'
import { queuedMessagesPublishedBytesRefusal } from './agent-session-wire/delivery/structured-agent-session-queued-published-bytes'
import { QUEUED_MESSAGE_PAUSED_SEND_FAILED } from '../../shared/agent-session/requests/agent-session-queued-message-wire'
import type { AgentJournalMessageItem } from '../../shared/agent-session/journal/agent-session-journal-types'

async function publishedQueue(journal: AgentSessionJournal): Promise<AgentSessionQueuedMessage[]> {
  return computePublishedQueuedMessages(await journal.queuedMessages.list())
}

/** A terminal chat's queue: cards wait in the journal and go to the terminal one at a time when it is idle. */
export class TerminalChatQueue {
  private draining: Promise<void> | null = null
  private submittedSequence: number | null = null
  private admissions: Promise<void> = Promise.resolve()

  constructor(
    readonly journal: AgentSessionJournal,
    private readonly activity: () => NativeChatTerminalActivity,
    private readonly send: (text: string) => Promise<boolean>
  ) {}

  async snapshot(): Promise<NativeChatTerminalQueueSnapshot> {
    const cursor = this.journal.cursor()
    return {
      revision: `${cursor.epoch}:${cursor.sequence}`,
      activity: this.activity(),
      queuedMessages: await publishedQueue(this.journal)
    }
  }

  enqueue(messageId: string, text: string): Promise<void> {
    const flight = this.admissions.then(() => this.enqueueOne(messageId, text))
    this.admissions = flight.catch(() => {})
    return flight
  }

  private async enqueueOne(messageId: string, text: string): Promise<void> {
    const existing = await this.journal.queuedMessages.get(messageId)
    if (existing) {
      if (existing.body.blocks.some((block) => block.type === 'text' && block.text !== text)) {
        throw new Error('terminal_chat_queue_payload_changed')
      }
      return
    }
    if ((await publishedQueue(this.journal)).length >= 100) {
      throw new Error('terminal_chat_queue_full')
    }
    const body: AgentJournalMessageItem = {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text }]
    }
    const refusal = await queuedMessagesPublishedBytesRefusal(this.journal, body, true)
    if (refusal) {
      throw new Error(refusal.message)
    }
    await this.journal.queuedMessages.insert({ messageId, body })
  }

  drain(): Promise<void> {
    if (this.draining) {
      return this.draining
    }
    const flight = this.drainOne().finally(() => {
      if (this.draining === flight) {
        this.draining = null
      }
    })
    this.draining = flight
    return flight
  }

  async cancel(messageIds: string[]): Promise<void> {
    const head = (await publishedQueue(this.journal))[0]
    await this.journal.queuedMessages.withdraw(messageIds)
    if (head?.paused && messageIds.includes(head.messageId)) {
      this.submittedSequence = null
    }
  }

  private async drainOne(): Promise<void> {
    const first = (await publishedQueue(this.journal))[0]
    if (!first || first.paused || first.state !== 'waiting') {
      return
    }
    const activity = this.activity()
    if (
      activity.state !== 'idle' ||
      !activity.inputReady ||
      (this.submittedSequence !== null && activity.workingSequence <= this.submittedSequence)
    ) {
      return
    }
    const card = await this.journal.queuedMessages.nextInputCard()
    if (card?.messageId !== first.messageId) {
      return
    }
    const id = randomUUID()
    await this.journal.appendSubmission(
      {
        clientMessageId: id,
        payloadFingerprint: agentSessionSendBodyFingerprint(
          this.journal.identity.sessionId,
          card.body
        ),
        body: card.body,
        fence: 0,
        handoverRecorded: true
      },
      { messageId: card.messageId, expect: 'waiting' }
    )
    this.submittedSequence = activity.workingSequence
    const text = card.body.blocks
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
    const sent = await this.send(text).catch(() => null)
    if (sent === false) {
      this.submittedSequence = null
      await this.journal.resolveDispatch({
        clientMessageId: id,
        state: 'rejected',
        fence: 0,
        // Nothing reached the terminal, so the journal puts the card back in the queue to retry.
        ...agentSessionFailureWords(
          agentSessionFailureFact('notDelivered', { neverReachedAgent: true }),
          {
            surface: 'rejection'
          }
        )
      })
      return
    }
    if (sent === true) {
      await this.journal.resolveDispatch({
        clientMessageId: id,
        state: 'accepted',
        providerIdentity: null,
        fence: 0
      })
      return
    }
    // Delivery is uncertain: keep the card first in the queue, held until the person deletes it.
    await this.journal.resolveDispatch({
      clientMessageId: id,
      state: 'rejected',
      fence: 0,
      ...agentSessionFailureWords(agentSessionFailureFact('unconfirmed'), {
        surface: 'rejection'
      })
    })
    await this.journal.queuedMessages.hold({
      messageIds: [card.messageId],
      reason: QUEUED_MESSAGE_PAUSED_SEND_FAILED
    })
  }
}
