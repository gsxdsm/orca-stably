import { join } from 'node:path'
import { directoryAccountBinding } from '../acp/launch/acp-account-binding'
import type { AcpLaunchSpec } from '../acp/launch/acp-launch-contract'
import { agentSessionSetupFor } from '../../shared/agent-session/lifecycle/launch/agent-session-setup-commands'
import { deliverMuseBotInstructions } from './muse-bot-instructions'
import { isMuseContributorModel, museCatalogModels } from './muse-contributor-models'

export const MUSE_LAUNCH_SPEC: AcpLaunchSpec = {
  agent: 'muse',
  command: 'muse',
  // Full access lifts Muse's sandbox too, as Codex's does; under `allowAll` alone every
  // escalation is refused, since its approval prompts are off.
  args: ({ fullAccess, model }) => [
    'acp',
    ...(fullAccess ? ['--disable-sandbox'] : []),
    ...(model ? ['--model', model] : [])
  ],
  // The session's model option refuses contributor variants; a loaded session keeps its own.
  launchesWithModel: isMuseContributorModel,
  env: {},
  dialect: { clientCapabilities: { elicitation: { form: {} } }, catalogModels: museCatalogModels },
  loginCommand: agentSessionSetupFor('muse')?.loginCommand ?? [],
  // Pin the session store while keeping Muse's own credential and config discovery.
  account: directoryAccountBinding('XDG_DATA_HOME', (homePath) =>
    join(homePath, '.local', 'share')
  ),
  installDirectories: ({ homePath }) => [join(homePath, '.local', 'bin')],
  minimumVersions: ['1.4.25'],
  permissionModeConfig: {
    values: { ask: 'promptUnmatched', 'full-access': 'allowAll' },
    fullAccessAtLaunch: true
  },
  modelDiscovery: {
    kind: 'session',
    listingNamesConfiguredModel: true,
    inPrivateFolder: true,
    sessionFolderArgs: () => ['--no-session-log']
  },
  keepsEverySession: true,
  // Muse reads the folder's rules at session/new and session/load.
  instructions: { eachStart: true, launch: deliverMuseBotInstructions },
  instructionsInWorkspace: true,
  transcriptImport: null,
  sessionHistory: {
    rowAgents: ['muse'],
    rowSessionId: (link) => link.handle.nativeId,
    parseResumeArgs: (args) =>
      args[0] === 'resume' ? { target: args[1] && !args[1].startsWith('-') ? args[1] : null } : null
  }
}
