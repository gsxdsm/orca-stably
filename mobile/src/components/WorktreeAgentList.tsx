import { Fragment, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { buildAgentRowLineageTree, flattenAgentRowLineage } from '../worktree/agent-row-lineage'
import { WorktreeAgentRow } from './WorktreeAgentRow'
import { WorktreeAgentSummary } from './WorktreeAgentSummary'
import { worktreeAgentChildRows } from '../worktree/worktree-agent-child-rows'

function parentSessionPress(
  selectable: boolean,
  onAgentPress: ((paneKey: string) => void) | undefined,
  onLongPress: ((paneKey: string) => void) | undefined,
  onWorkspacePress: (() => void) | undefined
): ((paneKey: string) => void) | undefined {
  if (selectable && onAgentPress) {
    return onAgentPress
  }
  if (onLongPress) {
    return onWorkspacePress
  }
  return undefined
}

type Props = {
  agents: RuntimeWorktreeAgentRow[]
  now: number
  unvisited: boolean
  statusLive?: boolean
  isReadOnly?: boolean
  onAgentPress?: (paneKey: string) => void
  /** The desktop's "Full list" agent activity layout: every row, no summary. */
  fullList?: boolean
  /** Each session is its own taller target. Off, a long-press on the card still lists every session. */
  selectable?: boolean
  /** Pane open from a session tap. Only that session row is filled. */
  selectedPaneKey?: string | null
  onLongPress?: (paneKey: string) => void
  /** Tap on a session row while sessions are not selectable. Opens the workspace, not that session. */
  onWorkspacePress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
}

// Flatten spawn lineage into indented agent rows, matching desktop WorktreeCardAgents.
export function WorktreeAgentList({
  agents,
  now,
  unvisited,
  statusLive = false,
  isReadOnly = false,
  onAgentPress,
  fullList = false,
  selectable = false,
  selectedPaneKey = null,
  onLongPress,
  onWorkspacePress,
  onPressIn,
  onPressOut
}: Props) {
  const nodes = useMemo(() => flattenAgentRowLineage(agents), [agents])
  const summaryAgents = useMemo(() => {
    const lineage = buildAgentRowLineageTree(agents)
    return lineage.childrenByParentPaneKey.size > 0 ? lineage.rootRows : agents
  }, [agents])
  const [expanded, setExpanded] = useState(false)
  const usesSummary = !fullList && summaryAgents.length > 1

  return (
    <View style={styles.list}>
      {usesSummary ? (
        <WorktreeAgentSummary
          agents={summaryAgents}
          expanded={expanded}
          now={now}
          onToggle={() => setExpanded((value) => !value)}
        />
      ) : null}
      {!usesSummary || expanded
        ? nodes.map((node) => {
            const children = worktreeAgentChildRows(node.row, statusLive)
            return (
              <Fragment key={node.row.paneKey}>
                <WorktreeAgentRow
                  agent={node.row}
                  depth={node.depth}
                  now={now}
                  unvisited={unvisited}
                  selectable={selectable}
                  selected={selectedPaneKey === node.row.paneKey}
                  isReadOnly={isReadOnly}
                  onPress={parentSessionPress(
                    selectable,
                    onAgentPress,
                    onLongPress,
                    onWorkspacePress
                  )}
                  onPressIn={onPressIn}
                  onPressOut={onPressOut}
                  onLongPress={onLongPress}
                />
                {children.map((childRow) => (
                  <WorktreeAgentRow
                    key={childRow.id}
                    agent={node.row}
                    childRow={childRow}
                    depth={node.depth + 1}
                    now={now}
                    unvisited={unvisited}
                    selectable={selectable}
                    isReadOnly={isReadOnly}
                    onPress={onAgentPress}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    onLongPress={onLongPress}
                  />
                ))}
              </Fragment>
            )
          })
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    marginTop: 3
  }
})
