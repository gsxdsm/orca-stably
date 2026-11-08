import { useLayoutEffect, type ReactNode } from 'react'
import { View } from 'react-native'
import { tuiAgentDisplayName } from '../../../src/shared/agent-launch/catalog/tui-agent-display-names'
import { MessageBox } from '../components/composer-input/MessageBox'
import { MobileNativeChatStopButton } from './native-chat/input/MobileNativeChatStopButton'
import {
  isMobileTerminalTabRunningAgent,
  resolveMobileTerminalTabOwnedAgentId
} from './mobile-terminal-tab-agent'
import { Keyboard as KeyboardIcon } from 'lucide-react-native'
import { composerInputStyles as inputStyles } from '../components/composer-input/composer-input-styles'
import { TextField } from '../components/composer-input/TextField'
import { MobileTerminalLiveInputStatus } from './MobileTerminalLiveInputStatus'
import { MobileTerminalInputActions } from './MobileTerminalInputActions'
import { MobileSessionAccessoryKeys } from './MobileSessionAccessoryKeys'
import { MobileTerminalMoreKeysSheet } from './MobileTerminalMoreKeysSheet'
import { sessionCommandDockShown } from './mobile-session-command-dock-shown'
import { useSessionTerminalKeyRail } from './use-session-terminal-key-rail'
import { terminalDockStyles as dockStyles } from './terminal-dock-styles'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { styles } from './mobile-session-styles'
import type { MobileSessionController } from './use-mobile-session-controller'
import { useMobileSessionKeyboardLift } from './use-mobile-session-keyboard-lift'
import { useLiveInputCaptureText } from './live-input-capture'

const ESC = '\x1b'

// The key row above the input: Keys types straight into the terminal, Message writes a line and sends it.
export function MobileSessionCommandDock({ controller }: { controller: MobileSessionController }) {
  useMobileColorScheme()
  const rail = useSessionTerminalKeyRail(controller)
  const keyboardLift = useMobileSessionKeyboardLift(controller.dockBottomInset)
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
  const inputActions = (
    <MobileTerminalInputActions
      canSend={canSend}
      isAttaching={isAttaching}
      dictation={dictation}
      dictationMode={dictationMode}
      dictationEnabled={dictationEnabled}
      buttonStyle={inputStyles.controlButton}
      activeButtonStyle={styles.dictationButtonActive}
      disabledButtonStyle={inputStyles.disabled}
      onAttachImage={() => void attachImage('library')}
      onAttachFile={() => void attachImage('files')}
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
    <View
      style={[
        dockStyles.dock,
        { paddingBottom: insets.bottom, transform: [{ translateY: -keyboardLift }] }
      ]}
    >
      {rail.keysInRail ? (
        <MobileTerminalMoreKeysSheet
          controller={controller}
          visible={rail.moreKeysVisible}
          onClose={rail.closeMoreKeys}
        />
      ) : (
        <MobileSessionAccessoryKeys controller={controller} />
      )}
      <View>
        <View {...shown(!terminalMessageMode)}>
          <View style={dockStyles.inputBar}>
            <LiveInputField
              controller={controller}
              keysInRail={rail.keysInRail}
              trailing={
                <MobileTerminalLiveInputStatus
                  dictation={dictation}
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
            keysInRail={rail.keysInRail}
            actions={terminalMessageMode ? inputActions : null}
            status={
              <MobileTerminalLiveInputStatus
                dictation={dictation}
                dictationMode={dictationMode}
                heard={messageDictationText}
                isAttaching={isAttaching}
              />
            }
          />
        </View>
      </View>
    </View>
  )
}

// Message mode: a line written here goes to the terminal with Enter when Send is tapped.
function TerminalMessageField({
  controller,
  keysInRail,
  actions,
  status
}: {
  controller: MobileSessionController
  keysInRail: boolean
  actions: ReactNode
  status: ReactNode
}) {
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
        if (
          !keysInRail ||
          !dockKeys.interceptTypedCharacter(terminalDraft, text, messageInputRef)
        ) {
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
  keysInRail,
  trailing
}: {
  controller: MobileSessionController
  keysInRail: boolean
  trailing: ReactNode
}) {
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
      style={dockStyles.liveField}
      leading={<KeyboardIcon size={17} color={colors.textSecondary} strokeWidth={2} />}
      label={t('session.terminalLiveInputStatus.liveInput', 'Live input')}
      trailing={trailing}
      value={text}
      onChange={(event) => {
        // A ctrl/alt/shift held on the Duo rail turns the next typed letter into a combo, while the rail shows it.
        if (
          !keysInRail ||
          !dockKeys.interceptTypedCharacter(text, event.nativeEvent.text, liveInputRef)
        ) {
          handleLiveInputChange(event)
        }
      }}
      onKeyPress={handleLiveInputKeyPress}
      onSubmitEditing={submitLiveInput}
      placeholder={t('session.commandDock.tapToShowKeyboard', 'Tap to show keyboard')}
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
