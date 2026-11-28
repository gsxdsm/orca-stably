import type { RuntimeAiVaultCommands } from '../integrations/ai-vault/runtime-ai-vault-commands'
import type { RuntimeServerEnvironmentCommands } from '../files/server-browse/runtime-server-environment-commands'
import type { RuntimeNestedRepoImport } from '../repositories/runtime-nested-repo-import'
import type { RuntimeRepositoryCloneController } from '../repositories/runtime-repository-clone-controller'
import type { RuntimeRepositoryRefQueries } from '../repositories/runtime-repository-ref-queries'
import type { RuntimeRepositoryRegistrationController } from '../repositories/runtime-repository-registration-controller'
import type { RuntimeRepositorySettingsController } from '../repositories/runtime-repository-settings-controller'
import type { RuntimeRepositorySparsePresets } from '../repositories/runtime-repository-sparse-presets'
import { getDefaultCreateProjectParent } from '../repositories/default-create-project-parent'

function createLazyController<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return () => {
    if (!promise) {
      const pending = load()
      promise = pending.catch((error: unknown) => {
        if (promise === pending) {
          promise = null
        }
        throw error
      })
    }
    return promise
  }
}

export class LazyRuntimeNestedRepoImport {
  private readonly load: () => Promise<RuntimeNestedRepoImport>

  constructor(deps: ConstructorParameters<typeof RuntimeNestedRepoImport>[0]) {
    this.load = createLazyController(async () => {
      const { RuntimeNestedRepoImport: Ctor } =
        await import('../repositories/runtime-nested-repo-import')
      return new Ctor(deps)
    })
  }

  scan: RuntimeNestedRepoImport['scan'] = async (...args) => (await this.load()).scan(...args)

  import: RuntimeNestedRepoImport['import'] = async (...args) => (await this.load()).import(...args)
}

export class LazyRuntimeRepositoryCloneController {
  private readonly load: () => Promise<RuntimeRepositoryCloneController>

  constructor(deps: ConstructorParameters<typeof RuntimeRepositoryCloneController>[0]) {
    this.load = createLazyController(async () => {
      const { RuntimeRepositoryCloneController: Ctor } =
        await import('../repositories/runtime-repository-clone-controller')
      return new Ctor(deps)
    })
  }

  checkTarget: RuntimeRepositoryCloneController['checkTarget'] = async (...args) =>
    (await this.load()).checkTarget(...args)

  clone: RuntimeRepositoryCloneController['clone'] = async (...args) =>
    (await this.load()).clone(...args)
}

export class LazyRuntimeRepositorySparsePresets {
  private readonly load: () => Promise<RuntimeRepositorySparsePresets>

  constructor(deps: ConstructorParameters<typeof RuntimeRepositorySparsePresets>[0]) {
    this.load = createLazyController(async () => {
      const { RuntimeRepositorySparsePresets: Ctor } =
        await import('../repositories/runtime-repository-sparse-presets')
      return new Ctor(deps)
    })
  }

  list: RuntimeRepositorySparsePresets['list'] = async (...args) =>
    (await this.load()).list(...args)

  save: RuntimeRepositorySparsePresets['save'] = async (...args) =>
    (await this.load()).save(...args)

  remove: RuntimeRepositorySparsePresets['remove'] = async (...args) =>
    (await this.load()).remove(...args)
}

export class LazyRuntimeRepositoryRefQueries {
  private readonly load: () => Promise<RuntimeRepositoryRefQueries>

  constructor(deps: ConstructorParameters<typeof RuntimeRepositoryRefQueries>[0]) {
    this.load = createLazyController(async () => {
      const { RuntimeRepositoryRefQueries: Ctor } =
        await import('../repositories/runtime-repository-ref-queries')
      return new Ctor(deps)
    })
  }

  search: RuntimeRepositoryRefQueries['search'] = async (...args) =>
    (await this.load()).search(...args)

  getDefault: RuntimeRepositoryRefQueries['getDefault'] = async (...args) =>
    (await this.load()).getDefault(...args)
}

