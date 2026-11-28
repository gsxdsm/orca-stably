import type { RuntimeTerminalWait } from '../terminal/wait/terminal-wait'
import type { RuntimeTerminalIdlePolls } from '../terminal/wait/terminal-idle-polls'
import type { RuntimeTerminalWaiterRegistry } from '../terminal/wait/terminal-waiter-registry'
import type { RuntimeTerminalWriter } from '../terminal/input/runtime-terminal-writer'

type WriterArgs = ConstructorParameters<typeof RuntimeTerminalWriter>
type WaitDeps = ConstructorParameters<typeof RuntimeTerminalWait>[0]
type PollDeps = ConstructorParameters<typeof RuntimeTerminalIdlePolls>[0]

export class LazyRuntimeTerminalWriter {
  private instance: RuntimeTerminalWriter | null = null
  private pending: Promise<RuntimeTerminalWriter> | null = null

  constructor(private readonly args: WriterArgs) {}

  private load(): Promise<RuntimeTerminalWriter> {
    if (this.instance) {
      return Promise.resolve(this.instance)
    }
    if (!this.pending) {
      const pending = import('../terminal/input/runtime-terminal-writer')
        .then(({ RuntimeTerminalWriter }) => {
          this.instance = new RuntimeTerminalWriter(...this.args)
          return this.instance
        })
        .catch((error: unknown) => {
          if (this.pending === pending) {
            this.pending = null
          }
          throw error
        })
      this.pending = pending
    }
    return this.pending
  }

  async writeAction(
    ...args: Parameters<RuntimeTerminalWriter['writeAction']>
  ): ReturnType<RuntimeTerminalWriter['writeAction']> {
    return (await this.load()).writeAction(...args)
  }

  async writeChunks(
    ...args: Parameters<RuntimeTerminalWriter['writeChunks']>
  ): ReturnType<RuntimeTerminalWriter['writeChunks']> {
    return (await this.load()).writeChunks(...args)
  }
}

export class LazyRuntimeTerminalWait {
  private instance: RuntimeTerminalWait | null = null
  private pending: Promise<RuntimeTerminalWait> | null = null

  constructor(
    private readonly waitDeps: WaitDeps,
    private readonly waiters: RuntimeTerminalWaiterRegistry,
    private readonly pollDeps: PollDeps
  ) {}

  private load(): Promise<RuntimeTerminalWait> {
    if (this.instance) {
      return Promise.resolve(this.instance)
    }
    if (!this.pending) {
      const pending = Promise.all([
        import('../terminal/wait/terminal-wait'),
        import('../terminal/wait/terminal-idle-polls')
      ])
        .then(([{ RuntimeTerminalWait }, { RuntimeTerminalIdlePolls }]) => {
          const polls = new RuntimeTerminalIdlePolls(this.pollDeps)
          this.instance = new RuntimeTerminalWait(this.waitDeps, this.waiters, polls)
          return this.instance
        })
        .catch((error: unknown) => {
          if (this.pending === pending) {
            this.pending = null
          }
          throw error
        })
      this.pending = pending
    }
    return this.pending
  }

  async wait(
    ...args: Parameters<RuntimeTerminalWait['wait']>
  ): ReturnType<RuntimeTerminalWait['wait']> {
    return (await this.load()).wait(...args)
  }
}
