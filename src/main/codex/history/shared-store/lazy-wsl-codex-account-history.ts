import type {
  WslCodexAccountHistoryLaunches,
  WslCodexAccountHistoryTarget
} from './wsl-codex-account-history'

/** Lazy wrapper so Windows/WSL Codex account history stays off startup on non-WSL hosts. */
export class LazyWslCodexAccountHistoryLaunches {
  private instance: Promise<WslCodexAccountHistoryLaunches> | null = null

  private load(): Promise<WslCodexAccountHistoryLaunches> {
    if (!this.instance) {
      const loading = import('./wsl-codex-account-history')
        .then(({ WslCodexAccountHistoryLaunches }) => new WslCodexAccountHistoryLaunches())
        .catch((error) => {
          if (this.instance === loading) {
            this.instance = null
          }
          throw error
        })
      this.instance = loading
    }
    return this.instance
  }

  async run(
    target: WslCodexAccountHistoryTarget,
    options?: { forLaunch?: boolean }
  ): Promise<void> {
    const launches = await this.load()
    return launches.run(target, options)
  }
}
