import { useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Platform, View, type HostInstance } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { tuiAgentDisplayName } from '../../../src/shared/agent-launch/catalog/tui-agent-display-names'
import { MessageBox } from '../components/composer-input/MessageBox'
import { MobileNativeChatStopButton } from './native-chat/input/MobileNativeChatStopButton'
import {
  isMobileTerminalTabRunningAgent,
  resolveMobileTerminalTabOwnedAgentId
} from './tabs/mobile-terminal-tab-agent'
import { composerInputStylesSheet } from '../components/composer-input/composer-input-styles'
import { TextField } from '../components/composer-input/TextField'
import { MobileTerminalLiveInputStatus } from '../terminal/session/input-controls/MobileTerminalLiveInputStatus'
import {
  MobileTerminalInputActions,
  MobileTerminalLeadingButton
} from '../terminal/session/input-controls/MobileTerminalInputActions'
import { MobileSessionAccessoryKeys } from '../terminal/session/accessory-keys/MobileSessionAccessoryKeys'
import { MobileTerminalMoreKeysSheet } from '../terminal/session/accessory-keys/MobileTerminalMoreKeysSheet'
import { sessionCommandDockShown } from './mobile-session-command-dock-shown'
import { useSessionTerminalKeyRail } from '../terminal/session/accessory-keys/use-session-terminal-key-rail'
import { terminalDockStylesSheet } from '../terminal/session/accessory-keys/terminal-dock-styles'
import { useThemedStyles } from '../theme/themed-styles'
import { SHEET_CURVE } from '../components/motion/sheet-motion-values'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { MobileSessionController } from './use-mobile-session-controller'
import { useMobileSessionKeyboardLift } from '../terminal/session/input-controls/use-mobile-session-keyboard-lift'
import { useLiveInputCaptureText } from '../terminal/session/input-controls/live-input-capture'
import { useKeyboardPersistingTaps } from '../platform/keyboard/keyboard-persisting-taps'
import { MobileDictationLiveContext } from '../dictation/mobile-dictation-live-context'

// Native iOS reports the lift as the keyboard starts its 250 ms move; Android and the page (even on an iPhone) report it once it has landed.
const IOS_KEYBOARD_MOTION_MS = 250

const ESC = '\x1b'

