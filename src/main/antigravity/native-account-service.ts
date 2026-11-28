import { randomUUID } from 'node:crypto'
import type { AntigravityAccountState } from '../../shared/agent-accounts/antigravity/antigravity-account-types'
import {
  ANTIGRAVITY_USAGE_HOST_TARGET,
  runAntigravityBeginUsageRead,
  runAntigravityFinishUsageRead,
  withAntigravityAccountUsage,
  type AntigravityUsageLogin,
  type AntigravityUsageReadFinish,
  type AntigravityUsageReadStart,
  type ProviderRateLimits,
  type RateLimitRuntimeTarget
} from './native-account-usage-reading'
import {
  parseAntigravityNativeCredential,
  type AntigravityNativeCredential
} from './native-credential-codec'
import { fetchGoogleIdentity } from './google-userinfo-identity'
import { AntigravityRewrittenLoginIdentity } from './native-account-rewritten-login'
import type {
  AntigravityAccountStore,
  AntigravityAccountVault,
  StoredAntigravityAccount
} from './native-account-store'
import {
  AntigravityLaunchRestoreError,
  AntigravityLoginReader,
  antigravityAccountState,
  type AntigravityLoginEvidence as LoginEvidence,
  antigravityLoginMatches,
  refreshSavedAntigravityLogin,
  type AntigravityQuietRead
} from './native-account-login-view'
import { prepareAntigravityLaunchLogin } from './native-account-launch-restore'

export type AntigravityCredentialBackend = {
  parse?(contents: string): AntigravityNativeCredential
  read(): Promise<AntigravityNativeCredential | null>
  write(contents: string, expected: string | null): Promise<void>
  /** Only where `read` can raise a keychain dialog (macOS): what Orca can learn without one. */
  readWithoutPrompt?(): Promise<AntigravityQuietRead>
}

export type AntigravityLaunchRestore = {
  /** True while Orca's own agy sign-in may have put a login it hasn't saved yet in the slot. */
  signInHoldsLogin: () => boolean
}

export class AntigravityAccountService {
  private mutation: Promise<unknown> = Promise.resolve()
  // Queued or running operations that may wait on a keychain dialog.
  private prompting = 0
  private readonly logins: AntigravityLoginReader
  private readonly rewrittenLogins = new AntigravityRewrittenLoginIdentity(
    () => this.lookupIdentity
  )

  constructor(
    private readonly store: AntigravityAccountStore,
    private readonly backend: AntigravityCredentialBackend,
    private readonly now: () => number = Date.now,
    private readonly lookupIdentity = fetchGoogleIdentity,
    // Only the host's service restores at launch; absent, launches still refuse a moved login.
    private readonly launchRestore?: AntigravityLaunchRestore,
    private readonly target: RateLimitRuntimeTarget = ANTIGRAVITY_USAGE_HOST_TARGET
  ) {
    this.logins = new AntigravityLoginReader(backend, store, (account, login) =>
      this.matches(account, login)
    )
  }

  /** Resolves once every account operation queued before it has finished. */
  settled(): Promise<void> {
    return this.serialize(async () => {}, false)
  }

  /** Never reads a login whose read could raise a keychain dialog: such a login is named from
   *  the last read while its keychain item is unchanged, else listed as signed in but unread. */
  async listAccounts(): Promise<AntigravityAccountState> {
    // Queued work may be waiting on a keychain dialog, which a keychain login lists without.
    const early = this.prompting > 0 ? await this.backend.readWithoutPrompt?.() : undefined
    return early && 'fingerprint' in early
      ? this.listKeychainLogin(early.fingerprint, false)
      : this.serialize(async () => {
          const quiet = await this.backend.readWithoutPrompt?.()
          return quiet && 'fingerprint' in quiet
            ? this.listKeychainLogin(quiet.fingerprint, true)
            : this.state(await this.reconcile(undefined, quiet))
        }, false)
  }

  private async listKeychainLogin(fingerprint: string, persist: boolean) {
    const vault = await this.store.read()
    const login = (await this.logins.known(vault, fingerprint, persist)) ?? 'unread'
    const base = antigravityAccountState(vault, login, Boolean(this.launchRestore))
    return withAntigravityAccountUsage(base, vault, this.target)
  }

