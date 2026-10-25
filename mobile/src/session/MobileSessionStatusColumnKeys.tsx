import { useCallback, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { spacing } from '../theme/mobile-theme'
import { MobileSessionAccessoryKeys } from './MobileSessionAccessoryKeys'
import type { MobileSessionController } from './use-mobile-session-controller'

/**
 * Folded, the terminal grid stops short of the status column, leaving the strip below the status
 * items empty beside it; the terminal's keys go there instead of the row under the terminal.
 */
export function MobileSessionStatusColumnKeys({
  controller
}: {
  controller: MobileSessionController
}) {
  const { statusColumnWidth, statusColumnTop } = controller
  const frameRef = useRef<View>(null)
  // The strip starts at the status column's bottom in window points; the frame sits below the header.
  const [frameTop, setFrameTop] = useState<number | null>(null)
  const measure = useCallback(() => {
    frameRef.current?.measureInWindow((_x, y) => setFrameTop(y))
  }, [])
  const top = frameTop === null || statusColumnTop === null ? null : statusColumnTop - frameTop
  return (
    <View ref={frameRef} onLayout={measure} style={styles.frame} pointerEvents="box-none">
      {top === null ? null : (
        <ScrollView
          style={[styles.column, { top: Math.max(0, top), width: statusColumnWidth }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          // Why: default tap handling makes the first key tap dismiss the keyboard and get swallowed (#5106).
          keyboardShouldPersistTaps="always"
        >
          <MobileSessionAccessoryKeys controller={controller} inRail />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFillObject
  },
  column: {
    position: 'absolute',
    right: 0,
    bottom: 0
  },
  content: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm
  }
})
