import { useState, type RefObject } from 'react'
import type { TextInput } from 'react-native'
import {
  MobileNativeChatSessionOptionPickers,
  type MobileNativeChatPickerPresentation,
  type MobileNativeChatSessionOptionPickersProps
} from '../input/MobileNativeChatSessionOptionPickers'

/** Owns which session-option page is open, including a page the host asked to open. */
export function MobileNativeChatComposerSessionPickers({
  sessionOptions,
  sendInFlight,
  focused,
  fieldRef
}: {
  sessionOptions: MobileNativeChatSessionOptionPickersProps
  sendInFlight: boolean
  focused: boolean
  fieldRef: RefObject<TextInput | null>
}): React.JSX.Element {
  const [picker, setPicker] = useState<MobileNativeChatPickerPresentation | null>(null)
  const request = sessionOptions.controller.optionPickerRequest
  const [lastRequest, setLastRequest] = useState(request)
  if (request && lastRequest !== request) {
    setLastRequest(request)
    setPicker({ page: request.id, refocus: false })
  }
  return (
    <MobileNativeChatSessionOptionPickers
      {...sessionOptions}
      sendInFlight={sendInFlight}
      presentation={picker}
      onNavigate={(page) => setPicker((current) => current && { ...current, page })}
      onDrawerOpen={(page) => setPicker({ page, refocus: focused })}
      onDrawerAfterClose={() => {
        if (picker?.refocus) {
          fieldRef.current?.focus()
        }
        setPicker(null)
      }}
    />
  )
}