export class LazyRuntimeServerEnvironmentCommands {
  private readonly load = createLazyController(async () => {
    const { RuntimeServerEnvironmentCommands: Ctor } =
      await import('../files/server-browse/runtime-server-environment-commands')
    return new Ctor()
  })

  browseDirectory: RuntimeServerEnvironmentCommands['browseDirectory'] = async (...args) =>
    (await this.load()).browseDirectory(...args)

  isGitAvailable: RuntimeServerEnvironmentCommands['isGitAvailable'] = async () =>
    (await this.load()).isGitAvailable()
}

export class LazyRuntimeAiVaultCommands {
  private readonly load: () => Promise<RuntimeAiVaultCommands>

  constructor(prepare: ConstructorParameters<typeof RuntimeAiVaultCommands>[0]) {
    this.load = createLazyController(async () => {
      const { RuntimeAiVaultCommands: Ctor } =
        await import('../integrations/ai-vault/runtime-ai-vault-commands')
      return new Ctor(prepare)
    })
  }

  list: RuntimeAiVaultCommands['list'] = async (...args) => (await this.load()).list(...args)

  resolveTitles: RuntimeAiVaultCommands['resolveTitles'] = async (...args) =>
    (await this.load()).resolveTitles(...args)

  delete: RuntimeAiVaultCommands['delete'] = async (...args) => (await this.load()).delete(...args)

  prepare: RuntimeAiVaultCommands['prepare'] = async (...args) =>
    (await this.load()).prepare(...args)
}

export class LazyRuntimeRepositoryRegistrationController {
  private readonly load: () => Promise<RuntimeRepositoryRegistrationController>

  constructor(
    private readonly deps: ConstructorParameters<typeof RuntimeRepositoryRegistrationController>[0]
  ) {
    this.load = createLazyController(async () => {
      const { RuntimeRepositoryRegistrationController: Ctor } =
        await import('../repositories/runtime-repository-registration-controller')
      return new Ctor(deps)
    })
  }

  add: RuntimeRepositoryRegistrationController['add'] = async (...args) =>
    (await this.load()).add(...args)

  create: RuntimeRepositoryRegistrationController['create'] = async (...args) =>
    (await this.load()).create(...args)

  defaultCreateParent: RuntimeRepositoryRegistrationController['defaultCreateParent'] = () => {
    const store = this.deps.getStore()
    if (!store) {
      throw new Error('runtime_unavailable')
    }
    return getDefaultCreateProjectParent(store.getSettings())
  }
}

export class LazyRuntimeRepositorySettingsController {
  private readonly load: () => Promise<RuntimeRepositorySettingsController>

  constructor(
    private readonly deps: ConstructorParameters<typeof RuntimeRepositorySettingsController>[0]
  ) {
    this.load = createLazyController(async () => {
      const { RuntimeRepositorySettingsController: Ctor } =
        await import('../repositories/runtime-repository-settings-controller')
      return new Ctor(deps)
    })
  }

  show: RuntimeRepositorySettingsController['show'] = async (...args) =>
    (await this.load()).show(...args)

  setBaseRef: RuntimeRepositorySettingsController['setBaseRef'] = async (...args) =>
    (await this.load()).setBaseRef(...args)

  setHidden: RuntimeRepositorySettingsController['setHidden'] = async (...args) =>
    (await this.load()).setHidden(...args)

  update: RuntimeRepositorySettingsController['update'] = async (...args) =>
    (await this.load()).update(...args)

  remove: RuntimeRepositorySettingsController['remove'] = async (...args) =>
    (await this.load()).remove(...args)

  reorder: RuntimeRepositorySettingsController['reorder'] = (orderedIds) => {
    const store = this.deps.getStore()
    if (!store?.reorderRepos) {
      throw new Error('runtime_unavailable')
    }
    if (!store.reorderRepos(orderedIds)) {
      return { status: 'rejected' }
    }
    this.deps.invalidateResolvedWorktrees()
    this.deps.notifyReposChanged()
    return { status: 'applied' }
  }
}
