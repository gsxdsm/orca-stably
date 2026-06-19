import { useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { ArrowUp, ImagePlus, Mic, Square } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  applyAutocomplete,
  detectAutocompleteTrigger,
  rankSuggestions
} from './mobile-native-chat-autocomplete'
import { MobileNativeChatControlBar } from './MobileNativeChatControlBar'
import {
  applyThinkingPrefix,
  defaultNativeChatControlSelection,
  resolveNativeChatAgentControls,
  thinkingPrefixForSelection,
  type NativeChatControl,
  type NativeChatControlSelection
} from './mobile-native-chat-agent-controls'

// Common agent slash commands offered as autocomplete; sending them is just text
// to the agent's terminal, so the set is intentionally provider-agnostic.
const SLASH_COMMANDS = [
  '/clear',
  '/compact',
  '/review',
  '/model',
  '/help',
  '/init',
  '/cost',
  '/diff'
]

const NO_FILE_PATHS: string[] = []

type Props = {
  /** Controlled composer text — owned by the parent so dictation can write to it. */
  value: string
  onChangeText: (text: string) => void
  onSend: (text: string) => void
  /** Resolved agent id; drives which control dropdowns (Mode/Thinking/Model) show. */
  agent?: string | null
  /**
   * Fire a control payload that is NOT part of the message body: raw control
   * bytes (Shift+Tab to cycle mode) or a standalone command line (`/model …`).
   * `enter` true submits the line (commands); false writes bytes as-is (raw).
   */
  onControlSend?: (payload: string, enter: boolean) => void
  onAttachImage?: () => void
  isAttaching?: boolean
  onMicPress?: () => void
  micActive?: boolean
  disabled?: boolean
  placeholder?: string
  filePaths?: string[]
  onNeedFiles?: () => void
}

export function MobileNativeChatComposer({
  value,
  onChangeText,
  onSend,
  agent,
  onControlSend,
  onAttachImage,
  isAttaching = false,
  onMicPress,
  micActive = false,
  disabled = false,
  placeholder = 'Message, @files, /commands',
  filePaths = NO_FILE_PATHS,
  onNeedFiles
}: Props): React.JSX.Element {
  const [cursor, setCursor] = useState(0)
  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !disabled

  // Resolve the agent's control set (Mode/Thinking/Model) and seed defaults.
  const controls = useMemo(() => resolveNativeChatAgentControls(agent ?? ''), [agent])
  const [controlSelection, setControlSelection] = useState<NativeChatControlSelection>(() =>
    defaultNativeChatControlSelection(controls)
  )
  const prevAgentRef = useRef(agent)
  if (prevAgentRef.current !== agent) {
    prevAgentRef.current = agent
    setControlSelection(defaultNativeChatControlSelection(controls))
  }

  const handleControlSelect = (control: NativeChatControl, optionId: string): void => {
    setControlSelection((prev) => ({ ...prev, [control.kind]: optionId }))
    if (control.mechanism === 'prepend' || disabled) {
      return
    }
    const option = control.options.find((o) => o.id === optionId)
    if (!option || !onControlSend) {
      return
    }
    // raw (Shift+Tab) writes bytes as-is; command (`/model …`) submits the line.
    onControlSend(option.payload, control.mechanism === 'command')
  }

  const trigger = useMemo(() => detectAutocompleteTrigger(value, cursor), [value, cursor])
  const suggestions = useMemo(() => {
    if (!trigger) {
      return []
    }
    if (trigger.kind === 'slash') {
      return rankSuggestions(SLASH_COMMANDS, trigger.query)
    }
    return rankSuggestions(filePaths, trigger.query).map((p) => `@${p}`)
  }, [trigger, filePaths])

  const handleChange = (next: string): void => {
    onChangeText(next)
    if (onNeedFiles && filePaths.length === 0 && next.includes('@')) {
      onNeedFiles()
    }
  }

  const pickSuggestion = (suggestion: string): void => {
    if (!trigger) {
      return
    }
    const { text: nextText, cursor: nextCursor } = applyAutocomplete(value, trigger, suggestion)
    onChangeText(nextText)
    setCursor(nextCursor)
  }

  const handleSend = (): void => {
    if (!canSend) {
      return
    }
    // Thinking level (RELIABLE): prepend the keyword to this message at SEND.
    const prefix = thinkingPrefixForSelection(controls, controlSelection)
    onSend(applyThinkingPrefix(prefix, trimmed))
    onChangeText('')
    setCursor(0)
  }

  return (
    <View>
      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <ScrollView keyboardShouldPersistTaps="always" style={styles.suggestionScroll}>
            {suggestions.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                onPress={() => pickSuggestion(s)}
              >
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {/* Agent control chips (Mode / Thinking / Model) sit in the composer box
          above the input — the enlarged composer per the desktop parity. */}
      <MobileNativeChatControlBar
        controls={controls}
        selection={controlSelection}
        disabled={disabled}
        onSelect={handleControlSelect}
      />
      <View style={styles.bar}>
        {onAttachImage ? (
          <Pressable
            accessibilityLabel="Attach image"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            onPress={onAttachImage}
            disabled={isAttaching || disabled}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <ImagePlus size={20} color={colors.textSecondary} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accentBlue}
          multiline
          editable={!disabled}
          textAlignVertical="top"
        />
        {onMicPress ? (
          <Pressable
            accessibilityLabel={micActive ? 'Stop dictation' : 'Dictate'}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            onPress={onMicPress}
            disabled={disabled}
          >
            {micActive ? (
              <Square
                size={18}
                color={colors.statusRed}
                strokeWidth={2.4}
                fill={colors.statusRed}
              />
            ) : (
              <Mic size={20} color={colors.textSecondary} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Send message"
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && canSend && styles.pressed
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <ArrowUp size={20} color={canSend ? colors.bgBase : colors.textMuted} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  suggestions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  suggestionScroll: {
    maxHeight: 180
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  suggestionPressed: {
    backgroundColor: colors.bgRaised
  },
  suggestionText: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: typography.metaSize
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 40,
    color: colors.textPrimary,
    fontSize: typography.bodySize + 1,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // White send affordance per design — dark arrow on a light circle.
    backgroundColor: colors.textPrimary
  },
  sendButtonDisabled: {
    backgroundColor: colors.bgRaised
  },
  pressed: {
    opacity: 0.7
  }
})