  /** Reads only Orca's saved accounts, never agy's login, and waits on no other account work. */
  async readSelection(): Promise<{ selectedAccountId: string | null; accountIds: string[] }> {
    const vault = await this.store.read()
    return {
      selectedAccountId: vault.selectedAccountId,
      accountIds: vault.accounts.map((account) => account.id)
    }
  }

  /** The saved account agy's login holds; only where reading it raises no dialog (Windows). */
  readLoginHolder(): Promise<string | null> {
    return this.serialize(async () => {
      const { vault, current } = await this.reconcile()
      return current ? this.logins.view(vault, current).accountId : null
    }, false)
  }

  /** Reads agy's login even where that may raise a keychain dialog; only for an explicit request. */
  readCurrentAccount(): Promise<AntigravityAccountState> {
    return this.serialize(async () => this.state(await this.reconcile()))
  }

  addCurrentAccount(): Promise<AntigravityAccountState> {
    return this.serialize(async () => {
      const { vault, current } = await this.reconcile()
      if (!current) {
        throw new Error('Sign in with agy on this execution host, then save the current account.')
      }
      if (vault.accounts.some((entry) => this.matches(entry, current))) {
        return this.state({ vault, current })
      }
      const identity = current.identity ?? (await this.lookupIdentity(current.accessToken))
      if (!current.identity && (await this.backend.read())?.contents !== current.contents) {
        throw new Error('The native Antigravity account changed. Save the current account again.')
      }
      const identified = { ...current, identity }
      const latest = await this.store.read()
      if (!latest.accounts.some((entry) => this.matches(entry, identified))) {
        const timestamp = this.now()
        latest.accounts.push({
          id: randomUUID(),
          email: identity.email,
          subject: identity.subject,
          authMethod: current.authMethod,
          credentials: current.contents,
          createdAt: timestamp,
          updatedAt: timestamp
        })
      }
      this.updateSnapshot(latest, identified)
      await this.store.write(latest)
      return this.state({ vault: latest, current: identified })
    })
  }

  /** `switched` hears a write of agy's login as soon as it lands, even if a check after it fails,
   *  with the selection it replaced (read in this serialized step, so each sees its own). */
  selectAccount(
    id: string,
    switched?: (previous: string | null) => void
  ): Promise<AntigravityAccountState> {
    return this.serialize(async () => {
      const { vault, current } = await this.reconcile(id)
      const selected = vault.accounts.find((account) => account.id === id)
      if (!selected) {
        throw new Error('Antigravity account was not found.')
      }
      const { readback } = await this.switchNative(selected, current, () =>
        switched?.(vault.selectedAccountId ?? null)
      )
      const latest = await this.store.read()
      if (
        !latest.accounts.some((account) => account.id === id && this.matches(account, readback))
      ) {
        throw new Error('Antigravity snapshots changed during selection; refresh before retrying.')
      }
      latest.selectedAccountId = id
      this.updateSnapshot(latest, readback)
      await this.store.write(latest)
      return this.state({ vault: latest, current: readback })
    })
  }

  removeAccount(id: string): Promise<AntigravityAccountState> {
    return this.serialize(async () => {
      const { vault, current } = await this.reconcile()
      const account = vault.accounts.find((entry) => entry.id === id)
      if (!account) {
        throw new Error('Antigravity account was not found.')
      }
      if (current && this.matches(account, current)) {
        throw new Error('Switch agy to another account before removing the one it is signed in to.')
      }
      vault.accounts = vault.accounts.filter((entry) => entry.id !== id)
      // Only Orca's snapshot goes; agy keeps its own login, so a removed selection must stop gating launches.
      if (vault.selectedAccountId === id) {
        vault.selectedAccountId = null
      }
      await this.store.write(vault)
      return this.state({ vault, current })
    })
  }

