import { useCallback, useState } from 'react'
import type { MobileWebShellSession } from './mobile-web-shell-session-contract'

/** Page-ready and document-loaded live beside session state, so React has to store them to rerender. */
export function useShellDocumentFacts(session: MobileWebShellSession): {
  pageReady: boolean
  documentLoaded: boolean
  projectFacts: (session: MobileWebShellSession) => void
} {
  const [pageReady, setPageReady] = useState(session.pageReady)
  const [documentLoaded, setDocumentLoaded] = useState(session.documentLoaded)
  const projectFacts = useCallback((next: MobileWebShellSession) => {
    setPageReady(next.pageReady)
    setDocumentLoaded(next.documentLoaded)
  }, [])
  return { pageReady, documentLoaded, projectFacts }
}

/** Increments when a loaded document closes so reports from an earlier document in the same session are retired. */
export function useDocumentReportEpoch(documentOpen: boolean): number {
  const [epoch, setEpoch] = useState(0)
  const [wasOpen, setWasOpen] = useState(documentOpen)
  if (wasOpen !== documentOpen) {
    setWasOpen(documentOpen)
    if (wasOpen && !documentOpen) {
      setEpoch((value) => value + 1)
    }
  }
  return epoch
}
