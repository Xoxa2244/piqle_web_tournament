/**
 * Launch Preflight — deterministic "is this club safe to go live" checks.
 *
 * Called by the Launch Runbook UI (and by the goLive mutation as a gate).
 * Each check returns one of:
 *   • ok     — everything good, green.
 *   • warn   — suboptimal but not a blocker (yellow).
 *   • error  — blocker, cannot go live (red).
 *
 * Keep these honest: false positives erode trust, false negatives let
 * bad sends out. When in doubt, prefer warn over error so admins can
 * still launch while we iterate on the check.
 */

import type { PrismaClient } from '@prisma/client'
import { BLOCKED_EMAIL_DOMAINS } from '@/lib/email'

export type CheckStatus = 'ok' | 'warn' | 'error'

export interface PreflightCheck {
  key: string
  label: string
  status: CheckStatus
  message: string
  /** Optional CTA the UI can turn into a button ("Run dry-run now") */
  actionHref?: string
  actionLabel?: string
}

export interface PreflightResult {
  clubId: string
  clubName: string
  agentLive: boolean
  checks: PreflightCheck[]
  summary: {
    ok: number
    warn: number
    error: number
  }
}

/**
 * Run all preflight checks. Individual-check exceptions are swallowed
 * and surfaced as a warn — one broken check mustn't take down the whole
 * UI. Errors that actually block launch are returned as `status: 'error'`.
 */
