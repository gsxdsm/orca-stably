// Bounded ring buffer for a plugin backend's stdout/stderr. The plugin host
// captures child-process output here so the management UI's "View Output" can
// show recent logs without unbounded memory growth (authority in main, the
// renderer reads a snapshot). Pure + framework-free, so it unit-tests directly.

export type OutputChannel = 'stdout' | 'stderr'

export type OutputLine = {
  channel: OutputChannel
  text: string
  seq: number
}

const DEFAULT_CAPACITY = 1000

export class PluginOutputBuffer {
  private lines: OutputLine[] = []
  private nextSeq = 0

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {
    if (capacity <= 0) {
      throw new Error('PluginOutputBuffer capacity must be > 0')
    }
  }

  // Append a chunk; splits on newlines so each line is an entry. A trailing
  // partial line (no newline) is kept as its own entry. Oldest lines are
  // dropped once capacity is exceeded.
  append(channel: OutputChannel, chunk: string): void {
    if (chunk.length === 0) {
      return
    }
    const parts = chunk.split('\n')
    // A trailing '' from a chunk ending in '\n' is not a real line.
    if (parts.length > 1 && parts.at(-1) === '') {
      parts.pop()
    }
    for (const text of parts) {
      this.lines.push({ channel, text, seq: this.nextSeq++ })
    }
    if (this.lines.length > this.capacity) {
      this.lines.splice(0, this.lines.length - this.capacity)
    }
  }

  snapshot(): OutputLine[] {
    return [...this.lines]
  }

  clear(): void {
    this.lines = []
  }

  get size(): number {
    return this.lines.length
  }
}
