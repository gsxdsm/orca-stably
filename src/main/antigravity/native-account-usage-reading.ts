import type {
  AntigravityAccountState,
  AntigravityAccountSummary
} from '../../shared/agent-accounts/antigravity/antigravity-account-types'
import type {
  AntigravityAccountUsage,
  ProviderRateLimits,
  RateLimitRuntimeTarget
} from '../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  ANTIGRAVITY_USAGE_HOST_TARGET,
  isSameRuntimeTarget,
  type AntigravityUsageLogin,
  type AntigravityUsageReadFinish,
  type AntigravityUsageReadStart
} from '../rate-limits/providers/antigravity/antigravity-account-usage'
import type {
  AntigravityAccountStore,
  AntigravityAccountVault,
  StoredAntigravityAccount,
  StoredAntigravityUsage
} from './native-account-store'
import type { AntigravityNativeCredential } from './native-credential-codec'

export { ANTIGRAVITY_USAGE_HOST_TARGET }
export type {
  AntigravityUsageLogin,
  AntigravityUsageReadFinish,
  AntigravityUsageReadStart,
  ProviderRateLimits,
  RateLimitRuntimeTarget
}

type AccountMatches = (
  account: StoredAntigravityAccount,
  current: AntigravityNativeCredential
) => boolean
type ReconcileFn = () => Promise<{
  vault: AntigravityAccountVault
  current: AntigravityNativeCredential | null
}>

// agy's token refresh drops the id_token but keeps the grant's refresh token.
export function isSameAntigravityLogin(
  left: AntigravityNativeCredential,
  right: AntigravityNativeCredential
): boolean {
  if (left.authMethod !== right.authMethod) {
    return false
  }
  if (left.identity && right.identity) {
    return left.identity.subject === right.identity.subject
  }
  if (left.refreshToken && right.refreshToken) {
    return left.refreshToken === right.refreshToken
  }
  return left.contents === right.contents
}

export function antigravityUsageLogin(
  account: StoredAntigravityAccount | undefined,
  current: AntigravityNativeCredential
): AntigravityUsageLogin {
  // A saved account keeps its subject across refreshes that drop the id_token.
  const subject = current.identity?.subject ?? account?.subject
  return {
    key: `${current.authMethod}\n${subject ?? current.refreshToken ?? current.contents}`,
    accountId: account?.id ?? null,
    email: current.identity?.email ?? account?.email ?? null
  }
}

export function storedAntigravityReading(
  account: StoredAntigravityAccount,
  target: RateLimitRuntimeTarget
): ProviderRateLimits | null {
  return (
    account.usage?.find((entry) => isSameRuntimeTarget(entry.target, target))?.rateLimits ?? null
  )
}

export function withStoredAntigravityReading(
  account: StoredAntigravityAccount,
  target: RateLimitRuntimeTarget,
  rateLimits: ProviderRateLimits
): StoredAntigravityUsage[] {
  return [
    ...(account.usage ?? []).filter((entry) => !isSameRuntimeTarget(entry.target, target)),
    { target, rateLimits }
  ]
}

export function antigravityAccountsUsage(
  vault: AntigravityAccountVault,
  current: AntigravityNativeCredential | null,
  target: RateLimitRuntimeTarget,
  matches: AccountMatches
): AntigravityAccountUsage[] {
  return vault.accounts.map((account) => ({
    accountId: account.id,
    email: account.email,
    active: current !== null && matches(account, current),
    rateLimits: storedAntigravityReading(account, target)
  }))
}

export function antigravityAccountSummariesWithUsage(
  accounts: StoredAntigravityAccount[],
  target: RateLimitRuntimeTarget
): AntigravityAccountSummary[] {
  return accounts.map((account) => {
    const { credentials: _credentials, usage: _usage, ...summary } = account
    return { ...summary, usage: storedAntigravityReading(account, target) }
  })
}

export function withAntigravityAccountUsage(
  state: AntigravityAccountState,
  vault: AntigravityAccountVault,
  target: RateLimitRuntimeTarget
): AntigravityAccountState {
  return { ...state, accounts: antigravityAccountSummariesWithUsage(vault.accounts, target) }
}

export async function runAntigravityBeginUsageRead(
  store: AntigravityAccountStore,
  target: RateLimitRuntimeTarget,
  reconcile: ReconcileFn,
  matches: AccountMatches
): Promise<AntigravityUsageReadStart | null> {
  if ((await store.read()).accounts.length === 0) {
    return null
  }
  const { vault, current } = await reconcile()
  const login =
    current &&
    antigravityUsageLogin(
      vault.accounts.find((entry) => matches(entry, current)),
      current
    )
  return { login, accounts: antigravityAccountsUsage(vault, current, target, matches) }
}

export async function runAntigravityFinishUsageRead(
  store: AntigravityAccountStore,
  target: RateLimitRuntimeTarget,
  reconcile: ReconcileFn,
  matches: AccountMatches,
  login: AntigravityUsageLogin,
  limits: ProviderRateLimits
): Promise<AntigravityUsageReadFinish> {
  const { vault, current } = await reconcile()
  const now =
    current &&
    antigravityUsageLogin(
      vault.accounts.find((entry) => matches(entry, current)),
      current
    )
  if (!now || now.key !== login.key) {
    return { switched: true }
  }
  const account = vault.accounts.find((entry) => entry.id === now.accountId)
  if (account && now.accountId === login.accountId && limits.status === 'ok') {
    account.usage = withStoredAntigravityReading(account, target, limits)
    await store.write(vault)
  }
  return {
    switched: false,
    account: { id: now.accountId, email: now.email },
    accounts: antigravityAccountsUsage(vault, current, target, matches)
  }
}
