import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ListChecks } from 'lucide-react-native'
import type { NativeChatTaskSeedList } from '../../../../../src/shared/native-chat/input/native-chat-claude-task-updates'
import { nativeChatCompletedTaskCount } from '../../../../../src/shared/native-chat/input/native-chat-task-list'
import { latestNativeChatTaskList } from '../../../../../src/shared/native-chat/input/native-chat-task-seed'
import type { NativeChatMessage } from '../../../../../src/shared/native-chat/native-chat-types'
import { BottomDrawer } from '../../../components/bottom-drawer/BottomDrawer'
import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../theme/themed-styles'
import { useMobileColorScheme } from '../../../theme/use-mobile-color-scheme'
import { MobileNativeChatTaskList } from './MobileNativeChatTaskList'

/** The agent's task list from every source, including history outside the loaded tail. */
export function MobileNativeChatTaskPill({
  messages,
  seed,
  fontScale
}: {
  messages: readonly NativeChatMessage[]
  seed: NativeChatTaskSeedList | null
  fontScale: number
}): React.JSX.Element | null {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [open, setOpen] = useState(false)
  const list = useMemo(() => latestNativeChatTaskList(messages, seed), [messages, seed])
  if (!list || list.tasks.length === 0) {
    return null
  }
  const completed = nativeChatCompletedTaskCount(list)
  const total = list.tasks.length
  const label =
    total === 1
      ? t('chat.activity.taskPill', '{{completed}}/{{count}} task', { completed, count: total })
      : t('chat.activity.tasksPill', '{{completed}}/{{count}} tasks', { completed, count: total })
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('chat.activity.openTasks', 'Tasks, {{label}}', { label })}
        testID="native-chat-tasks-pill"
        onPress={() => setOpen(true)}
        style={styles.pill}
      >
        <ListChecks size={14} color={colors.textSecondary} strokeWidth={2} />
        <Text style={styles.pillText}>{label}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(completed / total) * 100}%` }]} />
        </View>
      </Pressable>
      <BottomDrawer visible={open} onClose={() => setOpen(false)} dragContentToDismiss>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('chat.taskList.title', 'Tasks')}</Text>
          <MobileNativeChatTaskList list={list} fontScale={fontScale} variant="sheet" />
        </View>
      </BottomDrawer>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.composerControl
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize
  },
  track: {
    width: 32,
    height: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.translucentFill
  },
  fill: {
    height: '100%',
    backgroundColor: colors.textPrimary
  },
  sheet: {
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  }
}))
