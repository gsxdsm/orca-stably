import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createSharedChunkLoad, type ChunkRequest } from '@/app-shell/startup/shared-chunk-load'
import type { StarNagToast } from './StarNagToast'

const ORCA_REPO_URL = 'https://github.com/stablyai/orca'

// Why load before issuing: the toaster sizes a toast from its first render, and a Suspense fallback
// measures 0px, which drops the hovered card below its anchor and makes it flicker.
const requestStarNagToast = createSharedChunkLoad(
  () => import('./StarNagToast').then((module) => ({ default: module.StarNagToast })),
  'star-nag-toast'
)

export function StarNagToastHost(): null {
  const activeToastIdRef = useRef<string | number | null>(null)
  const activeToastResolvedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // The show still waiting for its chunk; a hide, a newer show or unmount abandons it.
    let pendingRequest: ChunkRequest<typeof StarNagToast> | null = null
    const dismissActiveToast = (): void => {
      pendingRequest?.release()
      pendingRequest = null
      if (activeToastIdRef.current === null) {
        return
      }
      activeToastResolvedRef.current?.()
      toast.dismiss(activeToastIdRef.current)
    }
    const unsubscribeShow = window.api.starNag.onShow((payload) => {
      if (payload?.surface !== 'toast') {
        return
      }
      dismissActiveToast()
      const request = requestStarNagToast()
      pendingRequest = request
      void request.loaded
        .then(({ default: StarNagToast }) => {
          if (pendingRequest !== request) {
            return
          }
          pendingRequest = null
          let resolved = false
          let dismissSuppressed = false
          const markResolved = (): void => {
            resolved = true
          }
          const setDismissSuppressed = (suppressed: boolean): void => {
            dismissSuppressed = suppressed
          }
          activeToastResolvedRef.current = markResolved
          const id = toast.custom(
            (toastId) => (
              <StarNagToast
                id={toastId}
                mode={payload.mode === 'web' ? 'web' : 'gh'}
                openRepoUrl={() => window.api.shell.openUrl(ORCA_REPO_URL)}
                markResolved={markResolved}
                setDismissSuppressed={setDismissSuppressed}
              />
            ),
            {
              duration: Infinity,
              closeButton: false,
              dismissible: false,
              unstyled: true,
              onDismiss: () => {
                if (activeToastIdRef.current === id) {
                  activeToastIdRef.current = null
                  activeToastResolvedRef.current = null
                }
                if (!resolved && !dismissSuppressed) {
                  void window.api.starNag.dismiss()
                }
              },
              onAutoClose: () => {
                if (activeToastIdRef.current === id) {
                  activeToastIdRef.current = null
                  activeToastResolvedRef.current = null
                }
              }
            }
          )
          activeToastIdRef.current = id
        })
        .catch((error: unknown) => {
          console.warn('[star-nag] onboarding toast failed to load:', error)
        })
        .finally(request.release)
    })
    const unsubscribeHide = window.api.starNag.onHide(dismissActiveToast)
    return () => {
      unsubscribeShow()
      unsubscribeHide()
      // Dismiss infinite-lived toasts on unmount so their React tree and callbacks cannot outlive this host.
      dismissActiveToast()
      activeToastIdRef.current = null
      activeToastResolvedRef.current = null
    }
  }, [])

  return null
}
