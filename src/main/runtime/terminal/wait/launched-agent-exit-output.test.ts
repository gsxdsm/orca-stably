import { describe, expect, it } from 'vitest'
import {
  readLaunchedAgentExitOutput,
  retainLaunchedAgentExitOutput
} from './launched-agent-exit-output'

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const NL = String.fromCharCode(10)
const START = `${ESC}]133;C${BEL}`
const NESTED_FINISH = `${ESC}]133;D;0${BEL}`
const OUTER_FINISH = `${ESC}]133;D;1${BEL}`

describe('launched agent exit output', () => {
  it('keeps a startup error that follows a nested finish when the PTY dies first', () => {
    const pty: { lastExitOutput?: string } = {}
    retainLaunchedAgentExitOutput(pty, {
      read: () => `${START}${START}ls${NL}${NESTED_FINISH}_DeadlockError: openai.types.chat`
    })

    expect(pty.lastExitOutput).toBe(`ls${NL}_DeadlockError: openai.types.chat`)
  })

  it('keeps a startup error printed before a nested start when the PTY dies', () => {
    const pty: { lastExitOutput?: string } = {}
    retainLaunchedAgentExitOutput(pty, {
      read: () =>
        `${START}git status${NESTED_FINISH}${START}_DeadlockError: openai.types.chat${NL}${START}ls`
    })

    expect(pty.lastExitOutput).toBe(`_DeadlockError: openai.types.chat${NL}ls`)
  })

  it('still stops the readiness reader at the outer finish marker', () => {
    expect(readLaunchedAgentExitOutput(`${START}fatal: bad model${NL}${OUTER_FINISH}plain%`)).toBe(
      'fatal: bad model'
    )
  })
})
