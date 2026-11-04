import { terminalSafe } from '../../shared/terminal-safe-text'
import { applyTerminalLineControls } from './terminal-tail-line-controls'

const COMMAND_STARTED_MARK = '\x1b]133;C'
const COMMAND_FINISHED_MARK = '\x1b]133;D'
const LAUNCH_OUTPUT_MAX_CHARS = 2_000
// eslint-disable-next-line no-control-regex -- zsh's end-of-line mark and prompt redraw are not launch output.
const ZSH_PROMPT_SP = /\x1b\[7m[%#]\x1b\[27m| *\r *\r$/g

/** Retain the failed command's last screenful, including a PTY exit before its shell's finish marker. */
export function readLaunchedAgentExitOutput(
  recentOutput: string,
  options: { stopAtFinish?: boolean } = {}
): string {
  const { stopAtFinish = true } = options
  const started = Math.max(0, recentOutput.lastIndexOf(COMMAND_STARTED_MARK))
  const finished = recentOutput.lastIndexOf(COMMAND_FINISHED_MARK)
  return recentOutput
    .slice(started, stopAtFinish && finished > started ? finished : undefined)
    .replace(ZSH_PROMPT_SP, '')
    .split(/\r*\n/)
    .map((line) => terminalSafe(applyTerminalLineControls(line).text).trim())
    .filter(Boolean)
    .join('\n')
    .slice(-LAUNCH_OUTPUT_MAX_CHARS)
}

export function retainLaunchedAgentExitOutput(
  pty: { lastExitOutput?: string } | undefined,
  buffer: { read: () => string } | undefined
): void {
  if (pty) {
    // A nested 133;D is not the outer command's end, and a dead PTY never emits that.
    pty.lastExitOutput = readLaunchedAgentExitOutput(buffer?.read() ?? pty.lastExitOutput ?? '', {
      stopAtFinish: false
    })
  }
}
