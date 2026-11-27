import { homedir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import {
  isPlainObject,
  readHooksJson
} from '../../agent-hooks/installation/configuration/hooks-json-read'
import { writeHooksJson } from '../../agent-hooks/installation/configuration/hooks-json-write'
import { getSharedManagedScriptPath } from '../../agent-hooks/installation/scripts/managed-hook-script-path'
import { writeManagedScript } from '../../agent-hooks/installation/scripts/managed-hook-script-write'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { getAntigravityStatusLineScript } from './antigravity-statusline-script'

const SCRIPT_FILE_NAME = 'antigravity-statusline.sh'
// The user's own statusLine while Orca's wraps it, so turning the feed off puts it back verbatim.
const SAVED_USER_STATUSLINE_FILE_NAME = 'antigravity-statusline-user.json'

export type AntigravityStatusLinePaths = {
  settingsPath: string
  scriptPath: string
  savedUserStatusLinePath: string
}

export function defaultAntigravityStatusLinePaths(): AntigravityStatusLinePaths {
  return {
    settingsPath: join(homedir(), '.gemini', 'antigravity-cli', 'settings.json'),
    scriptPath: getSharedManagedScriptPath(SCRIPT_FILE_NAME),
    savedUserStatusLinePath: getSharedManagedScriptPath(SAVED_USER_STATUSLINE_FILE_NAME)
  }
}

export type AntigravityStatusLineSync =
  | 'installed'
  | 'removed'
  | 'unchanged'
  | 'unsupported'
  | 'unreadable'

function managedCommand(scriptPath: string): string {
  return `/bin/sh ${quotePosixShell(scriptPath)}`
}

function isManagedStatusLine(value: unknown, scriptPath: string): boolean {
  return isPlainObject(value) && value.command === managedCommand(scriptPath)
}

function readSavedUserStatusLine(path: string): Record<string, unknown> | null {
  const saved = readHooksJson(path)
  return saved && isPlainObject(saved.statusLine) ? saved.statusLine : null
}

/**
 * Puts Orca's status-line feed into agy's settings, or takes it out, without losing the user's own
 * status line: it is saved, run first by Orca's script, and restored unchanged on removal. A
 * settings file Orca cannot parse is left alone.
 */
export function syncAntigravityStatusLine(
  wanted: boolean,
  paths: AntigravityStatusLinePaths = defaultAntigravityStatusLinePaths(),
  platform: NodeJS.Platform = process.platform
): AntigravityStatusLineSync {
  // agy runs Windows status lines through cmd /c; only the POSIX feed exists so far.
  if (platform === 'win32') {
    return 'unsupported'
  }
  const settings = readHooksJson(paths.settingsPath)
  if (!settings) {
    return 'unreadable'
  }
  const current = settings.statusLine
  const ours = isManagedStatusLine(current, paths.scriptPath)

  if (!wanted) {
    if (!ours) {
      return 'unchanged'
    }
    const saved = readSavedUserStatusLine(paths.savedUserStatusLinePath)
    const next = { ...settings }
    if (saved) {
      next.statusLine = saved
    } else {
      delete next.statusLine
    }
    writeHooksJson(paths.settingsPath, next)
    rmSync(paths.savedUserStatusLinePath, { force: true })
    return 'removed'
  }

  if (ours) {
    // Refresh the script in place: a newer Orca may have changed it.
    const saved = readSavedUserStatusLine(paths.savedUserStatusLinePath)
    writeManagedScript(
      paths.scriptPath,
      getAntigravityStatusLineScript(typeof saved?.command === 'string' ? saved.command : null)
    )
    return 'unchanged'
  }

  const user = isPlainObject(current) ? current : null
  const userCommand =
    user && user.enabled !== false && typeof user.command === 'string' && user.command.trim()
      ? user.command
      : null
  if (user) {
    writeHooksJson(paths.savedUserStatusLinePath, { statusLine: user })
  } else {
    rmSync(paths.savedUserStatusLinePath, { force: true })
  }
  writeManagedScript(paths.scriptPath, getAntigravityStatusLineScript(userCommand))
  settings.statusLine = {
    // The user's padding and stacking choices still apply to the line their command prints.
    ...user,
    type: 'command',
    command: managedCommand(paths.scriptPath),
    enabled: true,
    // With no line of the user's, Orca's script prints nothing, so agy keeps its built-in line.
    ...(userCommand ? {} : { stack_with_default: true })
  }
  writeHooksJson(paths.settingsPath, settings)
  return 'installed'
}