export async function runLaunchPreflight(
  prisma: PrismaClient,
  clubId: string,
): Promise<PreflightResult> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      automationSettings: true,
      aiMonthlyBudgetUsd: true,
      sendingDomain: true,
      sendingDomainVerifiedAt: true,
      sendingDomainEnabled: true,
    },
  })
  if (!club) {
    throw new Error(`Club ${clubId} not found`)
  }

  const checks: PreflightCheck[] = []
  const agentLive = (club.automationSettings as any)?.intelligence?.agentLive === true

  // ── 1. Real members with valid emails ──
  try {
    const blockedList = BLOCKED_EMAIL_DOMAINS.map((d) => `'%@${d}'`).join(', ')
    const rows: Array<{ real_count: number; test_count: number }> = await prisma.$queryRawUnsafe(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE u.email IS NOT NULL
            AND u.email <> ''
            AND u.email NOT ILIKE ANY (ARRAY[${blockedList}])
        )::int AS real_count,
        COUNT(*) FILTER (
          WHERE u.email ILIKE ANY (ARRAY[${blockedList}])
        )::int AS test_count
      FROM club_followers cf
      JOIN users u ON u.id = cf."userId"
      WHERE cf."clubId" = $1::uuid
      `,
      clubId,
    )
    const { real_count, test_count } = rows[0] || { real_count: 0, test_count: 0 }
    if (real_count < 10) {
      checks.push({
        key: 'real_members',
        label: 'Real members with valid emails',
        status: 'error',
        message: `Only ${real_count} real members — at least 10 needed to make AI outreach worth launching.`,
      })
    } else {
      checks.push({
        key: 'real_members',
        label: 'Real members with valid emails',
        status: 'ok',
        message: `${real_count} real members ready to receive outreach.`,
      })
    }

    if (test_count > 0) {
      checks.push({
        key: 'no_test_emails',
        label: 'No test/demo emails in audience',
        status: 'warn',
        message: `${test_count} followers have placeholder emails (demo.iqsport.ai / placeholder.*). They'll be silently skipped on send, but cleaning them up keeps analytics clean.`,
      })
    } else {
      checks.push({
        key: 'no_test_emails',
        label: 'No test/demo emails in audience',
        status: 'ok',
        message: 'All followers have real email addresses.',
      })
    }
  } catch (err) {
    checks.push({
      key: 'real_members',
      label: 'Real members with valid emails',
      status: 'warn',
      message: `Could not count members: ${(err as Error).message?.slice(0, 120)}`,
    })
  }

  // ── 2. Email provider configured (Mandrill API key) ──
  if (!process.env.MAILCHIMP_TRANSACTIONAL_API_KEY) {
    checks.push({
      key: 'email_provider',
      label: 'Email provider configured',
      status: 'error',
      message: 'MAILCHIMP_TRANSACTIONAL_API_KEY is not set. Without it, no emails can be sent.',
    })
  } else {
    checks.push({
      key: 'email_provider',
      label: 'Email provider configured',
      status: 'ok',
      message: 'Mandrill API key present.',
    })
  }

  // ── 3. Webhook signing key (for click tracking → attribution) ──
  if (!process.env.MAILCHIMP_WEBHOOK_KEY) {
    checks.push({
      key: 'webhook_signing',
      label: 'Webhook signing configured',
      status: 'warn',
      message: "MAILCHIMP_WEBHOOK_KEY is not set. Emails still send, but open/click tracking won't be authenticated, and ROI attribution will miss the deep_link path.",
    })
  } else {
    checks.push({
      key: 'webhook_signing',
      label: 'Webhook signing configured',
      status: 'ok',
      message: 'Mandrill webhook signature verification is active.',
    })
  }

  // ── 4. Upstash Redis (rate limits) ──
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    checks.push({
      key: 'rate_limits',
      label: 'Rate limits configured',
      status: 'warn',
      message: "Upstash Redis env vars missing. Rate limits silently disable — fine for low volume, but add the vars before scaling up.",
    })
  } else {
    checks.push({
      key: 'rate_limits',
      label: 'Rate limits configured',
      status: 'ok',
      message: 'Upstash Redis is configured for rate limiting.',
    })
  }

  // ── 5. Sentry (error visibility) ──
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    checks.push({
      key: 'error_tracking',
      label: 'Error tracking configured',
      status: 'warn',
      message: 'Sentry DSN missing — errors during live sends will only appear in logs.',
    })
  } else {
    checks.push({
      key: 'error_tracking',
      label: 'Error tracking configured',
      status: 'ok',
      message: 'Sentry is receiving errors.',
    })
  }

  // ── 6. Recent dry-run exists (past 48h) ──
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const dryRunCount = await prisma.aIRecommendationLog.count({
      where: {
        clubId,
        createdAt: { gte: since },
        // status 'pending'/'skipped'/'blocked' indicates dry-run or gated sends
        status: { in: ['pending', 'skipped', 'blocked'] },
      },
    })
    if (dryRunCount === 0) {
      checks.push({
        key: 'recent_dry_run',
        label: 'Recent dry-run exists',
        status: 'warn',
        message: "No AI recommendation logs in the last 48h with a non-sent status. Run the automation in dry mode once so you know what WOULD send.",
        actionLabel: 'Run dry-run',
        actionHref: `/clubs/${clubId}/intelligence/agent`,
      })
    } else {
      checks.push({
        key: 'recent_dry_run',
        label: 'Recent dry-run exists',
        status: 'ok',
        message: `${dryRunCount} dry-run logs in the last 48h.`,
      })
    }
  } catch (err) {
    checks.push({
      key: 'recent_dry_run',
      label: 'Recent dry-run exists',
      status: 'warn',
      message: `Could not check recent runs: ${(err as Error).message?.slice(0, 120)}`,
    })
  }

  // ── 7. AI budget set (prevents runaway cost) ──
  if (club.aiMonthlyBudgetUsd == null) {
    checks.push({
      key: 'ai_budget',
      label: 'Monthly AI budget set',
      status: 'warn',
      message: 'No monthly AI budget on this club. Set one to cap runaway spend — $50/month is a safe starting point.',
      actionLabel: 'Set budget',
      actionHref: `/clubs/${clubId}/intelligence/billing`,
    })
  } else {
    checks.push({
      key: 'ai_budget',
      label: 'Monthly AI budget set',
      status: 'ok',
      message: `Budget: $${Number(club.aiMonthlyBudgetUsd).toFixed(2)}/mo.`,
    })
  }

  // ── 8. At least one admin with a contact email (kill-switch operator) ──
  try {
    const admins = await prisma.clubAdmin.findMany({
      where: { clubId },
      include: { user: { select: { email: true } } },
    })
    const withEmail = admins.filter((a) => !!a.user?.email).length
    if (withEmail === 0) {
      checks.push({
        key: 'kill_switch_admin',
        label: 'Admin available for kill switch',
        status: 'error',
        message: 'No club admins have email addresses. Add at least one so alerts reach a human.',
      })
    } else {
      checks.push({
        key: 'kill_switch_admin',
        label: 'Admin available for kill switch',
        status: 'ok',
        message: `${withEmail} admin${withEmail > 1 ? 's' : ''} with contact email.`,
      })
    }
  } catch (err) {
    checks.push({
      key: 'kill_switch_admin',
      label: 'Admin available for kill switch',
      status: 'warn',
      message: `Could not check admin emails: ${(err as Error).message?.slice(0, 120)}`,
    })
  }

  // ── 9. Sending domain (optional white-label) ──
  if (!club.sendingDomain) {
    checks.push({
      key: 'sending_domain',
      label: 'Custom sending domain (optional)',
      status: 'warn',
      message: 'No custom domain — emails will send from noreply@iqsport.ai. Optional, but +10–20% open rate if connected.',
      actionLabel: 'Set up domain',
      actionHref: `/clubs/${clubId}/intelligence/email-domain`,
    })
  } else if (!club.sendingDomainVerifiedAt) {
    checks.push({
      key: 'sending_domain',
      label: 'Custom sending domain (optional)',
      status: 'warn',
      message: `Domain ${club.sendingDomain} is configured but not verified yet.`,
      actionLabel: 'Verify DNS',
      actionHref: `/clubs/${clubId}/intelligence/email-domain`,
    })
  } else if (!club.sendingDomainEnabled) {
    checks.push({
      key: 'sending_domain',
      label: 'Custom sending domain (optional)',
      status: 'warn',
      message: `${club.sendingDomain} is verified but not enabled yet.`,
      actionLabel: 'Enable',
      actionHref: `/clubs/${clubId}/intelligence/email-domain`,
    })
  } else {
    checks.push({
      key: 'sending_domain',
      label: 'Custom sending domain (optional)',
      status: 'ok',
      message: `Sending from ${club.sendingDomain} ✓`,
    })
  }

  // ── 10. Voice settings touched (not required, but recommended) ──
  // Without a preview review, admins might launch with default tone.
  try {
    const voiceClub = await prisma.club.findUnique({
      where: { id: clubId },
      select: { voiceSettings: true },
    })
    if (voiceClub?.voiceSettings == null) {
      checks.push({
        key: 'voice_reviewed',
        label: 'Voice / tone reviewed',
        status: 'warn',
        message: 'You have not customized the voice profile for this club. Platform defaults will be used — review them in the preview panel.',
        actionLabel: 'Review voice',
        actionHref: `/clubs/${clubId}/intelligence/launch`,
      })
    } else {
      checks.push({
        key: 'voice_reviewed',
        label: 'Voice / tone reviewed',
        status: 'ok',
        message: 'Voice profile customized.',
      })
    }
  } catch {
    // non-critical
  }

  const summary = checks.reduce(
    (acc, c) => {
      acc[c.status] += 1
      return acc
    },
    { ok: 0, warn: 0, error: 0 } as PreflightResult['summary'],
  )

  return {
    clubId,
    clubName: club.name,
    agentLive,
    checks,
    summary,
  }
}
