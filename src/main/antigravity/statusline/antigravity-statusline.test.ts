import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAntigravityStatusLineUsage } from '../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'
import {
  antigravityUsageReadsAcp,
  antigravityUsageReadsStatusLine,
  normalizeAntigravityUsageSource,
  pickFresherAntigravityReading
} from '../../../shared/agent-usage/rate-limits/antigravity-usage-source'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import { syncAntigravityStatusLine } from './antigravity-statusline-install'
import { getAntigravityStatusLineScript } from './antigravity-statusline-script'

const NOW = Date.parse('2026-11-27T05:00:00Z')
const RESET_5H = '2026-11-27T10:00:00Z'
const RESET_WEEKLY = '2026-12-04T05:00:00Z'

describe('readAntigravityStatusLineUsage', () => {
  it('parses documented agy statusline JSON with 5h + weekly buckets, email, and plan tier', () => {
    const reading = readAntigravityStatusLineUsage(
      {
        product: 'antigravity',
        email: 'developer@example.com',
        plan_tier: 'Pro',
        quota: {
          'gemini-weekly': {
            remaining_fraction: 0.72,
            reset_time: RESET_WEEKLY,
            reset_in_seconds: 604800
          },
          'gemini-5h': {
            remaining_fraction: 0.4,
            reset_time: RESET_5H
          },
          '3p-weekly': {
            remaining_fraction: 0.9,
            reset_in_seconds: 500_000
          },
          'unmetered-5h': {
            remaining_fraction: 1,
            disabled: true
          }
        }
      },
      NOW
    )

    expect(reading).not.toBeNull()
    expect(reading?.provider).toBe('antigravity')
    expect(reading?.status).toBe('ok')
    expect(reading?.session?.usedPercent).toBe(60)
    expect(reading?.session?.windowMinutes).toBe(300)
    expect(reading?.weekly?.usedPercent).toBe(28)
    expect(reading?.weekly?.windowMinutes).toBe(10_080)
    expect(reading?.buckets?.map((b) => b.name)).toEqual([
      'Gemini 5h',
      'Gemini weekly',
      'Claude/GPT weekly'
    ])
    expect(reading?.planType).toBe('Pro')
    expect(reading?.usageMetadata?.source).toBe('live-session')
    expect(reading?.usageMetadata?.account).toEqual({ id: null, email: 'developer@example.com' })
  })

  it('returns null when payload carries no usable quota', () => {
    expect(readAntigravityStatusLineUsage({ product: 'antigravity' }, NOW)).toBeNull()
    expect(
      readAntigravityStatusLineUsage({ quota: { x: { remaining_amount: 10 } } }, NOW)
    ).toBeNull()
  })
})

describe('antigravity usage source helpers and merge', () => {
  it('enforces all three source modes', () => {
    expect(normalizeAntigravityUsageSource('unknown')).toBe('both')
    expect(antigravityUsageReadsAcp('both')).toBe(true)
    expect(antigravityUsageReadsStatusLine('both')).toBe(true)
    expect(antigravityUsageReadsAcp('acp')).toBe(true)
    expect(antigravityUsageReadsStatusLine('acp')).toBe(false)
    expect(antigravityUsageReadsAcp('statusline')).toBe(false)
    expect(antigravityUsageReadsStatusLine('statusline')).toBe(true)
  })

  it('picks the fresher reading while preserving still-current missing 5h or weekly window', () => {
    const olderWithBoth: ProviderRateLimits = {
      provider: 'antigravity',
      session: {
        usedPercent: 30,
        windowMinutes: 300,
        resetsAt: NOW + 3_600_000,
        resetDescription: null
      },
      weekly: {
        usedPercent: 45,
        windowMinutes: 10_080,
        resetsAt: NOW + 86_400_000,
        resetDescription: null
      },
      buckets: [
        {
          name: 'Gemini 5h',
          usedPercent: 30,
          windowMinutes: 300,
          resetsAt: NOW + 3_600_000,
          resetDescription: null
        },
        {
          name: 'Gemini weekly',
          usedPercent: 45,
          windowMinutes: 10_080,
          resetsAt: NOW + 86_400_000,
          resetDescription: null
        }
      ],
      updatedAt: NOW - 10_000,
      error: null,
      status: 'ok',
      usageMetadata: { account: { id: null, email: 'same@example.com' } }
    }
    const fresherWeeklyOnly: ProviderRateLimits = {
      provider: 'antigravity',
      session: null,
      weekly: {
        usedPercent: 52,
        windowMinutes: 10_080,
        resetsAt: NOW + 86_400_000,
        resetDescription: null
      },
      buckets: [
        {
          name: 'Gemini weekly',
          usedPercent: 52,
          windowMinutes: 10_080,
          resetsAt: NOW + 86_400_000,
          resetDescription: null
        }
      ],
      updatedAt: NOW,
      error: null,
      status: 'ok',
      usageMetadata: { account: { id: null, email: 'same@example.com' } }
    }

    const merged = pickFresherAntigravityReading(olderWithBoth, fresherWeeklyOnly, NOW)
    expect(merged?.updatedAt).toBe(NOW)
    expect(merged?.weekly?.usedPercent).toBe(52)
    expect(merged?.session?.usedPercent).toBe(30)
    expect(merged?.buckets?.map((b) => b.name)).toEqual(['Gemini weekly', 'Gemini 5h'])
  })
})

