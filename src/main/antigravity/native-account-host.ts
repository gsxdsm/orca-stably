import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import type { AntigravityAccountTarget } from '../../shared/agent-accounts/antigravity/antigravity-account-types'
import {
  createEncryptedAntigravityAccountStore,
  type AntigravityAccountStore
} from './native-account-store'
import type { AntigravityNativeCredential } from './native-credential-codec'
import { AGY_HOST_SELECTION } from './agy-account-selection'
import { credentialFileExists } from '../credentials/credential-file-io'
import { createAntigravityHostCredentialBackend } from './native-credential-backend'
import { createAntigravityWslCredentialBackend } from './native-wsl-credentials'
import { resolveWslDefaultDistro } from '../wsl/discovery/wsl-default-distro'
import {
  AntigravityAccountService,
  type AntigravityCredentialBackend,
  type AntigravityLaunchRestore
} from './native-account-service'
import { antigravitySignInHoldsNativeLogin } from './antigravity-chat-sign-in'
import { isSameAntigravityLogin } from './native-account-usage-reading'
import type { RateLimitRuntimeTarget } from '../../shared/agent-usage/rate-limits/rate-limit-types'
import { ANTIGRAVITY_USAGE_HOST_TARGET } from '../rate-limits/providers/antigravity/antigravity-account-usage'

let service: AntigravityAccountService | null = null
const wslServices = new Map<string, AntigravityAccountService>()
let credentialChangeListener: () => void = () => {}

export function setAntigravityNativeCredentialChangeListener(listener: () => void): void {
  credentialChangeListener = listener
}

// The first read is a baseline: what agy held before Orca looked is unknown.
// agy's own token refreshes keep the refresh token and must not discard the usage they produce;
// a new refresh token is a fresh sign-in, even to the same account, and must clear a sign-in hold.
function reportingCredentialChanges(
  backend: AntigravityCredentialBackend
): AntigravityCredentialBackend {
  let lastSeen: AntigravityNativeCredential | null | undefined
  return {
    ...backend,
    async read() {
      const current = await backend.read()
      if (
        current &&
        lastSeen !== undefined &&
        (lastSeen === null ||
          lastSeen.refreshToken !== current.refreshToken ||
          !isSameAntigravityLogin(lastSeen, current))
      ) {
        credentialChangeListener()
      }
      lastSeen = current
      return current
    }
  }
}

export function getAntigravityAccountVaultPath(wslDistro?: string): string {
  const root = join(getAppEnvironment().getPath('userData'), 'antigravity-accounts')
  // Each distro keeps its own saved accounts, matching its own agy login.
  return wslDistro
    ? join(root, `wsl-${encodeURIComponent(wslDistro.trim().toLowerCase())}`, 'vault')
    : join(root, 'vault')
}

function createService(
  backend: AntigravityCredentialBackend,
  vaultPath: string,
  target: RateLimitRuntimeTarget = ANTIGRAVITY_USAGE_HOST_TARGET,
  host?: { launchRestore?: AntigravityLaunchRestore }
) {
  const reporting = reportingCredentialChanges(backend)
  const store = createEncryptedAntigravityAccountStore(vaultPath, reporting.parse)
  const launchRestore = host?.launchRestore
  return new AntigravityAccountService(
    // The host's chats launch on its selected account, so every read and write of it is noted.
    host ? notingSelection(store) : store,
    reporting,
    undefined,
    undefined,
    launchRestore,
    target
  )
}

function notingSelection(store: AntigravityAccountStore): AntigravityAccountStore {
  return {
    read: async () => {
      const vault = await store.read()
      AGY_HOST_SELECTION.note(vault)
      return vault
    },
    write: async (vault) => {
      await store.write(vault)
      AGY_HOST_SELECTION.note(vault)
    }
  }
}

// A chat start reads the selection before any account work did.
AGY_HOST_SELECTION.readWith(async () => {
  if (await credentialFileExists(getAntigravityAccountVaultPath())) {
    await (await getAntigravityAccountService({ runtime: 'host' })).readSelection()
  } else {
    AGY_HOST_SELECTION.note({ selectedAccountId: null, accounts: [] })
  }
})

async function resolveWslAccountDistro(wslDistro: string | null | undefined): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Antigravity accounts in a WSL distro are only available on Windows.')
  }
  const distro = wslDistro?.trim() || (await resolveWslDefaultDistro())
  if (typeof distro !== 'string' || !distro) {
    throw new Error('Orca could not determine the default WSL distro for Antigravity accounts.')
  }
  return distro
}

export async function getAntigravityAccountService(
  target: AntigravityAccountTarget
): Promise<AntigravityAccountService> {
  if (target.runtime === 'wsl') {
    const distro = await resolveWslAccountDistro(target.wslDistro)
    const key = distro.toLowerCase()
    let wslService = wslServices.get(key)
    if (!wslService) {
      wslService = createService(
        createAntigravityWslCredentialBackend(distro),
        getAntigravityAccountVaultPath(distro),
        { runtime: 'wsl', wslDistro: distro }
      )
      wslServices.set(key, wslService)
    }
    return wslService
  }
  if (target.wslDistro) {
    throw new Error('An Antigravity host account target cannot name a WSL distro.')
  }
  service ??= createService(
    createAntigravityHostCredentialBackend(getAppEnvironment().getPath('home')),
    getAntigravityAccountVaultPath(),
    ANTIGRAVITY_USAGE_HOST_TARGET,
    // Windows launches aren't gated (native-account-launch.ts), so nothing restores there.
    process.platform === 'win32'
      ? {}
      : { launchRestore: { signInHoldsLogin: antigravitySignInHoldsNativeLogin } }
  )
  return service
}
