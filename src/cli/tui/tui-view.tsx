import React from 'react'
import { Box, Text } from 'ink'
import { StatusBar } from './status-bar'
import type { Platform } from './keybinding-map'
import { BACK_LABEL, padToWidth, STRIP_WIDTH, type NarrowView } from './tui-layout'

export type TuiViewProps = {
  columns: number
  rows: number
  isNarrow: boolean
  narrowView: NarrowView
  worktreeCount: number
  selectedName: string
  sidebarWidth: number
  sidebar: React.ReactNode
  main: React.ReactNode
  strip: React.ReactNode
  overlays: React.ReactNode
  platform: Platform
  disconnected: boolean
  error: string | null
  context: string
}

/** The presentational shell: header bar, the responsive body (two-pane when
 *  wide; collapsed single-pane nav views when narrow), overlays, and footer. */
export function TuiView(props: TuiViewProps): React.JSX.Element {
  const { isNarrow, narrowView, sidebar, main, strip } = props
  const showTerminalView = isNarrow && narrowView === 'terminal'

  return (
    <Box flexDirection="column" width={props.columns} height={props.rows}>
      {showTerminalView ? (
        <Box>
          <Text backgroundColor="cyan" color="black" bold>
            {BACK_LABEL}
          </Text>
          <Text bold>{` ${props.selectedName}`}</Text>
        </Box>
      ) : (
        <Text backgroundColor="cyan" color="black" bold>
          {padToWidth(
            ` orca tui · ${props.worktreeCount} worktree${props.worktreeCount === 1 ? '' : 's'}`,
            props.columns
          )}
        </Text>
      )}

      <Box flexGrow={1}>
        {!isNarrow ? (
          <>
            <Box
              width={props.sidebarWidth}
              flexDirection="column"
              borderStyle="single"
              borderTop={false}
              borderBottom={false}
              borderLeft={false}
            >
              {sidebar}
            </Box>
            <Box flexGrow={1} flexDirection="column" marginLeft={1}>
              {main}
            </Box>
          </>
        ) : narrowView === 'list' ? (
          <Box flexGrow={1} flexDirection="column">
            {sidebar}
          </Box>
        ) : (
          <>
            <Box width={STRIP_WIDTH} flexDirection="column">
              {strip}
            </Box>
            <Box flexGrow={1} flexDirection="column" marginLeft={1}>
              {main}
            </Box>
          </>
        )}
      </Box>

      {props.overlays}

      <StatusBar
        platform={props.platform}
        disconnected={props.disconnected}
        error={props.error}
        context={props.context}
      />
    </Box>
  )
}
