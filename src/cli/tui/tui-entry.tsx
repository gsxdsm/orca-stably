import { render } from 'ink'
import { TuiApp } from './tui-app'
import type { RunTuiOptions } from './tui-runtime-contract'

const ALT_SCREEN_ENTER = '\x1b[?1049h'
const ALT_SCREEN_LEAVE = '\x1b[?1049l'

/** Bundled entry point. The CommonJS handler requires the esbuild output and
 *  calls this; it owns the alternate-screen lifecycle and resolves only when
 *  the user quits. */
export async function runTui(options: RunTuiOptions): Promise<void> {
  const useAltScreen = !options.noAltScreen && Boolean(process.stdout.isTTY)
  if (useAltScreen) {
    process.stdout.write(ALT_SCREEN_ENTER)
  }

  const restore = (): void => {
    if (useAltScreen) {
      process.stdout.write(ALT_SCREEN_LEAVE)
    }
  }

  try {
    const instance = render(<TuiApp options={options} />)
    await instance.waitUntilExit()
  } finally {
    // Why: restore the user's terminal on every exit path (quit, Ctrl+C, throw)
    // so a crashed session never strands them in the alternate screen buffer.
    restore()
  }
}
