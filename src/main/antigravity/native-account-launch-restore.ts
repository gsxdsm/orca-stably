import type { AntigravityNativeCredential } from './native-credential-codec'
import type {
  AntigravityAccountStore,
  AntigravityAccountVault,
  StoredAntigravityAccount
} from './native-account-store'
import type {
  AntigravityLoginEvidence,
  AntigravityLoginReader,
  AntigravityQuietRead
} from './native-account-login-view'
import { AntigravityKeychainAccessError, withBriefKeychainAccess } from './native-macos-credentials'

export type AntigravityLaunchRestoreContext = {
  readWithoutPrompt?: () => Promise<AntigravityQuietRead>
  logins: AntigravityLoginReader
  store: AntigravityAccountStore
  prompting: () => number
  reconcile: (
    selectedId?: string,
    quiet?: AntigravityQuietRead
  ) => Promise<{ vault: AntigravityAccountVault; current: AntigravityNativeCredential | null }>
  matches: (account: StoredAntigravityAccount, current: AntigravityNativeCredential) => boolean
  hasLaunchRestore: boolean
  signInHoldsLogin: () => boolean
  switchNative: (
    selected: StoredAntigravityAccount,
    current: AntigravityNativeCredential | null
  ) => Promise<unknown>
  serialize: <T>(operation: () => Promise<T>, mayPrompt?: boolean) => Promise<T>
}

export async function prepareAntigravityLaunchLogin(
  ctx: AntigravityLaunchRestoreContext,
  { mayPrompt = true, quiet = false }: { mayPrompt?: boolean; quiet?: boolean },
  seen: AntigravityLoginEvidence
): Promise<string | null> {
  const early = mayPrompt ? undefined : await ctx.readWithoutPrompt?.()
  const settled = await ctx.logins.settlesLaunch(early, false)
  if (settled !== null) {
    return settled
  }
  // Nobody asked (`quiet`): a login only a keychain read could name waits for the next launch.
  if (quiet && early && 'fingerprint' in early) {
    return null
  }
  if (early && 'fingerprint' in early && (ctx.logins.briefAccessFailed || ctx.prompting() > 0)) {
    throw new Error(
      "Checking agy's login for the selected account could ask for keychain access, so it was left as it is."
    )
  }
  const restore = async (): Promise<string> => {
    const quietRead = await ctx.readWithoutPrompt?.()
    const settledNow = await ctx.logins.settlesLaunch(quietRead, true)
    if (settledNow !== null) {
      return settledNow
    }
    const { vault, current } = await ctx.reconcile(undefined, quietRead)
    seen.login = current
    const selected = vault.accounts.find((account) => account.id === vault.selectedAccountId)
    if (!vault.selectedAccountId || (selected && current && ctx.matches(selected, current))) {
      return vault.selectedAccountId ?? ''
    }
    // Each running agy writes its own login back to the one native slot on every token refresh.
    // Exactly one saved account holding it (reconcile just saved it) restores the selection, as
    // best effort as selecting: the native store has no compare-and-swap.
    const holders = current ? vault.accounts.filter((entry) => ctx.matches(entry, current)) : []
    if (!selected || holders.length !== 1 || !ctx.hasLaunchRestore) {
      throw new Error(
        'The native Antigravity account changed. Select the account again in Accounts before launching agy.'
      )
    }
    if (ctx.signInHoldsLogin()) {
      throw new Error('Antigravity sign-in is in progress. Finish it, then launch agy again.')
    }
    // From the write on, what this restore read no longer names agy's login.
    delete seen.login
    await ctx.switchNative(selected, current)
    // No vault write: both logins are already saved, and another Orca process selecting meanwhile wins.
    if ((await ctx.store.read()).selectedAccountId !== selected.id) {
      throw new Error('Antigravity snapshots changed during selection; refresh before retrying.')
    }
    return selected.id
  }
  // A chat's keychain calls give up early; one the keychain refused or left unanswered stops the
  // next chats asking, while other refusals (a sign-in in progress) don't.
  const chatRestore = () =>
    withBriefKeychainAccess(restore).catch((error: unknown) => {
      ctx.logins.briefAccessFailed ||= error instanceof AntigravityKeychainAccessError
      throw error
    })
  return ctx.serialize(mayPrompt ? restore : chatRestore, mayPrompt)
}
