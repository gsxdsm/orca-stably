import { useCallback, useMemo, useState } from 'react'
import {
  nativeChatSubagentActivities,
  type NativeChatSubagentActivity
} from '../../../../shared/native-chat/input/native-chat-activity'
import type { NativeChatTaskSeedList } from '../../../../shared/native-chat/input/native-chat-claude-task-updates'
import type { NativeChatAwaitingInput } from '../../../../shared/native-chat/native-chat-terminal-turn'
import type { StructuredAgentSubagentRoster } from '../../../../shared/agent-session/view/structured-agent-session-subagent-roster'
import type { NativeChatSubagentRow } from '../../../../shared/native-chat/transcript/native-chat-transcript-projection'
import { frameNativeChatSubagentTranscript } from '../../../../shared/native-chat/input/native-chat-subagent-brief'
import { nativeChatTaskListPredecessors } from '../../../../shared/native-chat/input/native-chat-task-list-history'
import { linkUnrecordedSubagentSpawns } from '../../../../shared/native-chat/input/native-chat-unlinked-subagent-spawn'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatOlderPageResult } from './viewport/history/native-chat-pagination'
import {
  useNativeChatSubagentPage,
  type NativeChatSubagentPageRead
} from './use-native-chat-subagent-page'
import { useNativeChatSubagentSections } from './subagents/use-native-chat-subagent-sections'

const NO_SUBAGENT_ROWS: ReadonlyMap<string, readonly NativeChatSubagentRow[]> = new Map()

