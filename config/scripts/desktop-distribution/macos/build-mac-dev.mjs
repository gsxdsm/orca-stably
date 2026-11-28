import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

function adhocSignMacApp(appPath, entitlementsPath) {
  const frameworksDir = join(appPath, 'Contents', 'Frameworks')
  if (existsSync(frameworksDir)) {
    for (const entry of readdirSync(frameworksDir)) {
      const fullPath = join(frameworksDir, entry)
      if (entry.endsWith('.framework')) {
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', fullPath], {
          stdio: 'inherit'
        })
      } else if (entry.endsWith('.app')) {
        execFileSync(
          'codesign',
          ['--force', '--sign', '-', '--entitlements', entitlementsPath, fullPath],
          { stdio: 'inherit' }
        )
      }
    }
  }
  execFileSync(
    'codesign',
    ['--force', '--sign', '-', '--entitlements', entitlementsPath, appPath],
    {
      stdio: 'inherit'
    }
  )
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
}

function packageAdhocArtifacts(appPath, distDir, sha) {
  const zipPath = join(distDir, `Orca-Dev-${sha}-arm64.zip`)
  const dmgPath = join(distDir, `Orca-Dev-${sha}-arm64.dmg`)
  rmSync(zipPath, { force: true })
  rmSync(dmgPath, { force: true })
  execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], { stdio: 'inherit' })

  const stageDir = mkdtempSync(join(tmpdir(), 'orca-dev-dmg-'))
  try {
    execFileSync('ditto', [appPath, join(stageDir, 'Orca Dev.app')], { stdio: 'inherit' })
    symlinkSync('/Applications', join(stageDir, 'Applications'))
    execFileSync(
      'hdiutil',
      ['create', '-volname', 'Orca Dev', '-srcfolder', stageDir, '-ov', '-format', 'UDZO', dmgPath],
      { stdio: 'inherit' }
    )
  } finally {
    rmSync(stageDir, { recursive: true, force: true })
  }
  console.log(`[build:mac:dev] zip=${zipPath}\n[build:mac:dev] dmg=${dmgPath}`)
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
  const builderArgs = [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--mac',
    '--arm64',
    ...(devId ? [] : ['--dir'])
  ]
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', builderArgs, {
    env: {
      ...process.env,
      ...signingEnv,
      ORCA_MAC_DEV: '1',
      ORCA_BUILD_COMMIT: identity.commit,
      ORCA_LOCAL_BUILD_VERSION: identity.version
    },
    stdio: 'inherit'
  })

  if (!devId) {
    const distDir = resolve('dist')
    const appPath = join(distDir, 'mac-arm64', 'Orca Dev.app')
    const entitlementsPath = resolve('resources/build/entitlements.mac.plist')
    adhocSignMacApp(appPath, entitlementsPath)
    mkdirSync(distDir, { recursive: true })
    packageAdhocArtifacts(appPath, distDir, process.env.ORCA_DEV_ARTIFACT_SHA || identity.commit)
  }
}
