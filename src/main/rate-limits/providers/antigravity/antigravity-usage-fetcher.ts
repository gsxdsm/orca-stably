import { request } from 'node:http'
import {
  localAccountRuntimeTargetKey,
  type LocalAccountRuntimeTarget
} from '../../../../shared/agent-accounts/local-account-runtime'
import type {
  ProviderRateLimits,
  UsageRateLimitFailureKind
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { antigravityNoUsageYetReading } from '../../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'
import { hasUsageWindows, withoutResetWindows } from '../../service/service-result-policy'
import { scanPlatformListeningPorts } from '../../../ports/local-workspace-platform-port-scanner'
import type { RawListeningPort } from '../../../ports/local-workspace-port-scan-state'
import {
  parseAntigravityQuotaSummary,
  parseAntigravityUserStatusQuota,
  type AntigravityQuotaReading
} from './antigravity-user-status-quota'

// Why not `agy -p /usage`: headless agy runs outside ACP have been reported to get Google accounts
// flagged (upstream #50137). A running `agy acp` already serves its own quota summary (weekly + 5h)
// and user status on loopback without needing a token; read that.
const QUOTA_SUMMARY_PATH = '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary'
const USER_STATUS_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus'
const USER_STATUS_TIMEOUT_MS = 3000
const USER_STATUS_MAX_BYTES = 4 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export type AntigravityUsageDependencies = {
  /** Injected so tests skip the platform port scan. */
  listListeners?: () => Promise<RawListeningPort[]>
  /** Injected so tests answer RetrieveUserQuotaSummary without a running agy. */
  postQuotaSummary?: (port: number, signal?: AbortSignal) => Promise<unknown>
  /** Injected so tests answer GetUserStatus (fallback) without a running agy. */
  postUserStatus?: (port: number, signal?: AbortSignal) => Promise<unknown>
  /** Optional set of allowed agy PIDs (e.g. Orca-managed sessions). */
  allowedPids?: ReadonlySet<number>
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

function isAgyAcpListener(listener: RawListeningPort): boolean {
  // When commandLine is available, skip interactive TUI `agy` listeners (they require a CSRF token)
  // and only target `agy acp` processes.
  if (listener.commandLine !== undefined && listener.commandLine.trim() !== '') {
    return /\bacp\b/i.test(listener.commandLine)
  }
  return true
}

/** Loopback ports held by running `agy acp` processes. */
export function selectAgyStatusPorts(
  listeners: readonly RawListeningPort[],
  allowedPids?: ReadonlySet<number>
): number[] {
  const ports = listeners
    .filter(
      (listener) =>
        isAgyProcess(listener.processName) &&
        LOOPBACK_HOSTS.has(listener.host) &&
        isAgyAcpListener(listener) &&
        (!allowedPids || (listener.pid !== undefined && allowedPids.has(listener.pid)))
    )
    .map((listener) => listener.port)
  return [...new Set(ports)]
}

async function listListeners(): Promise<RawListeningPort[]> {
  return (await scanPlatformListeningPorts({ requireMetadata: true })).ports
}

function postLocalLanguageServerRpc(
  port: number,
  path: string,
  signal?: AbortSignal
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
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

function postQuotaSummary(port: number, signal?: AbortSignal): Promise<unknown> {
  return postLocalLanguageServerRpc(port, QUOTA_SUMMARY_PATH, signal)
}

function postUserStatus(port: number, signal?: AbortSignal): Promise<unknown> {
  return postLocalLanguageServerRpc(port, USER_STATUS_PATH, signal)
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

function buildOkResult(reading: AntigravityQuotaReading, now: number): ProviderRateLimits {
  if (reading.noUsageYet) {
    return antigravityNoUsageYetReading(now, 'cli')
  }
  return {
    provider: 'antigravity',
    session: reading.session,
    weekly: reading.weekly,
    buckets: reading.buckets,
    ...(reading.planType ? { planType: reading.planType } : {}),
    updatedAt: now,
    error: null,
    status: 'ok',
    usageMetadata: {
      source: 'cli',
      attemptedSources: ['cli'],
      lastSuccessfulSource: 'cli',
      credentialSource: 'antigravity-cli',
      ...(reading.email ? { account: { id: null, email: reading.email } } : {})
    }
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
    ports = selectAgyStatusPorts(
      await (options.listListeners ?? listListeners)(),
      options.allowedPids
    )
  } catch {
    return unavailable(
      'Antigravity usage is not available. Orca could not list running agy processes.',
      'cli-unavailable',
      now()
    )
  }
  if (ports.length === 0) {
    return unavailable(
      'Antigravity usage updates while an Antigravity chat or interactive agy session is running.',
      'cli-unavailable',
      now()
    )
  }
  // When a test injects only postUserStatus, skip RetrieveUserQuotaSummary so legacy GetUserStatus tests work directly.
  const quotaPost = options.postQuotaSummary ?? (options.postUserStatus ? null : postQuotaSummary)
  const userStatusPost = options.postUserStatus ?? postUserStatus
  for (const port of ports) {
    if (options.signal?.aborted) {
      break
    }
    // agy also holds a TLS port and others that refuse this route; try each until one answers.
    if (quotaPost) {
      const summaryPayload = await quotaPost(port, options.signal).catch(() => null)
      const summary = summaryPayload ? parseAntigravityQuotaSummary(summaryPayload) : null
      if (summary) {
        if (summary.noUsageYet || summary.buckets.length > 0) {
          // Optionally grab account email/plan from GetUserStatus on the same local port if available.
          const userStatusPayload = await userStatusPost(port, options.signal).catch(() => null)
          const userStatus = userStatusPayload
            ? parseAntigravityUserStatusQuota(userStatusPayload)
            : null
          return buildOkResult(
            {
              ...summary,
              ...(userStatus?.email ? { email: userStatus.email } : {}),
              ...(userStatus?.planType ? { planType: userStatus.planType } : {})
            },
            now()
          )
        }
      }
    }
    const payload = await userStatusPost(port, options.signal).catch(() => null)
    const reading = payload ? parseAntigravityUserStatusQuota(payload) : null
    if (!reading) {
      continue
    }
    if (reading.buckets.length === 0) {
      return antigravityNoUsageYetReading(now(), 'cli')
    }
    return buildOkResult(reading, now())
  }
  return unavailable(
    'Antigravity usage is not available. The running agy did not report its quota.',
    'usage-unavailable',
    now()
  )
}