  /** `mayPrompt: false` (a chat start) never waits on a keychain dialog: it skips the restore while
   *  other account work runs, reads agy's login only briefly, and not again once that failed. */
  /** The selected account ('' when none) agy's login was found or put on; null when `quiet` left
   *  it unread. */
  async prepareForLaunch(
    options: { mayPrompt?: boolean; quiet?: boolean } = {}
  ): Promise<string | null> {
    const seen: LoginEvidence = {}
    try {
      return await prepareAntigravityLaunchLogin(
        {
          readWithoutPrompt: this.backend.readWithoutPrompt
            ? () => this.backend.readWithoutPrompt!()
            : undefined,
          logins: this.logins,
          store: this.store,
          prompting: () => this.prompting,
          reconcile: (id, q) => this.reconcile(id, q),
          matches: (a, c) => this.matches(a, c),
          hasLaunchRestore: Boolean(this.launchRestore),
          signInHoldsLogin: () => this.launchRestore?.signInHoldsLogin() ?? false,
          switchNative: (s, c) => this.switchNative(s, c),
          serialize: (op, mayPrompt) => this.serialize(op, mayPrompt)
        },
        options,
        seen
      )
    } catch (error) {
      throw new AntigravityLaunchRestoreError(
        error,
        await this.logins.holderAfterFailure(seen).catch(() => null)
      )
    }
  }

  private async switchNative(
    selected: StoredAntigravityAccount,
    current: AntigravityNativeCredential | null,
    wrote?: () => void
  ) {
    const switching = !current || !this.matches(selected, current)
    if (switching) {
      await this.backend.write(selected.credentials, current?.contents ?? null)
      wrote?.()
    }
    const { current: readback, fingerprint } = await this.logins.read()
    this.logins.note(fingerprint, readback)
    if (!readback || !this.matches(selected, readback)) {
      throw new Error(
        'Antigravity account switching could not be verified; refresh before retrying.'
      )
    }
    return { readback, switching }
  }

  beginUsageRead(): Promise<AntigravityUsageReadStart | null> {
    return this.serialize(() =>
      runAntigravityBeginUsageRead(
        this.store,
        this.target,
        () => this.reconcile(),
        (a, c) => this.matches(a, c)
      )
    )
  }

  /** Keeps a successful reading only when the login that started the read is still signed in. */
  finishUsageRead(
    login: AntigravityUsageLogin,
    limits: ProviderRateLimits
  ): Promise<AntigravityUsageReadFinish> {
    return this.serialize(() =>
      runAntigravityFinishUsageRead(
        this.store,
        this.target,
        () => this.reconcile(),
        (a, c) => this.matches(a, c),
        login,
        limits
      )
    )
  }

  private matches(
    account: StoredAntigravityAccount,
    current: AntigravityNativeCredential
  ): boolean {
    return antigravityLoginMatches(account, current, this.backend.parse)
  }

  /** `quiet`: what the caller already read without a prompt, so it isn't read twice. */
  private async reconcile(selectedId?: string, quiet?: AntigravityQuietRead) {
    const native = await this.logins.read(quiet)
    const current = await this.rewrittenLogins.identify(
      native.current,
      (await this.store.read()).accounts,
      (account, login) => this.matches(account, login)
    )
    this.logins.note(native.fingerprint, current)
    // Re-read after native I/O so a delayed read never restores an older vault.
    const vault = await this.store.read()
    if (selectedId !== undefined) {
      const selected = vault.accounts.find((account) => account.id === selectedId)
      if (!selected) {
        throw new Error('Antigravity account was not found.')
      }
      const parseCredential = this.backend.parse ?? parseAntigravityNativeCredential
      parseCredential(selected.credentials)
    }
    if (current && this.updateSnapshot(vault, current)) {
      await this.store.write(vault)
    }
    return { vault, current }
  }

  private updateSnapshot(vault: AntigravityAccountVault, current: AntigravityNativeCredential) {
    return refreshSavedAntigravityLogin(vault, current, (a) => this.matches(a, current), this.now())
  }

  private state({
    vault,
    current
  }: {
    vault: AntigravityAccountVault
    current: AntigravityNativeCredential | null
  }): AntigravityAccountState {
    const login = current ? this.logins.view(vault, current) : null
    const base = antigravityAccountState(vault, login, Boolean(this.launchRestore))
    return withAntigravityAccountUsage(base, vault, this.target)
  }

  private serialize<T>(operation: () => Promise<T>, mayPrompt = true): Promise<T> {
    const prompts = Number(mayPrompt)
    this.prompting += prompts
    const next = this.mutation.then(operation, operation).finally(() => (this.prompting -= prompts))
    this.mutation = next.catch(() => undefined)
    return next
  }
}