// The key row above the input: Keys types straight into the terminal, Message writes a line and sends it.
export function MobileSessionCommandDock({ controller }: { controller: MobileSessionController }) {
  const inputStyles = useThemedStyles(composerInputStylesSheet)
  const dockStyles = useThemedStyles(terminalDockStylesSheet)
  const rail = useSessionTerminalKeyRail(controller)
  const live = useContext(MobileDictationLiveContext)
  const keyboardLift = useMobileSessionKeyboardLift(controller.dockBottomInset)
  // Ride the keyboard's curve instead of jumping to where it will stop.
  const lift = useSharedValue(keyboardLift)
  useEffect(() => {
    lift.value = withTiming(keyboardLift, {
      duration: Platform.OS === 'ios' ? IOS_KEYBOARD_MOTION_MS : 0,
      easing: Easing.bezier(...SHEET_CURVE)
    })
  }, [keyboardLift, lift])
  // The page build has no worklet plugin, so the style names what it reads.
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }), [lift])
  // The field's ✕, which the held mic may be released over.
  const dictationCancelRef = useRef<HostInstance>(null)
  // The mic and attach buttons keep the field focused, like the key row: a closing keyboard ends a held mic.
  const keepsKeyboard = useKeyboardPersistingTaps('always')
  const {
    insets,
    dictationMode,
    dictationEnabled,
    canSend,
    dictation,
    liveDictationText,
    cancelDictation,
    handleDictationToggle,
    handleDictationPressIn,
    handleDictationPressOut,
    isAttaching,
    attachImage,
    terminalMessageMode,
    liveInputRef,
    messageInputRef,
    messageDictationText
  } = controller
  useLayoutEffect(() => {
    // Switching to a terminal in the other mode moves the keyboard to the field that is shown.
    const hidden = terminalMessageMode ? liveInputRef : messageInputRef
    if (hidden.current?.isFocused()) {
      ;(terminalMessageMode ? messageInputRef : liveInputRef).current?.focus()
    }
  }, [liveInputRef, messageInputRef, terminalMessageMode])
  if (!sessionCommandDockShown(controller)) {
    return null
  }
  const leadingButton = (
    <MobileTerminalLeadingButton
      canSend={canSend}
      isAttaching={isAttaching}
      keyboardUp={keyboardLift > 0}
      dictating={
        dictation.isStarting ||
        dictation.isRecording ||
        dictation.isProcessing ||
        live?.failureReason != null
      }
      buttonStyle={inputStyles.controlButton}
      disabledButtonStyle={inputStyles.disabled}
      onAttachImage={() => void attachImage('library')}
      onAttachFile={() => void attachImage('files')}
      onDismissKeyboard={controller.dismissSoftwareKeyboard}
    />
  )
  const inputActions = (
    <MobileTerminalInputActions
      canSend={canSend}
      dictation={dictation}
      dictationMode={dictationMode}
      dictationEnabled={dictationEnabled}
      buttonStyle={inputStyles.controlButton}
      dictationCancelRef={dictationCancelRef}
      disabledButtonStyle={inputStyles.disabled}
      onDictationToggle={handleDictationToggle}
      onDictationPressIn={handleDictationPressIn}
      onDictationPressOut={handleDictationPressOut}
      onDictationCancel={cancelDictation}
    />
  )
  const shown = (visible: boolean) => ({
    style: visible ? undefined : dockStyles.hiddenField,
    pointerEvents: visible ? ('auto' as const) : ('none' as const),
    'aria-hidden': !visible,
    accessibilityElementsHidden: !visible,
    importantForAccessibility: visible ? ('auto' as const) : ('no-hide-descendants' as const)
  })
  return (
    <Animated.View style={[dockStyles.dock, { paddingBottom: insets.bottom }, liftStyle]}>
      <MobileTerminalMoreKeysSheet
        controller={controller}
        visible={rail.moreKeysVisible}
        besideRail={rail.keysInRail}
        onClose={rail.closeMoreKeys}
      />
      {rail.keysInRail ? null : (
        <MobileSessionAccessoryKeys controller={controller} onMoreKeys={rail.openMoreKeys} />
      )}
      <View>
        <View {...shown(!terminalMessageMode)}>
          <View ref={keepsKeyboard} style={dockStyles.inputBar}>
            {terminalMessageMode ? null : leadingButton}
            <LiveInputField
              controller={controller}
              trailing={
                <MobileTerminalLiveInputStatus
                  dictation={dictation}
                  cancelRef={dictationCancelRef}
                  dictationMode={dictationMode}
                  heard={liveDictationText}
                  isAttaching={isAttaching}
                />
              }
            />
            {terminalMessageMode ? null : inputActions}
          </View>
        </View>
        <View {...shown(terminalMessageMode)}>
          <TerminalMessageField
            controller={controller}
            leading={terminalMessageMode ? leadingButton : null}
            actions={terminalMessageMode ? inputActions : null}
            status={
              <MobileTerminalLiveInputStatus
                dictation={dictation}
                cancelRef={dictationCancelRef}
                dictationMode={dictationMode}
                heard={messageDictationText}
                isAttaching={isAttaching}
              />
            }
          />
        </View>
      </View>
    </Animated.View>
  )
}

