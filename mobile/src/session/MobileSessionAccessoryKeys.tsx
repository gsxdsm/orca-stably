import { Pressable, StyleSheet, Text } from 'react-native'
import { ChevronsRight, Monitor, Plus, Smartphone } from 'lucide-react-native'
import { triggerMediumImpact } from '../platform/haptics'
import { createTerminalLiveAccessoryInput } from '../terminal/terminal-live-accessory-input'
import { keepHeldPressThroughLongPress } from './held-press-long-press'
import { isTerminalPhoneDisplayMode } from './mobile-session-route-helpers'
import { colors, spacing } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'
import type { MobileSessionController } from './use-mobile-session-controller'

// The terminal's shortcut keys, shared by the accessory row under the terminal and the side rail.
export function MobileSessionAccessoryKeys({
  controller,
  inRail = false
}: {
  controller: MobileSessionController
  inRail?: boolean
}) {
  const {
    canSend,
    canCompose,
    canPaste,
    activeHandle,
    terminalModes,
    liveInputEnabled,
    visibleBuiltInAccessoryKeys,
    customKeys,
    toggleDisplayMode,
    toggleLiveInput,
    handlePaste,
    handleAccessoryKey,
    startAccessoryRepeat,
    stopAccessoryRepeat,
    setDeleteKeyTarget,
    setShowCustomKeyModal
  } = controller
  const keyStyle = inRail ? [styles.accessoryKey, railStyles.key] : styles.accessoryKey
  return (
    <>
      <Pressable
        style={({ pressed }) => [
          keyStyle,
          pressed && styles.accessoryKeyPressed,
          !canSend && styles.accessoryKeyDisabled
        ]}
        disabled={!canSend}
        onPress={() => {
          if (activeHandle) {
            void toggleDisplayMode(activeHandle)
          }
        }}
        accessibilityLabel={
          isTerminalPhoneDisplayMode(activeHandle, terminalModes)
            ? 'Switch to desktop mode'
            : 'Switch to phone mode'
        }
      >
        {isTerminalPhoneDisplayMode(activeHandle, terminalModes) ? (
          <Monitor size={14} color={canSend ? colors.textSecondary : colors.textMuted} />
        ) : (
          <Smartphone size={14} color={canSend ? colors.textSecondary : colors.textMuted} />
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          keyStyle,
          liveInputEnabled && styles.accessoryKeyActive,
          pressed && styles.accessoryKeyPressed,
          !canCompose && styles.accessoryKeyDisabled
        ]}
        // Why: offline, live mode is dead but the buffered box still composes — keep the escape hatch tappable (#6713).
        disabled={!canCompose}
        onPress={toggleLiveInput}
        accessibilityLabel={
          liveInputEnabled ? 'Switch to buffered command input' : 'Switch to live terminal input'
        }
      >
        <ChevronsRight
          size={14}
          color={
            liveInputEnabled ? colors.bgBase : canCompose ? colors.textSecondary : colors.textMuted
          }
        />
      </Pressable>
      {canPaste && (
        <Pressable
          style={({ pressed }) => [
            keyStyle,
            pressed && styles.accessoryKeyPressed,
            !canSend && styles.accessoryKeyDisabled
          ]}
          disabled={!canSend}
          onPress={() => void handlePaste()}
          accessibilityLabel="Paste from clipboard"
        >
          <Text style={[styles.accessoryKeyText, !canSend && styles.accessoryKeyTextDisabled]}>
            Paste
          </Text>
        </Pressable>
      )}
      {visibleBuiltInAccessoryKeys.map((key) => (
        <Pressable
          key={key.id}
          style={({ pressed }) => [
            keyStyle,
            pressed && styles.accessoryKeyPressed,
            !canSend && styles.accessoryKeyDisabled
          ]}
          disabled={!canSend}
          onPressIn={() => {
            if (!key.repeatable) {
              return
            }
            const input = createTerminalLiveAccessoryInput(key)
            void handleAccessoryKey(input)
            startAccessoryRepeat(input)
          }}
          onPressOut={() => {
            if (key.repeatable) {
              stopAccessoryRepeat()
            }
          }}
          onPress={() => {
            if (key.repeatable) {
              return
            }
            void handleAccessoryKey(createTerminalLiveAccessoryInput(key))
          }}
          onLongPress={key.repeatable ? keepHeldPressThroughLongPress : undefined}
          accessibilityLabel={key.accessibilityLabel ?? `Send ${key.label}`}
        >
          <Text style={[styles.accessoryKeyText, !canSend && styles.accessoryKeyTextDisabled]}>
            {key.label}
          </Text>
        </Pressable>
      ))}
      {customKeys.map((key) => (
        <Pressable
          key={key.id}
          style={({ pressed }) => [
            keyStyle,
            styles.customAccessoryKey,
            pressed && styles.accessoryKeyPressed,
            !canSend && styles.accessoryKeyDisabled
          ]}
          disabled={!canSend}
          onPress={() => void handleAccessoryKey({ bytes: key.bytes })}
          onLongPress={() => {
            triggerMediumImpact()
            setDeleteKeyTarget(key)
          }}
          delayLongPress={400}
          accessibilityLabel={`Send ${key.label}`}
        >
          <Text style={[styles.accessoryKeyText, !canSend && styles.accessoryKeyTextDisabled]}>
            {key.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        style={({ pressed }) => [keyStyle, pressed && styles.accessoryKeyPressed]}
        onPress={() => setShowCustomKeyModal(true)}
        accessibilityLabel="Add custom shortcut"
      >
        <Plus size={14} color={colors.textSecondary} strokeWidth={2.2} />
      </Pressable>
    </>
  )
}

const railStyles = StyleSheet.create({
  // A column of full-width keys, each a comfortable tap target.
  // Slim side padding so the longest built-in label (Shift+Tab) fits the 84pt column.
  key: {
    alignSelf: 'stretch',
    paddingHorizontal: 2,
    paddingVertical: spacing.sm + 2,
    justifyContent: 'center'
  }
})
