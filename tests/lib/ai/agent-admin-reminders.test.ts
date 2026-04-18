import { describe, expect, it } from 'vitest'
import {
  buildAdminProactivePingCandidates,
  buildAdminReminderSms,
  getAdminReminderDue,
  resolveAdminReminderDeliveryMode,
  resolveAdminReminderDeliveryModeFromMetadata,
  resolveAdminReminderTarget,
  shouldSendAdminReminderChannel,
  withAdminReminderChannelResult,
} from '@/lib/ai/agent-admin-reminders'

describe('agent admin reminders', () => {
  it('treats reminders as due once remindAt is in the past', () => {
    const now = new Date('2026-04-14T01:00:00.000Z')
    const due = getAdminReminderDue(
      {
        remindAt: '2026-04-14T00:45:00.000Z',
        remindLabel: 'in 15 minutes',
      },
      now,
    )

    expect(due.due).toBe(true)
    expect(due.remindLabel).toBe('in 15 minutes')
  })

  it('sends only once per remindAt per channel', () => {
    const now = new Date('2026-04-14T01:00:00.000Z')
    const metadata = {
      remindAt: '2026-04-14T00:45:00.000Z',
      emailReminderSentAt: '2026-04-14T00:50:00.000Z',
      smsReminderSentAt: '2026-04-14T00:40:00.000Z',
    }

    expect(shouldSendAdminReminderChannel(metadata, 'email', now)).toBe(false)
    expect(shouldSendAdminReminderChannel(metadata, 'sms', now)).toBe(true)
  })

  it('records sent timestamp and clears error for a channel', () => {
    const next = withAdminReminderChannelResult(
      {
        remindAt: '2026-04-14T00:45:00.000Z',
        emailReminderError: 'smtp failed',
      },
      'email',
      { sentAt: '2026-04-14T01:00:00.000Z' },
    ) as Record<string, unknown>

    expect(next.emailReminderSentAt).toBe('2026-04-14T01:00:00.000Z')
    expect(next.emailReminderError).toBeUndefined()
    expect(typeof next.externalReminderUpdatedAt).toBe('string')
  })

  it('builds a compact admin reminder sms', () => {
    const sms = buildAdminReminderSms({
      title: 'Review today’s sandbox preview inbox',
      clubName: 'IPC East',
      targetUrl: 'https://dev.iqsport.ai/clubs/123/intelligence/agent',
    })

    expect(sms).toContain('IPC East')
    expect(sms).toContain('sandbox preview inbox')
    expect(sms.length).toBeLessThanOrEqual(320)
  })

  it('uses explicit admin reminder delivery mode and target values', () => {
    expect(resolveAdminReminderDeliveryMode('both')).toBe('both')
    expect(resolveAdminReminderDeliveryMode('weird')).toBe('in_app')
    expect(
      resolveAdminReminderDeliveryModeFromMetadata(
        { reminderChannel: 'sms' },
        'email',
      ),
    ).toBe('sms')
    expect(
      resolveAdminReminderDeliveryModeFromMetadata(
        { reminderChannel: 'strange' },
        'both',
      ),
    ).toBe('both')
    expect(resolveAdminReminderTarget({
      explicit: 'ops@iqsport.ai',
      fallback: 'owner@iqsport.ai',
    })).toBe('ops@iqsport.ai')
    expect(resolveAdminReminderTarget({
      explicit: '',
      fallback: 'owner@iqsport.ai',
    })).toBe('owner@iqsport.ai')
  })

  it('builds a morning ops brief when the day opens with work waiting', () => {
    const candidates = buildAdminProactivePingCandidates({
      clubId: 'club-1',
      now: new Date('2026-04-14T15:30:00.000Z'),
      timeZone: 'America/Los_Angeles',
      pendingReviewCount: 2,
      readyOpsDraftCount: 1,
      underfilledRiskCount: 1,
      nextUnderfilledTitle: 'Tuesday 6 PM Intermediate Open Play',
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.kind).toBe('morning_brief')
    expect(candidates[0]?.href).toBe('/clubs/club-1/intelligence/agent')
  })

  it('builds targeted midday pings for approvals, ops drafts, and underfilled risk', () => {
    const candidates = buildAdminProactivePingCandidates({
      clubId: 'club-1',
      now: new Date('2026-04-14T20:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      pendingReviewCount: 3,
      readyOpsDraftCount: 2,
      underfilledRiskCount: 1,
      nextUnderfilledTitle: 'Wednesday 7 PM Clinic',
    })

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'pending_reviews',
      'ops_ready',
      'underfilled_risk',
    ])
    expect(candidates[2]?.description).toContain('Wednesday 7 PM Clinic')
  })

  it('prioritizes owner-level escalation when assigned drafts are due', () => {
    const candidates = buildAdminProactivePingCandidates({
      clubId: 'club-1',
      now: new Date('2026-04-14T20:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
      pendingReviewCount: 1,
      readyOpsDraftCount: 0,
      underfilledRiskCount: 0,
      nextUnderfilledTitle: null,
      ownedOverdueCount: 1,
      ownedDueSoonCount: 0,
      nextOwnedDraftTitle: 'Thursday Evening Beginner Clinic',
    })

    expect(candidates[0]?.kind).toBe('owner_due')
    expect(candidates[0]?.description).toContain('Thursday Evening Beginner Clinic')
  })

  it('builds a before-close brief late in the day', () => {
    const candidates = buildAdminProactivePingCandidates({
      clubId: 'club-1',
      now: new Date('2026-04-15T00:30:00.000Z'),
      timeZone: 'America/Los_Angeles',
      pendingReviewCount: 0,
      readyOpsDraftCount: 1,
      underfilledRiskCount: 0,
      nextUnderfilledTitle: null,
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.kind).toBe('before_close')
  })
})
