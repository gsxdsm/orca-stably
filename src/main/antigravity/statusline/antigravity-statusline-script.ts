import { posixCurlCommand } from '../../agent-hooks/installation/scripts/hook-post-command'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  ANTIGRAVITY_STATUSLINE_MIN_POST_INTERVAL_SECONDS,
  ANTIGRAVITY_STATUSLINE_PATHNAME
} from '../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'

export const ANTIGRAVITY_STATUSLINE_SCRIPT_MARKER = 'orca-antigravity-statusline'

/**
 * agy's statusLine command. It runs the user's own status-line command first, if there was one, so
 * their line still renders and its exit status is agy's; then it posts the payload to Orca in the
 * background, so the status line never waits on Orca.
 */
export function getAntigravityStatusLineScript(userCommand: string | null): string {
  return [
    '#!/bin/sh',
    `# ${ANTIGRAVITY_STATUSLINE_SCRIPT_MARKER}: managed by Orca; Settings > Accounts > Antigravity usage source.`,
    'payload=',
    'while IFS= read -r orca_statusline_line || [ -n "$orca_statusline_line" ]; do',
    '  payload="${payload}${orca_statusline_line}\n"',
    'done',
    'payload=${payload%?}',
    `orca_user_statusline=${quotePosixShell(userCommand ?? '')}`,
    'orca_statusline_status=0',
    'if [ -n "$orca_user_statusline" ]; then',
    '  printf \'%s\' "$payload" | /bin/sh -c "$orca_user_statusline"',
    '  orca_statusline_status=$?',
    'fi',
    // Only payloads that carry quota are worth a curl spawn.
    'case "$payload" in',
    '  *\'"quota"\'*) ;;',
    '  *) exit "$orca_statusline_status" ;;',
    'esac',
    'if [ -n "$ORCA_AGENT_HOOK_ENDPOINT" ] && [ -r "$ORCA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$ORCA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    // Outside an Orca terminal there is nowhere to post.
    'if [ -z "$ORCA_AGENT_HOOK_PORT" ] || [ -z "$ORCA_AGENT_HOOK_TOKEN" ]; then',
    '  exit "$orca_statusline_status"',
    'fi',
    'orca_statusline_pane_id=${ORCA_PANE_KEY##*:}',
    'case "$orca_statusline_pane_id" in',
    "  ''|*[!A-Za-z0-9._-]*) orca_statusline_pane_id=default ;;",
    'esac',
    'orca_statusline_stamp="${TMPDIR:-/tmp}/orca-agy-statusline-last-${orca_statusline_pane_id}"',
    'orca_statusline_now=$(date +%s 2>/dev/null) || orca_statusline_now=',
    'case "$orca_statusline_now" in 0|[1-9]|[1-9][0-9]*) ;; *) orca_statusline_now= ;; esac',
    'if [ -n "$orca_statusline_now" ] && [ -f "$orca_statusline_stamp" ]; then',
    '  orca_statusline_last=',
    '  IFS= read -r orca_statusline_last <"$orca_statusline_stamp" 2>/dev/null || :',
    '  case "$orca_statusline_last" in 0|[1-9]|[1-9][0-9]*) ;; *) orca_statusline_last= ;; esac',
    '  if [ -n "$orca_statusline_last" ] && [ "${#orca_statusline_last}" -le 15 ]; then',
    '    orca_statusline_elapsed=$((orca_statusline_now - orca_statusline_last))',
    `    if [ "$orca_statusline_elapsed" -ge 0 ] && [ "$orca_statusline_elapsed" -lt ${ANTIGRAVITY_STATUSLINE_MIN_POST_INTERVAL_SECONDS} ]; then`,
    '      exit "$orca_statusline_status"',
    '    fi',
    '  fi',
    'fi',
    'if [ -n "$orca_statusline_now" ]; then',
    '  printf \'%s\' "$orca_statusline_now" >"$orca_statusline_stamp" 2>/dev/null || :',
    'fi',
    // Detached with its own stdio so agy, which reads stdout to EOF, never waits for the post.
    `(printf '%s' "$payload" | ${posixCurlCommand()} -sS -X POST "http://127.0.0.1:\${ORCA_AGENT_HOOK_PORT}${ANTIGRAVITY_STATUSLINE_PATHNAME}" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Orca-Agent-Hook-Token: ${ORCA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${ORCA_PANE_KEY}" \\',
    '  --data-urlencode "env=${ORCA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${ORCA_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-") </dev/null >/dev/null 2>&1 &',
    'exit "$orca_statusline_status"',
    ''
  ].join('\n')
}