/** Which transcript the chat is showing, and the parent turn chrome to hide while a child is open. */
export function useNativeChatSubagentTranscript({
  session,
  messages,
  subagentRows,
  subagentRoster,
  isWorking,
  awaitingInput,
  stopping,
  activityText,
  lifecycleWorking
}: {
  session: {
    sessionId: string | null
    taskList?: NativeChatTaskSeedList | null
    subagentSeed?: readonly NativeChatSubagentActivity[] | null
    readSubagentPage?: NativeChatSubagentPageRead | null
  }
  messages: readonly NativeChatMessage[]
  subagentRows: ReadonlyMap<string, readonly NativeChatSubagentRow[]>
  subagentRoster: StructuredAgentSubagentRoster | undefined
  isWorking: boolean
  awaitingInput: NativeChatAwaitingInput | null
  stopping: boolean
  activityText: string | undefined
  lifecycleWorking: boolean
}): {
  transcriptMessages: readonly NativeChatMessage[]
  sectionRows: ReadonlyMap<string, readonly NativeChatSubagentRow[]>
  sectionRoster: StructuredAgentSubagentRoster | undefined
  shownWorking: boolean
  shownAwaitingInput: NativeChatAwaitingInput | null
  shownStopping: boolean
  shownActivityText: string | undefined
  shownLifecycleWorking: boolean
  activity: {
    messages: readonly NativeChatMessage[]
    subagentRows: ReadonlyMap<string, readonly NativeChatSubagentRow[]>
    focusedSubagentId: string | null
    focusedTranscriptLoading: boolean
    onFocusSubagent: (agentId: string | null) => void
    taskList: NativeChatTaskSeedList | null
    subagentSeed: readonly NativeChatSubagentActivity[] | null
    sessionId: string | null
  }
  childHistory: {
    hasMore: boolean
    loadingEarlier: boolean
    loadEarlier: () => Promise<NativeChatOlderPageResult>
  } | null
  sections: ReturnType<typeof useNativeChatSubagentSections>['sections']
  subagentRowsInOrder: ReturnType<typeof useNativeChatSubagentSections>['subagentRowsInOrder']
  subagentChoices: ReturnType<typeof useNativeChatSubagentSections>['subagentChoices']
  subagentDisclosure: ReturnType<typeof useNativeChatSubagentSections>['subagentDisclosure']
  openSubagentSections: ReturnType<typeof useNativeChatSubagentSections>['openSubagentSections']
  loadedMessageIds: ReadonlySet<string>
  taskListPredecessors: ReturnType<typeof nativeChatTaskListPredecessors>
} {
  const { sessionId, taskList = null, subagentSeed = null, readSubagentPage = null } = session
  const [focus, setFocus] = useState<{ sessionId: string | null; agentId: string | null }>({
    sessionId,
    agentId: null
  })
  if (focus.sessionId !== sessionId) {
    setFocus({ sessionId, agentId: null })
  }
  const requestedId = focus.sessionId === sessionId ? focus.agentId : null
  const activities = useMemo(
    () => nativeChatSubagentActivities(messages, subagentRows, subagentSeed),
    [messages, subagentRows, subagentSeed]
  )
  // A roster entry can be focused before its rows load. Drop it only once it leaves the roster.
  const viewingSubagent =
    requestedId != null && activities.some((agent) => agent.id === requestedId)
  if (requestedId && !viewingSubagent) {
    setFocus({ sessionId, agentId: null })
  }
  const focusedSubagentId = viewingSubagent ? requestedId : null
  const page = useNativeChatSubagentPage(
    readSubagentPage ? focusedSubagentId : null,
    readSubagentPage
  )
  const transcriptMessages = useMemo(() => {
    if (!viewingSubagent || !requestedId) {
      return messages
    }
    const childPage = readSubagentPage
      ? (page.messages ?? [])
      : (subagentRows.get(requestedId)?.map((row) => row.message) ?? [])
    const focusedAgent = activities.find((agent) => agent.id === requestedId)
    return frameNativeChatSubagentTranscript(
      requestedId,
      childPage,
      linkUnrecordedSubagentSpawns(messages),
      focusedAgent ? { title: focusedAgent.label, prompt: null } : undefined,
      !readSubagentPage || page.messages != null
    )
  }, [
    activities,
    messages,
    page.messages,
    readSubagentPage,
    requestedId,
    subagentRows,
    viewingSubagent
  ])
  const activityRows = useMemo(() => {
    if (!focusedSubagentId || !page.messages) {
      return subagentRows
    }
    const next = new Map(subagentRows)
    next.set(
      focusedSubagentId,
      page.messages.map((message) => ({ message, turnKey: undefined }))
    )
    return next
  }, [focusedSubagentId, page.messages, subagentRows])
  const onFocusSubagent = useCallback(
    (agentId: string | null) => setFocus({ sessionId, agentId }),
    [sessionId]
  )
  const sectionRows = viewingSubagent ? NO_SUBAGENT_ROWS : subagentRows
  const sectionRoster = viewingSubagent ? undefined : subagentRoster
  const {
    sections,
    subagentRowsInOrder,
    subagentChoices,
    subagentDisclosure,
    openSubagentSections
  } = useNativeChatSubagentSections(transcriptMessages, sectionRows, sectionRoster)
  // Folded subagent rows stay loaded, so a reopened reply keeps its reveal.
  const loadedMessageIds = useMemo(
    () => new Set([...transcriptMessages.map(({ id }) => id), ...sections.pathOf.keys()]),
    [transcriptMessages, sections]
  )
  const taskListPredecessors = useMemo(
    () => nativeChatTaskListPredecessors(transcriptMessages),
    [transcriptMessages]
  )
  return {
    transcriptMessages,
    sectionRows,
    sectionRoster,
    shownWorking: viewingSubagent ? false : isWorking,
    shownAwaitingInput: viewingSubagent ? null : awaitingInput,
    shownStopping: viewingSubagent ? false : stopping,
    shownActivityText: viewingSubagent ? undefined : activityText,
    shownLifecycleWorking: viewingSubagent ? false : lifecycleWorking,
    childHistory:
      readSubagentPage && focusedSubagentId
        ? {
            hasMore: page.hasMore && !page.loading,
            loadingEarlier: page.loadingEarlier,
            loadEarlier: page.loadEarlier
          }
        : null,
    activity: {
      messages,
      subagentRows: activityRows,
      focusedSubagentId,
      focusedTranscriptLoading: Boolean(readSubagentPage && focusedSubagentId && page.loading),
      onFocusSubagent,
      taskList,
      subagentSeed,
      sessionId
    },
    sections,
    subagentRowsInOrder,
    subagentChoices,
    subagentDisclosure,
    openSubagentSections,
    loadedMessageIds,
    taskListPredecessors
  }
}
