import path from 'path'
import { pathToFileURL } from 'url'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import type { RunTuiOptions, TuiBundle } from '../tui/tui-runtime-contract'

/** Injected dependencies — defaulted in production, overridden in tests so the
 *  TTY/runtime guards can be exercised without loading the Ink bundle. */
export type TuiCommandDeps = {
  isTty: () => boolean
  loadBundle: () => Promise<TuiBundle>
  writeStderr: (text: string) => void
}

// Why: the Ink/React app is ESM-only (top-level await in Ink/yoga) and ships as
// an esbuild ESM bundle beside the tsc-built handler; we dynamic-import it by
// file URL so the CommonJS CLI never statically imports an ESM-only module.
async function loadTuiBundle(): Promise<TuiBundle> {
  const bundlePath = path.join(__dirname, '..', 'tui', 'tui-bundle.mjs')
  return (await import(pathToFileURL(bundlePath).href)) as TuiBundle
}

const DEFAULT_DEPS: TuiCommandDeps = {
  isTty: () => Boolean(process.stdout.isTTY && process.stdin.isTTY),
  loadBundle: loadTuiBundle,
  writeStderr: (text) => process.stderr.write(text)
}

export async function runTuiCommand(
  ctx: HandlerContext,
  deps: TuiCommandDeps = DEFAULT_DEPS
): Promise<void> {
  if (!deps.isTty()) {
    // Why: a full-screen TUI is meaningless without an interactive terminal;
    // fail loudly so piped/CI invocations get a clear signal instead of a hang.
    deps.writeStderr(
      'orca tui requires an interactive terminal (TTY). Run it directly in your terminal.\n'
    )
    process.exitCode = 1
    return
  }

  const status = await ctx.client.getCliStatus()
  if (!status.result.runtime.reachable) {
    throw new RuntimeClientError(
      'runtime_unreachable',
      'Orca runtime is not reachable. Start Orca (orca open) or pair a remote runtime first.'
    )
  }

  const options: RunTuiOptions = {
    client: ctx.client,
    isRemote: ctx.client.isRemote,
    noAltScreen: ctx.flags.get('no-alt-screen') === true
  }
  const bundle = await deps.loadBundle()
  await bundle.runTui(options)
}

export const TUI_HANDLERS: Record<string, CommandHandler> = {
  tui: (ctx) => runTuiCommand(ctx)
}
