import {
  GOOGLE_BOT_ACCOUNTS_RUNTIME_CAPABILITY,
  GOOGLE_CONNECT_RUNTIME_CAPABILITY,
  GOOGLE_CONNECTED_ANSWER_RUNTIME_CAPABILITY,
  GOOGLE_SETUP_NEW_APP_RUNTIME_CAPABILITY,
  GOOGLE_TRIGGERS_RUNTIME_CAPABILITY
} from '../../shared/google/google-connect-types'
import type { GoogleConnect } from './google-connect'

export type GoogleConnectSource = GoogleConnect | (() => Promise<GoogleConnect>)

let installedSource: GoogleConnectSource | null = null
let resolvedInstance: GoogleConnect | null = null
let loadingPromise: Promise<GoogleConnect | null> | null = null
let generation = 0

/** One per host process; the runtime advertises google.connect only once installed. */
export function installGoogleConnect(connect: GoogleConnectSource | null): void {
  generation += 1
  resolvedInstance = typeof connect === 'function' ? null : connect
  installedSource = connect
  loadingPromise = null
}

export function getGoogleConnect(): GoogleConnect | null {
  return resolvedInstance
}

export function resolveGoogleConnect(): Promise<GoogleConnect | null> {
  if (resolvedInstance) {
    return Promise.resolve(resolvedInstance)
  }
  const source = installedSource
  if (!source) {
    return Promise.resolve(null)
  }
  if (typeof source !== 'function') {
    resolvedInstance = source
    return Promise.resolve(source)
  }
  if (!loadingPromise) {
    const loadGeneration = generation
    const loading = source()
      .then((instance) => {
        if (generation !== loadGeneration) {
          return resolvedInstance
        }
        resolvedInstance = instance
        return instance
      })
      .catch((error) => {
        if (loadingPromise === loading) {
          loadingPromise = null
        }
        throw error
      })
    loadingPromise = loading
  }
  return loadingPromise
}

export function googleRuntimeCapabilities(): string[] {
  return installedSource
    ? [
        GOOGLE_CONNECT_RUNTIME_CAPABILITY,
        GOOGLE_TRIGGERS_RUNTIME_CAPABILITY,
        GOOGLE_CONNECTED_ANSWER_RUNTIME_CAPABILITY,
        GOOGLE_SETUP_NEW_APP_RUNTIME_CAPABILITY,
        GOOGLE_BOT_ACCOUNTS_RUNTIME_CAPABILITY
      ]
    : []
}
