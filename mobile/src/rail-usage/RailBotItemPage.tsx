import type { BotItem } from '../../../src/shared/bots/bot-items'
import type { BotChatTreeWorker } from '../../../src/shared/bots/bot-chat-tree'
import { botHomeWorktreeId } from '../bots/host-bots-read'
import { openBotItemFile } from '../bots/items/bot-item-file-open'
import { MobileBotItemPage } from '../bots/items/MobileBotItemPage'
import type { BotItemSheet } from '../bots/items/MobileBotItemSheets'
import type { PhoneBotItemStepper } from '../bots/items/use-phone-bot-item-walk'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useRouteHandoff } from '../navigation/route-handoff'
import { TargetHostGatesProvider } from './RailBotItemTargetHost'
import type { RailBotTarget } from './rail-bot-targets'

/** The rail sheet's open item, still on the host it was opened from after its list page moves. */
export function RailBotItemPage({
  shown,
  target,
  reads,
  showToast,
  onBack,
  setSheet,
  onOpenChat,
  onOpenWorker,
  onClose,
  onCommentBoxHeight
}: {
  shown: { uid: string; stepper: PhoneBotItemStepper | null }
  target: RailBotTarget
  reads: number
  showToast: (message: string) => void
  onBack: () => void
  setSheet: (sheet: BotItemSheet) => void
  onOpenChat: (item: BotItem) => void
  onOpenWorker: (worker: BotChatTreeWorker) => void
  onClose: () => void
  onCommentBoxHeight: (height: number) => void
}): React.JSX.Element {
  const t = useMobileTranslation()
  const router = useRouteHandoff()
  return (
    <TargetHostGatesProvider target={target}>
      <MobileBotItemPage
        key={shown.uid}
        {...shown}
        client={target.client}
        hostKey={target.hostKey}
        hostId={target.pairedHostId}
        bot={target.bot}
        showToast={showToast}
        reads={reads}
        online={target.online}
        hostName={target.hostName}
        onBack={onBack}
        setSheet={setSheet}
        onOpenChat={onOpenChat}
        onOpenWorker={onOpenWorker}
        onOpenFile={(path) =>
          openBotItemFile({
            path,
            router,
            hostId: target.pairedHostId,
            worktreeId: botHomeWorktreeId(target.bot),
            t,
            toast: showToast,
            onRequestClose: onClose
          })
        }
        onCommentBoxHeight={onCommentBoxHeight}
      />
    </TargetHostGatesProvider>
  )
}
