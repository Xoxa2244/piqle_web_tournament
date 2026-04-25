-- ── White-label Sending Domains ──
--
-- Per-club custom sender domain so AI outreach messages arrive from
-- campaigns@mail.theirclub.com instead of noreply@iqsport.ai. Better
-- open rates, better deliverability, their branding in the inbox.
--
-- Flow:
--   1. Admin enters a domain in Settings → Email Domain
--   2. Backend calls Mandrill /senders/add-domain → gets DNS records,
--      stores them in sending_domain_dns_records (jsonb)
--   3. Admin adds the records to their DNS provider
--   4. Admin clicks "Verify" → backend calls Mandrill /senders/check-domain
--      → if SPF + DKIM valid, sets sending_domain_verified_at
--   5. Admin clicks "Enable" → sending_domain_enabled = true, all future
--      club emails go from that domain

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS sending_domain              TEXT,
  ADD COLUMN IF NOT EXISTS sending_domain_dns_records  JSONB,
  ADD COLUMN IF NOT EXISTS sending_domain_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sending_domain_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sending_domain_from_name    TEXT,
  ADD COLUMN IF NOT EXISTS sending_domain_local_part   TEXT NOT NULL DEFAULT 'campaigns';

-- Optional uniqueness — a sending domain belongs to at most one club.
-- Prevents two clubs from both claiming mail.example.com and clobbering
-- each other's DNS records in the UI.
CREATE UNIQUE INDEX IF NOT EXISTS clubs_sending_domain_unique
  ON clubs (sending_domain)
  WHERE sending_domain IS NOT NULL;

COMMENT ON COLUMN clubs.sending_domain IS
  'Custom domain used in From: header for AI outreach emails (e.g. mail.pickleballclub.com).';
COMMENT ON COLUMN clubs.sending_domain_dns_records IS
  'JSONB array of DNS records (SPF, DKIM, Return-Path) returned by Mandrill /senders/add-domain. Shown in the admin UI with copy-to-clipboard.';
COMMENT ON COLUMN clubs.sending_domain_verified_at IS
  'Set when Mandrill /senders/check-domain reports valid_signing=true. Null means DNS not yet propagated or not yet verified.';
COMMENT ON COLUMN clubs.sending_domain_enabled IS
  'Gate: when true AND verified_at IS NOT NULL, sendMail() uses the custom domain in the From: header. Admin toggles this after verification succeeds.';
COMMENT ON COLUMN clubs.sending_domain_from_name IS
  'Display name in the From: header (e.g. "Austin Pickleball Club"). Falls back to the club''s name if null.';
COMMENT ON COLUMN clubs.sending_domain_local_part IS
  'Local part of the sender address. Defaults to "campaigns" so From is campaigns@mail.theirclub.com.';