describe('syncAntigravityStatusLine chaining and restoration', () => {
  it('wraps an existing user statusLine, runs it first, and restores it verbatim on removal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-agy-statusline-'))
    try {
      const paths = {
        settingsPath: join(dir, 'settings.json'),
        scriptPath: join(dir, 'antigravity-statusline.sh'),
        savedUserStatusLinePath: join(dir, 'antigravity-statusline-user.json')
      }
      const userStatusLine = {
        type: 'command',
        command: 'echo "USER_LINE:$((1+1))"',
        padding: 1,
        enabled: true
      }
      writeFileSync(
        paths.settingsPath,
        JSON.stringify({ trustedWorkspaces: ['/tmp/ws'], statusLine: userStatusLine }, null, 2)
      )

      expect(syncAntigravityStatusLine(true, paths, 'darwin')).toBe('installed')
      const installed = JSON.parse(readFileSync(paths.settingsPath, 'utf8'))
      expect(installed.trustedWorkspaces).toEqual(['/tmp/ws'])
      expect(installed.statusLine.padding).toBe(1)
      expect(installed.statusLine.command).toContain(paths.scriptPath)
      expect(installed.statusLine.stack_with_default).toBeUndefined()

      // Executing the generated POSIX wrapper runs the user's status-line command cleanly.
      const out = execFileSync('/bin/sh', [paths.scriptPath], {
        input: JSON.stringify({
          product: 'antigravity',
          quota: { 'gemini-weekly': { remaining_fraction: 0.9 } }
        }),
        encoding: 'utf8',
        env: { PATH: process.env.PATH }
      })
      expect(out.trim()).toBe('USER_LINE:2')

      // Idempotent refresh keeps the saved user command wrapped.
      expect(syncAntigravityStatusLine(true, paths, 'darwin')).toBe('unchanged')

      // Turning off restores the original user statusLine verbatim.
      expect(syncAntigravityStatusLine(false, paths, 'darwin')).toBe('removed')
      const restored = JSON.parse(readFileSync(paths.settingsPath, 'utf8'))
      expect(restored.statusLine).toEqual(userStatusLine)
      expect(restored.trustedWorkspaces).toEqual(['/tmp/ws'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('installs with stack_with_default when no user statusLine exists and removes cleanly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-agy-statusline-empty-'))
    try {
      const paths = {
        settingsPath: join(dir, 'settings.json'),
        scriptPath: join(dir, 'antigravity-statusline.sh'),
        savedUserStatusLinePath: join(dir, 'antigravity-statusline-user.json')
      }
      writeFileSync(paths.settingsPath, JSON.stringify({ trustedWorkspaces: [] }))
      expect(syncAntigravityStatusLine(true, paths, 'darwin')).toBe('installed')
      const installed = JSON.parse(readFileSync(paths.settingsPath, 'utf8'))
      expect(installed.statusLine.stack_with_default).toBe(true)

      expect(syncAntigravityStatusLine(false, paths, 'darwin')).toBe('removed')
      const restored = JSON.parse(readFileSync(paths.settingsPath, 'utf8'))
      expect('statusLine' in restored).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns unsupported on win32 and leaves unreadable JSON untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-agy-statusline-err-'))
    try {
      const paths = {
        settingsPath: join(dir, 'settings.json'),
        scriptPath: join(dir, 'antigravity-statusline.sh'),
        savedUserStatusLinePath: join(dir, 'antigravity-statusline-user.json')
      }
      writeFileSync(paths.settingsPath, '{not valid json')
      expect(syncAntigravityStatusLine(true, paths, 'win32')).toBe('unsupported')
      expect(syncAntigravityStatusLine(true, paths, 'darwin')).toBe('unreadable')
      expect(readFileSync(paths.settingsPath, 'utf8')).toBe('{not valid json')
      expect(getAntigravityStatusLineScript(null)).toContain('/statusline/antigravity')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
