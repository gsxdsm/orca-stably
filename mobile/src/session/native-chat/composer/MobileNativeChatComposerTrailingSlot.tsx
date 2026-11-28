import type { ComponentProps, ReactNode } from 'react'
import { MobileNativeChatActionGap } from './MobileNativeChatActionGap'
import { MobileNativeChatComposerSendSlot } from './delivery/MobileNativeChatComposerSendSlot'
import { MobileNativeChatEditActions } from './field/MobileNativeChatEditActions'
import type { MobileNativeChatComposerProps } from './mobile-native-chat-composer-props'

type SendSlotProps = ComponentProps<typeof MobileNativeChatComposerSendSlot>

export function MobileNativeChatComposerTrailingSlot({
  collapsed,
  editSession,
  widthToggle,
  mic,
  ...sendSlotProps
}: SendSlotProps & {
  collapsed: boolean
  editSession: MobileNativeChatComposerProps['editSession']
  widthToggle: MobileNativeChatComposerProps['widthToggle']
  mic: ReactNode
}): React.JSX.Element {
  return (
    <>
      {/* The pill's field lies over the row's middle, so the meter and toggle wait for the full form. */}
      {collapsed ? null : (
        <MobileNativeChatActionGap
          agent={editSession ? null : sendSlotProps.agent}
          toggle={widthToggle}
        />
      )}
      {editSession ? (
        <>
          {mic}
          <MobileNativeChatEditActions
            canSave={sendSlotProps.canSend}
            saving={sendSlotProps.sending}
            onCancel={editSession.cancel}
            onSave={() => sendSlotProps.onSend()}
          />
        </>
      ) : (
        <MobileNativeChatComposerSendSlot {...sendSlotProps} mic={mic} />
      )}
    </>
  )
}