// Message mode: a line written here goes to the terminal with Enter when Send is tapped.
function TerminalMessageField({
  controller,
  leading,
  actions,
  status
}: {
  controller: MobileSessionController
  leading: ReactNode
  actions: ReactNode
  status: ReactNode
}) {
  const dockStyles = useThemedStyles(terminalDockStylesSheet)
  const t = useMobileTranslation()
  const {
    activeHandle,
    activeSessionTab,
    canCompose,
    canSend,
    terminalMessageMode,
    terminalDraft,
    setTerminalDraft,
    messageInputRef,
    handleSendTerminalMessage,
    handleAccessoryKey,
    dockKeys
  } = controller
  const terminalTab = activeSessionTab?.type === 'terminal' ? activeSessionTab : null
  const runsAgent = terminalTab !== null && isMobileTerminalTabRunningAgent(terminalTab)
  const agentId =
    terminalTab && runsAgent ? resolveMobileTerminalTabOwnedAgentId(terminalTab) : null
  const agentName = agentId ? tuiAgentDisplayName(agentId) : null
  const showStop =
    runsAgent && terminalTab?.agentStatus?.state === 'working' && terminalDraft.trim().length === 0
  return (
    <MessageBox
      inputRef={messageInputRef}
      monospace={!runsAgent}
      style={dockStyles.composer}
      value={terminalDraft}
      onChangeText={(text) => {
        if (!activeHandle) {
          return
        }
        if (!dockKeys.interceptTypedCharacter(terminalDraft, text, messageInputRef)) {
          setTerminalDraft(activeHandle, text)
        }
      }}
      placeholder={
        runsAgent
          ? t('session.commandDock.messageAgentPlaceholder', 'Message {{agent}}', {
              agent: agentName ?? t('session.commandDock.theAgent', 'the agent')
            })
          : t('session.commandDock.writeCommandPlaceholder', 'Write a command, then send')
      }
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      smartInsertDelete={false}
      // Why: not autofill content, but keyboard must stay default so non-Latin IMEs remain selectable.
      autoComplete="off"
      keyboardType="default"
      // Composing is local, so an outage must not lock the field or drop typed text.
      editable={canCompose}
      tabIndex={terminalMessageMode ? 0 : -1}
      leading={leading}
      middle={<View style={dockStyles.composerStatus}>{status}</View>}
      trailing={
        <>
          {actions}
          {showStop ? (
            <MobileNativeChatStopButton
              held={false}
              onStop={() => void handleAccessoryKey({ bytes: ESC })}
            />
          ) : null}
        </>
      }
      onSend={showStop ? undefined : () => void handleSendTerminalMessage()}
      canSend={canSend && terminalDraft.trim().length > 0}
      sendAccessibilityLabel={t('session.commandDock.sendCommand', 'Send command')}
    />
  )
}

// Only this field reads the typed text, so a keystroke re-renders it and not the dock or session.
function LiveInputField({
  controller,
  trailing
}: {
  controller: MobileSessionController
  trailing: ReactNode
}) {
  const inputStyles = useThemedStyles(composerInputStylesSheet)
  const dockStyles = useThemedStyles(terminalDockStylesSheet)
  const t = useMobileTranslation()
  const {
    liveInputCapture,
    handleLiveInputChange,
    handleLiveInputKeyPress,
    bindLiveInputField,
    liveInputRef,
    submitLiveInput,
    canSend,
    dockKeys
  } = controller
  const text = useLiveInputCaptureText(liveInputCapture)
  return (
    <TextField
      inputRef={bindLiveInputField}
      monospace
      style={[inputStyles.filledField, dockStyles.liveField]}
      trailing={trailing}
      value={text}
      onChange={(event) => {
        // A held Shift, Ctrl or Alt on the key row or the Duo rail turns the next typed letter into a combo.
        if (!dockKeys.interceptTypedCharacter(text, event.nativeEvent.text, liveInputRef)) {
          handleLiveInputChange(event)
        }
      }}
      onKeyPress={handleLiveInputKeyPress}
      onSubmitEditing={submitLiveInput}
      placeholder={t('session.commandDock.typeIntoTerminal', 'Type into terminal')}
      accessibilityLabel={t('session.commandDock.liveInputLabel', 'Live terminal input')}
      accessibilityHint={t(
        'session.commandDock.liveInputHint',
        'Typed text is sent directly to the active terminal'
      )}
      showSoftInputOnFocus
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      smartInsertDelete={false}
      // Why: iOS textContentType overrides autoComplete and can narrow the keyboard; keep IME switching available.
      autoComplete="off"
      // Why: ASCII-only keyboard types hide non-Latin IMEs.
      keyboardType="default"
      returnKeyType="default"
      blurOnSubmit={false}
      editable={canSend}
      importantForAutofill="no"
    />
  )
}
