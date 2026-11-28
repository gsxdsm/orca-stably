import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'
import type { RuntimeFileCommandHost } from './file-command-host'
import type { RuntimeStagedFileSaves } from './staged-file-save-commands'
import type { RuntimeTerminalArtifacts } from '../terminal/artifacts/terminal-artifacts'
import type { RuntimeTerminalPathResolver } from '../terminal/terminal-path-resolver'

export type RuntimeTerminalArtifactsSurface = Pick<
  RuntimeTerminalArtifacts,
  keyof RuntimeTerminalArtifacts
>
export type RuntimeStagedFileSavesSurface = Pick<
  RuntimeStagedFileSaves,
  keyof RuntimeStagedFileSaves
>
export type RuntimeTerminalPathResolverSurface = Pick<
  RuntimeTerminalPathResolver,
  keyof RuntimeTerminalPathResolver
>

export class LazyRuntimeTerminalArtifacts implements RuntimeTerminalArtifactsSurface {
  private instance: RuntimeTerminalArtifacts | null = null
  private loading: Promise<RuntimeTerminalArtifacts> | null = null

  constructor(private readonly host: RuntimeFileCommandHost) {}

  loadInstance(): Promise<RuntimeTerminalArtifacts> {
    if (this.instance) {
      return Promise.resolve(this.instance)
    }
    if (!this.loading) {
      const pending = import('../terminal/artifacts/terminal-artifacts').then(
        ({ RuntimeTerminalArtifacts: Ctor }) => {
          const created = new Ctor(this.host)
          this.instance = created
          return created
        }
      )
      this.loading = pending.catch((error: unknown) => {
        if (this.loading === pending) {
          this.loading = null
        }
        throw error
      })
    }
    return this.loading
  }

  resolveAbsoluteFileGrant: RuntimeTerminalArtifacts['resolveAbsoluteFileGrant'] = async (
    ...args
  ) => (await this.loadInstance()).resolveAbsoluteFileGrant(...args)

  readTerminalArtifactFile: RuntimeTerminalArtifacts['readTerminalArtifactFile'] = async (
    ...args
  ) => (await this.loadInstance()).readTerminalArtifactFile(...args)

  readTerminalArtifactPreview: RuntimeTerminalArtifacts['readTerminalArtifactPreview'] = async (
    ...args
  ) => (await this.loadInstance()).readTerminalArtifactPreview(...args)

  readTerminalArtifactChunk: RuntimeTerminalArtifacts['readTerminalArtifactChunk'] = async (
    ...args
  ) => (await this.loadInstance()).readTerminalArtifactChunk(...args)

  statTerminalArtifact: RuntimeTerminalArtifacts['statTerminalArtifact'] = async (...args) =>
    (await this.loadInstance()).statTerminalArtifact(...args)

  writeTerminalArtifactFile: RuntimeTerminalArtifacts['writeTerminalArtifactFile'] = async (
    ...args
  ) => (await this.loadInstance()).writeTerminalArtifactFile(...args)

  revokeTerminalFileGrantsForClient: RuntimeTerminalArtifacts['revokeTerminalFileGrantsForClient'] =
    (clientId) => {
      if (this.instance) {
        this.instance.revokeTerminalFileGrantsForClient(clientId)
        return
      }
      if (this.loading) {
        void this.loading.then(
          (instance) => instance.revokeTerminalFileGrantsForClient(clientId),
          () => undefined
        )
      }
    }
}

export class LazyRuntimeStagedFileSaves implements RuntimeStagedFileSavesSurface {
  private instance: RuntimeStagedFileSaves | null = null
  private loading: Promise<RuntimeStagedFileSaves> | null = null

  constructor(private readonly host: RuntimeFileCommandHost) {}

  private load(): Promise<RuntimeStagedFileSaves> {
    if (this.instance) {
      return Promise.resolve(this.instance)
    }
    if (!this.loading) {
      const pending = import('./staged-file-save-commands').then(
        ({ RuntimeStagedFileSaves: Ctor }) => {
          const created = new Ctor(this.host)
          this.instance = created
          return created
        }
      )
      this.loading = pending.catch((error: unknown) => {
        if (this.loading === pending) {
          this.loading = null
        }
        throw error
      })
    }
    return this.loading
  }

  begin: RuntimeStagedFileSaves['begin'] = async (...args) => (await this.load()).begin(...args)

  append: RuntimeStagedFileSaves['append'] = async (...args) => (await this.load()).append(...args)

  commit: RuntimeStagedFileSaves['commit'] = async (...args) => (await this.load()).commit(...args)

  commitUpload: RuntimeStagedFileSaves['commitUpload'] = async (...args) =>
    (await this.load()).commitUpload(...args)

  abort: RuntimeStagedFileSaves['abort'] = async (...args) => (await this.load()).abort(...args)

  abortConnection: RuntimeStagedFileSaves['abortConnection'] = async (owner) => {
    if (this.instance) {
      await this.instance.abortConnection(owner)
      return
    }
    if (this.loading) {
      await this.loading.then(
        (instance) => instance.abortConnection(owner),
        () => undefined
      )
    }
  }

  sweepOrphans: RuntimeStagedFileSaves['sweepOrphans'] = () => {
    if (this.instance) {
      this.instance.sweepOrphans()
      return
    }
    // Host start with the module unloaded: a crashed run's staging folder lives in the profile,
    // so probe it first and load the save machinery only when there is something to sweep.
    // Mirrors profileStagingDir in staged-file-save-commands.ts.
    void (async () => {
      try {
        const entries = await readdir(join(getProfileUserDataPath(), 'staged-saves'))
        if (entries.length === 0) {
          return
        }
        ;(await this.load()).sweepOrphans()
      } catch {
        // No staging folder, or it is unreadable: nothing this run must clear.
      }
    })()
  }
}

export class LazyRuntimeTerminalPathResolver implements RuntimeTerminalPathResolverSurface {
  private loading: Promise<RuntimeTerminalPathResolver> | null = null

  constructor(
    private readonly host: RuntimeFileCommandHost,
    private readonly artifacts: LazyRuntimeTerminalArtifacts
  ) {}

  private load(): Promise<RuntimeTerminalPathResolver> {
    if (!this.loading) {
      const pending = import('../terminal/terminal-path-resolver').then(
        ({ RuntimeTerminalPathResolver: Ctor }) => new Ctor(this.host, this.artifacts)
      )
      this.loading = pending.catch((error: unknown) => {
        if (this.loading === pending) {
          this.loading = null
        }
        throw error
      })
    }
    return this.loading
  }

  resolveTerminalPath: RuntimeTerminalPathResolver['resolveTerminalPath'] = async (...args) =>
    (await this.load()).resolveTerminalPath(...args)
}
