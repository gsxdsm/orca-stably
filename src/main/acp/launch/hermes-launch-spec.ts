import { HERMES_ACP_DIALECT } from '../acp-dialects/hermes-dialect'
import { hermesAcpAccountBinding } from '../../hermes/hermes-acp-account'
import { HERMES_SESSION_HISTORY } from '../../hermes/hermes-session-history'
import type { AcpLaunchSpec } from './acp-launch-contract'

// `hermes acp --yolo` is rejected; the parent CLI consumes `--yolo` before `acp`.
export const HERMES_LAUNCH_SPEC: AcpLaunchSpec = {
  agent: 'hermes',
  command: 'hermes',
  args: ({ fullAccess }) => (fullAccess ? ['--yolo', 'acp'] : ['acp']),
  env: { HERMES_YOLO_MODE: '0' },
  dialect: HERMES_ACP_DIALECT,
  loginCommand: ['hermes', 'model'],
  // `hermes-setup` is interactive and authenticates only after credentials exist.
  authMethod: ({ advertised }) => advertised.find((id) => id !== 'hermes-setup'),
  account: hermesAcpAccountBinding(),
  installDirectories: () => [],
  // Replay frames carry no turn id, so catch-up would fail the attach. Journals reopen themselves.
  compaction: true,
  modelDiscovery: {
    kind: 'unavailable',
    reason: 'Hermes lists its models only in a chat session'
  },
  // Sessions live in SQLite, not transcript files.
  transcriptImport: null,
  sessionHistory: HERMES_SESSION_HISTORY
}
