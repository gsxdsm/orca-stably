import { View, ScrollView, TextInput, Pressable } from 'react-native'
import { hostOs } from '../platform/host-os'
import { ArrowUp, ChevronDown, Keyboard as KeyboardIcon } from 'lucide-react-native'
import {
  getTerminalCommandKeyboardType,
  getTerminalLiveInputKeyboardType
} from '../terminal/terminal-keyboard-type'
import { MobileTerminalLiveInputStatus } from './MobileTerminalLiveInputStatus'
import { MobileSessionTerminalInputActions } from './MobileSessionTerminalInputActions'
import { MobileSessionAccessoryKeys } from './MobileSessionAccessoryKeys'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'
import { useKeyboardPersistingTaps } from '../platform/keyboard-persisting-taps'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileSessionCommandDock({ controller }: { controller: MobileSessionController }) {
  const {
    insets,
    bufferedTerminalDraftState,
    autocompleteEnabled,
    liveInputCapture,
    bindCommandField,
    handleLiveInputChange,
    handleLiveInputKeyPress,
    bindLiveInputField,
    submitLiveInput,
    canSend,
    canCompose,
    liveInputEnabled,
    focusLiveInput,
    showNativeChat,
    dictation,
    handleSend,
    dismissSoftwareKeyboard,
    isAttaching,
    activeMarkdownTab,
    activeFileTab,
    activeBrowserTab,
    keyboardLift
  } = controller
  const accessoryBarKeepsKeyboard = useKeyboardPersistingTaps('always')
  const keysInRail = controller.terminalKeysBesideTerminal
  return (
    !activeMarkdownTab &&
    !activeFileTab &&
    !activeBrowserTab &&
    !showNativeChat && (
      <View
        style={[
          styles.commandDock,
          { paddingBottom: insets.bottom, transform: [{ translateY: -keyboardLift }] }
        ]}
      >
        {/* Accessory keys; the side rail or the folded status-column strip holds them when present. */}
        {keysInRail ? null : (
          <View ref={accessoryBarKeepsKeyboard} style={styles.accessoryBar}>
            {/* Why: fixed keyboard escape hatch; outside ScrollView + shortcut path so it can't scroll away or be hidden (#5106). */}
            {keyboardLift > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.keyboardDismissKey,
                  pressed && styles.accessoryKeyPressed
                ]}
                onPress={dismissSoftwareKeyboard}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss keyboard"
                accessibilityHint="Hides the software keyboard and keeps the current terminal session open."
              >
                <View style={styles.keyboardDismissGlyph}>
                  <KeyboardIcon size={15} color={colors.textSecondary} strokeWidth={2} />
                  <ChevronDown
                    size={10}
                    color={colors.textSecondary}
                    strokeWidth={2.5}
                    style={styles.keyboardDismissChevron}
                  />
                </View>
              </Pressable>
            )}
            {/* Why: default tap handling makes the first accessory-key tap dismiss the keyboard and get swallowed (#5106). */}
            <ScrollView
              style={styles.accessoryScroll}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accessoryContent}
              keyboardShouldPersistTaps="always"
            >
              <MobileSessionAccessoryKeys controller={controller} />
            </ScrollView>
          </View>
        )}

        {}
        {liveInputEnabled ? (
          <View style={[styles.inputBar, styles.liveInputBar]}>
            <Pressable
              style={({ pressed }) => [
                styles.liveInputFocusTarget,
                pressed && styles.liveInputFocusTargetPressed,
                !canSend && styles.liveInputFocusTargetDisabled
              ]}
              disabled={!canSend}
              onPress={focusLiveInput}
              accessibilityRole="button"
              accessibilityLabel="Show keyboard for live terminal input"
              accessibilityHint="Typed text is sent directly to the active terminal"
            >
              <KeyboardIcon size={16} color={colors.textSecondary} strokeWidth={2} />
              <MobileTerminalLiveInputStatus
                dictation={dictation}
                isAttaching={isAttaching}
                liveInputText={liveInputCapture}
              />
            </Pressable>
            <MobileSessionTerminalInputActions controller={controller} />
            <TextInput
              ref={bindLiveInputField}
              style={styles.liveInputCapture}
              value={liveInputCapture}
              onChange={handleLiveInputChange}
              onKeyPress={handleLiveInputKeyPress}
              onSubmitEditing={submitLiveInput}
              placeholder=""
              showSoftInputOnFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              smartInsertDelete={false}
              // Why: iOS textContentType overrides autoComplete and can narrow the keyboard; keep IME switching available.
              autoComplete="off"
              keyboardType={getTerminalLiveInputKeyboardType(hostOs())}
              returnKeyType="default"
              blurOnSubmit={false}
              editable={canSend}
              importantForAutofill="no"
            />
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TextInput
              ref={bindCommandField}
              // Why: Android caches IME inputType at mount, so toggling autocomplete must remount there; iOS updates in place.
              key={
                hostOs() === 'android'
                  ? autocompleteEnabled
                    ? 'cmd-input-ac-on'
                    : 'cmd-input-ac-off'
                  : 'cmd-input'
              }
              style={styles.textInput}
              value={bufferedTerminalDraftState.input}
              // Why: iOS kills active dictation/IME if JS writes a value differing from native text; store raw, normalize at send.
              onChangeText={bufferedTerminalDraftState.setInput}
              placeholder="Type a command…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={autocompleteEnabled}
              spellCheck={autocompleteEnabled}
              smartInsertDelete={false}
              // Why: not autofill content, but keyboard must stay default so non-Latin IMEs remain selectable.
              autoComplete="off"
              keyboardType={getTerminalCommandKeyboardType(hostOs(), autocompleteEnabled)}
              returnKeyType="send"
              blurOnSubmit={false}
              // Why: composing is local — an outage must not lock the field or discard typed text (#6713).
              editable={canCompose}
              onSubmitEditing={() => void handleSend()}
            />
            <MobileSessionTerminalInputActions controller={controller} />
            <Pressable
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              disabled={!canSend}
              onPress={() => void handleSend()}
              accessibilityLabel="Send command"
            >
              <ArrowUp size={18} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        )}
      </View>
    )
  )
}
