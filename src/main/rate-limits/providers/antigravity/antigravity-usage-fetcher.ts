import { request } from 'node:http'
import {
  localAccountRuntimeTargetKey,
  type LocalAccountRuntimeTarget
} from '../../../../shared/agent-accounts/local-account-runtime'
import type {
  ProviderRateLimits,
  UsageRateLimitFailureKind
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { hasUsageWindows, withoutResetWindows } from '../../service/service-result-policy'
import { scanPlatformListeningPorts } from '../../../ports/local-workspace-platform-port-scanner'
import type { RawListeningPort } from '../../../ports/local-workspace-port-scan-state'
import { parseAntigravityUserStatusQuota } from './antigravity-user-status-quota'

// Why not `agy -p /usage`: headless agy runs outside ACP have been reported to get Google accounts
// flagged (upstream #50137). A running agy already serves its own status on loopback; read that.
const USER_STATUS_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus'
const USER_STATUS_TIMEOUT_MS = 3000
const USER_STATUS_MAX_BYTES = 4 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export type AntigravityUsageDependencies = {
  /** Injected so tests skip the platform port scan. */
  listListeners?: () => Promise<RawListeningPort[]>
  /** Injected so tests answer GetUserStatus without a running agy. */
  postUserStatus?: (port: number, signal?: AbortSignal) => Promise<unknown>
  now?: () => number
}

export type FetchAntigravityRateLimitsOptions = AntigravityUsageDependencies & {
  signal?: AbortSignal
  target?: LocalAccountRuntimeTarget
  /** Returned as-is while no agy runs, so the last reading stays until its window resets. */
  previous?: ProviderRateLimits | null
}

function unavailable(
  message: string,
  failureKind: UsageRateLimitFailureKind,
  now: number
): ProviderRateLimits {
  return {
    provider: 'antigravity',
    session: null,
    weekly: null,
    updatedAt: now,
    error: message,
    status: 'unavailable',
    usageMetadata: { source: 'cli', attemptedSources: ['cli'], failureKind }
  }
}

function isAgyProcess(name: string | undefined): boolean {
  return name !== undefined && /^agy(\.exe)?$/i.test(name.trim())
}

/** Loopback ports held by running agy processes, e.g. the ACP sessions Orca starts for chats. */
export function selectAgyStatusPorts(listeners: readonly RawListeningPort[]): number[] {
  const ports = listeners
    .filter((listener) => isAgyProcess(listener.processName) && LOOPBACK_HOSTS.has(listener.host))
    .map((listener) => listener.port)
  return [...new Set(ports)]
}

async function listListeners(): Promise<RawListeningPort[]> {
  return (await scanPlatformListeningPorts({ requireMetadata: true })).ports
}

function postUserStatus(port: number, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: USER_STATUS_PATH,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: USER_STATUS_TIMEOUT_MS,
        signal
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > USER_STATUS_MAX_BYTES) {
            req.destroy(new Error('agy status response too large'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`agy status answered ${res.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(new Error('agy status timed out')))
    req.on('error', reject)
    req.end('{}')
  })
}

// Run on the execution owner's machine; a remote workspace's host reads its own agy.
export async function fetchAntigravityRateLimits(
  options: FetchAntigravityRateLimitsOptions = {}
): Promise<ProviderRateLimits> {
  const target = options.target ?? { runtime: 'host', wslDistro: null }
  const result = await readAntigravityUsage(options, target)
  if (result.usageMetadata?.failureKind === 'cli-unavailable' && options.previous) {
    const now = (options.now ?? Date.now)()
    if (hasUsageWindows(withoutResetWindows(options.previous, now))) {
      return options.previous
    }
  }
  return {
    ...result,
    usageMetadata: { ...result.usageMetadata, authProvenance: localAccountRuntimeTargetKey(target) }
  }
}

async function readAntigravityUsage(
  options: FetchAntigravityRateLimitsOptions,
  target: LocalAccountRuntimeTarget
): Promise<ProviderRateLimits> {
  const now = options.now ?? Date.now
  if (target.runtime === 'wsl') {
    return unavailable(
      'Antigravity usage is read from agy running on this machine, not inside WSL.',
      'usage-unavailable',
      now()
    )
  }
  let ports: number[]
  try {
    ports = selectAgyStatusPorts(await (options.listListeners ?? listListeners)())
  } catch {
    return unavailable(
      'Antigravity usage is not available. Orca could not list running agy processes.',
      'cli-unavailable',
      now()
    )
  }
  if (ports.length === 0) {
    return unavailable(
      'Antigravity usage updates while an Antigravity chat or agy session is running.',
      'cli-unavailable',
      now()
    )
  }
  const post = options.postUserStatus ?? postUserStatus
  for (const port of ports) {
    if (options.signal?.aborted) {
      break
    }
    // agy also holds a TLS port and others that refuse this route; try each until one answers.
    const payload = await post(port, options.signal).catch(() => null)
    const reading = payload ? parseAntigravityUserStatusQuota(payload) : null
    if (!reading) {
      continue
    }
    if (reading.buckets.length === 0) {
      return unavailable(
        'Antigravity usage is not available. agy reported no model quota for this account.',
        'usage-unavailable',
        now()
      )
    }
    return {
      provider: 'antigravity',
      session: reading.session,
      weekly: null,
      buckets: reading.buckets,
      updatedAt: now(),
      error: null,
      status: 'ok',
      usageMetadata: {
        source: 'cli',
        attemptedSources: ['cli'],
        lastSuccessfulSource: 'cli',
        credentialSource: 'antigravity-cli'
      }
    }
  }
  return unavailable(
    'Antigravity usage is not available. The running agy did not report its quota.',
    'usage-unavailable',
    now()
  )
}
