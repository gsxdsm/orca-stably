import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

const FORK_TEAM_ID = '6A5DP22787'

function findDeveloperIdIdentity() {
  try {
    const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    const teamRegex = new RegExp(`"([^"]*Developer ID Application:[^"]*\\(${FORK_TEAM_ID}\\))"`)
    return output.match(teamRegex)?.[1] ?? null
  } catch {
    return null
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getLocalBuildIdentity()
  const devId = process.env.ORCA_MAC_DEV_SIGN_IDENTITY ?? findDeveloperIdIdentity()
  const signingEnv = devId
    ? { CSC_NAME: devId }
    : { CSC_IDENTITY_AUTO_DISCOVERY: 'false', CSC_NAME: '-' }

  console.log(
    `[build:mac:dev] version=${identity.version} commit=${identity.commit} sign=${devId ?? 'ad-hoc (-)'}`
  )
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      '--arm64'
    ],
    {
      env: {
        ...process.env,
        ...signingEnv,
        ORCA_MAC_DEV: '1',
        ORCA_BUILD_COMMIT: identity.commit,
        ORCA_LOCAL_BUILD_VERSION: identity.version
      },
      stdio: 'inherit'
    }
  )
}
