/**
 * RLS Migration Sanity Check
 *
 * Validates that migrations/enable-rls-defense-in-depth.sql:
 *   1. Is syntactically parseable (key statements match expected patterns)
 *   2. Covers every sensitive table (explicit allowlist — forces thought
 *      when someone adds a new table)
 *
 * This runs in the normal vitest suite — catches drift early (e.g. someone
 * adds an "api_request_logs_v2" table but forgets RLS).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const migration = readFileSync(
  join(process.cwd(), 'migrations/enable-rls-defense-in-depth.sql'),
  'utf8',
)

// Tables that MUST be covered by the RLS migration. If you add a sensitive
// table, add it here AND to the migration file.
const REQUIRED_RLS_TABLES = [
  // Tier 1: Intelligence & AI
  'ai_recommendation_logs',
  'ai_conversations',
  'ai_messages',
  'ai_usage_logs',
  'document_embeddings',
  'agent_drafts',
  'agent_decision_records',
  'agent_admin_todo_decisions',
  'ops_session_drafts',
  'member_health_snapshots',
  'member_ai_profiles',
  'weekly_summaries',
  'session_interest_requests',
  'integration_anomaly_incidents',
  'referral_reward_issuances',
  // Tier 2: Club Booking
  'play_sessions',
  'play_session_bookings',
  'play_session_waitlist',
  'club_courts',
  'user_play_preferences',
  // Tier 3: Club Management
  'club_connectors',
  'club_cohorts',
  'club_booking_requests',
  'club_announcements',
  'club_bans',
  'club_invites',
  'club_join_requests',
  'club_join_request_seen',
  'club_chat_messages',
  'club_chat_read_states',
  // Tier 4: Payments
  'payments',
  'subscriptions',
  // Tier 5: Partner API & Audit
  'partner_apps',
  'partner_club_bindings',
  'partner_webhooks',
  'api_request_logs',
  'audit_logs',
  // Tier 6: NextAuth
  'accounts',
  'sessions',
  'email_otps',
  'verification_tokens',
  // Tier 7: Tournament Private
  'tournament_access_requests',
  'tournament_accesses',
  'tournament_invitations',
  'tournament_chat_messages',
  'tournament_chat_read_states',
  'division_chat_messages',
  'division_chat_read_states',
  'idempotency_keys',
]

describe('RLS migration coverage', () => {
  it('migration file exists and is non-empty', () => {
    expect(migration.length).toBeGreaterThan(100)
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('every required table has ENABLE ROW LEVEL SECURITY', () => {
    const missing: string[] = []
    for (const table of REQUIRED_RLS_TABLES) {
      const pattern = new RegExp(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
        'i',
      )
      if (!pattern.test(migration)) missing.push(table)
    }
    expect(missing, `Missing ENABLE RLS for: ${missing.join(', ')}`).toEqual([])
  })

  it('every required table has a service_role policy', () => {
    const missing: string[] = []
    for (const table of REQUIRED_RLS_TABLES) {
      // Match: CREATE POLICY ... ON "<table>" FOR ALL TO service_role
      const pattern = new RegExp(
        `CREATE POLICY[\\s\\S]*?ON\\s+"${table}"[\\s\\S]*?FOR\\s+ALL[\\s\\S]*?TO\\s+service_role`,
        'i',
      )
      if (!pattern.test(migration)) missing.push(table)
    }
    expect(missing, `Missing service_role policy for: ${missing.join(', ')}`).toEqual([])
  })

  it('no accidental authenticated or anon policies (should be deny-by-default)', () => {
    // We intentionally do NOT grant policies to anon/authenticated in this
    // migration. If someone adds one, it should be a deliberate PR, not drift.
    const authenticatedCount = (migration.match(/TO\s+authenticated/gi) || []).length
    const anonCount = (migration.match(/TO\s+anon/gi) || []).length
    expect(
      authenticatedCount,
      'Unexpected `TO authenticated` — if intentional, update this test with the new table count',
    ).toBe(0)
    expect(
      anonCount,
      'Unexpected `TO anon` — if intentional, update this test',
    ).toBe(0)
  })

  it('no table is referenced without quotes (prevents typos silently passing)', () => {
    // Find every `ALTER TABLE X ENABLE ROW LEVEL SECURITY` without quotes
    const unquoted = migration.match(/ALTER TABLE\s+[a-z_]+\s+ENABLE/gi) || []
    expect(
      unquoted,
      'Found unquoted table name in ALTER TABLE (use "double quotes" for safety)',
    ).toEqual([])
  })

  it('covers at least 48 tables (sanity floor — prevents accidental deletions)', () => {
    const enableCount = (migration.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length
    expect(enableCount).toBeGreaterThanOrEqual(48)
  })
})
