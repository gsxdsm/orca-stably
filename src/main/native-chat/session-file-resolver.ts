import { homedir } from 'os'
import { basename, extname, join } from 'path'
import type { AgentType } from '../../shared/native-chat-types'
import { walkSessionFiles } from '../ai-vault/session-scanner-discovery'

// Why: these mirror the path constants in ai-vault/session-scanner.ts. Reads
// run in the main process against the runtime's own home directory; over SSH
// the remote main resolves its local home, so we never hardcode an absolute
// user path — homedir()/CODEX_HOME resolution stays runtime-relative and is
// computed per call (not at module load) so it tracks the live home.
function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

function codexSessionsDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  return join(codexHome, 'sessions')
}

export type ResolveSessionFileOptions = {
  /** Override the Claude projects root (used by tests / isolated scans). */
  claudeProjectsDir?: string
  /** Override the Codex sessions root (used by tests / isolated scans). */
  codexSessionsDir?: string
}

/**
 * Resolve the on-disk JSONL transcript path for a given agent + session id.
 *
 * Claude nests transcripts by project slug (`~/.claude/projects/<slug>/<id>.jsonl`),
 * so there is no direct path — we glob the projects subdirs for `<id>.jsonl`.
 * Codex stores rollout files under date-nested dirs whose file name embeds the
 * session id, so we match by the session id appearing in the file name.
 * Returns null when no matching transcript exists.
 */
export async function resolveSessionFilePath(
  agent: AgentType,
  sessionId: string,
  options: ResolveSessionFileOptions = {}
): Promise<string | null> {
  const trimmedId = sessionId.trim()
  if (!trimmedId) {
    return null
  }

  if (agent === 'claude') {
    return resolveClaudeSessionFile(trimmedId, options.claudeProjectsDir ?? claudeProjectsDir())
  }
  if (agent === 'codex') {
    return resolveCodexSessionFile(trimmedId, options.codexSessionsDir ?? codexSessionsDir())
  }
  return null
}

async function resolveClaudeSessionFile(
  sessionId: string,
  projectsDir: string
): Promise<string | null> {
  const targetName = `${sessionId}.jsonl`
  const files = await walkSessionFiles(projectsDir, 'claude', [], {
    extensions: new Set(['.jsonl']),
    filePredicate: (path) => basename(path) === targetName
  })
  return files[0] ?? null
}

async function resolveCodexSessionFile(
  sessionId: string,
  sessionsDir: string
): Promise<string | null> {
  // Codex rollout file names embed the session id (rollout-<ts>-<id>.jsonl), so
  // match the id as a suffix of the file's base name rather than an exact name.
  const files = await walkSessionFiles(sessionsDir, 'codex', [], {
    extensions: new Set(['.jsonl']),
    filePredicate: (path) => {
      const name = basename(path, extname(path))
      return name === sessionId || name.endsWith(`-${sessionId}`)
    }
  })
  return files[0] ?? null
}
