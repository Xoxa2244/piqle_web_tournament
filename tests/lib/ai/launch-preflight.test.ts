/**
 * Unit tests for runLaunchPreflight — the gate in front of going live.
 *
 * Two invariants we MUST NOT break:
 *   1. Zero real members → error (blocker). Can't go live into a
 *      ghost town, even accidentally.
 *   2. No email provider → error. Sending without a provider is worse
 *      than not sending at all (silently swallows).
 *
 * Other checks are warn — they don't block but they nudge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runLaunchPreflight } from '@/lib/ai/launch-preflight'

function makePrisma(overrides: {
  club?: any
  memberCount?: { real_count: number; test_count: number }
  dryRunCount?: number
  admins?: Array<{ user: { email: string | null } | null }>
  voiceClub?: { voiceSettings: unknown }
} = {}) {
  const defaultClub = {
    id: 'club-1',
    name: 'Test Club',
    automationSettings: null,
    aiMonthlyBudgetUsd: null,
    sendingDomain: null,
    sendingDomainVerifiedAt: null,
    sendingDomainEnabled: false,
  }
  return {
    club: {
      findUnique: vi.fn((args: any) => {
        // Called twice — main lookup + voice re-check at the end
        if (args.select?.voiceSettings) {
          return Promise.resolve(overrides.voiceClub ?? { voiceSettings: null })
        }
        return Promise.resolve(overrides.club ?? defaultClub)
      }),
    },
    aIRecommendationLog: {
      count: vi.fn().mockResolvedValue(overrides.dryRunCount ?? 5),
    },
    clubAdmin: {
      findMany: vi.fn().mockResolvedValue(
        overrides.admins ?? [{ user: { email: 'admin@real.com' } }],
      ),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([
      overrides.memberCount ?? { real_count: 50, test_count: 0 },
    ]),
  } as any
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  // Good defaults so preset passes are green by default — tests explicitly
  // unset only what they need to probe.
  process.env.MAILCHIMP_TRANSACTIONAL_API_KEY = 'test-key'
  process.env.MAILCHIMP_WEBHOOK_KEY = 'test-webhook-key'
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
  process.env.SENTRY_DSN = 'https://test@sentry.io/1'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('runLaunchPreflight — success path', () => {
  it('returns zero errors when everything is configured and populated', async () => {
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    expect(result.summary.error).toBe(0)
    expect(result.checks.length).toBeGreaterThan(5)
  })
})

describe('runLaunchPreflight — blockers (status=error)', () => {
  it('flags <10 real members as error', async () => {
    const prisma = makePrisma({ memberCount: { real_count: 3, test_count: 0 } })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'real_members')
    expect(check?.status).toBe('error')
  })

  it('flags missing Mandrill API key as error', async () => {
    delete process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'email_provider')
    expect(check?.status).toBe('error')
  })

  it('flags zero admin emails as error (no kill-switch operator)', async () => {
    const prisma = makePrisma({ admins: [] })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'kill_switch_admin')
    expect(check?.status).toBe('error')
  })
})

describe('runLaunchPreflight — warnings (status=warn)', () => {
  it('flags missing webhook key as warn (not blocker — emails still send)', async () => {
    delete process.env.MAILCHIMP_WEBHOOK_KEY
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'webhook_signing')
    expect(check?.status).toBe('warn')
  })

  it('flags missing rate-limit env as warn', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'rate_limits')
    expect(check?.status).toBe('warn')
  })

  it('flags test/demo emails in audience as warn', async () => {
    const prisma = makePrisma({ memberCount: { real_count: 50, test_count: 12 } })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'no_test_emails')
    expect(check?.status).toBe('warn')
    expect(check?.message).toContain('12')
  })

  it('flags no dry-run in last 48h as warn (with actionHref)', async () => {
    const prisma = makePrisma({ dryRunCount: 0 })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'recent_dry_run')
    expect(check?.status).toBe('warn')
    expect(check?.actionHref).toBeDefined()
  })

  it('flags missing AI budget as warn (with actionHref)', async () => {
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'ai_budget')
    expect(check?.status).toBe('warn')
  })

  it('flags no custom sending domain as warn (optional feature)', async () => {
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'sending_domain')
    expect(check?.status).toBe('warn')
  })

  it('flags sending domain configured but unverified as warn', async () => {
    const prisma = makePrisma({
      club: {
        id: 'club-1',
        name: 'Test Club',
        automationSettings: null,
        aiMonthlyBudgetUsd: null,
        sendingDomain: 'mail.test.com',
        sendingDomainVerifiedAt: null,
        sendingDomainEnabled: false,
      },
    })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'sending_domain')
    expect(check?.status).toBe('warn')
    expect(check?.message).toContain('not verified')
  })

  it('flags no voice customization as warn', async () => {
    const prisma = makePrisma({ voiceClub: { voiceSettings: null } })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'voice_reviewed')
    expect(check?.status).toBe('warn')
  })

  it('passes voice check when customized', async () => {
    const prisma = makePrisma({ voiceClub: { voiceSettings: { tone: 'warm' } } })
    const result = await runLaunchPreflight(prisma, 'club-1')
    const check = result.checks.find((c) => c.key === 'voice_reviewed')
    expect(check?.status).toBe('ok')
  })
})

describe('runLaunchPreflight — structure', () => {
  it('reports clubName and agentLive state from club record', async () => {
    const prisma = makePrisma({
      club: {
        id: 'club-1',
        name: 'Austin Pickleball Club',
        automationSettings: { intelligence: { agentLive: true } },
        aiMonthlyBudgetUsd: null,
        sendingDomain: null,
        sendingDomainVerifiedAt: null,
        sendingDomainEnabled: false,
      },
    })
    const result = await runLaunchPreflight(prisma, 'club-1')
    expect(result.clubName).toBe('Austin Pickleball Club')
    expect(result.agentLive).toBe(true)
  })

  it('returns summary that tallies individual check statuses', async () => {
    const prisma = makePrisma()
    const result = await runLaunchPreflight(prisma, 'club-1')
    const manualTotal = result.summary.ok + result.summary.warn + result.summary.error
    expect(manualTotal).toBe(result.checks.length)
  })

  it('throws for non-existent club (caller gets loud failure)', async () => {
    const prisma = makePrisma({ club: null as any })
    // Override to return null directly (not the default club)
    prisma.club.findUnique = vi.fn().mockResolvedValue(null)
    await expect(runLaunchPreflight(prisma, 'ghost')).rejects.toThrow(/not found/)
  })
})
