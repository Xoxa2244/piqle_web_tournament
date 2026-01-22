-- Add partner webhooks for schedule/results updates

DO $$ BEGIN
    CREATE TYPE "PartnerWebhookEvent" AS ENUM (
        'SCHEDULE_UPDATED',
        'RESULTS_UPDATED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partner_webhooks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    event_type "PartnerWebhookEvent" NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT partner_webhooks_partner_event_unique UNIQUE (partner_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_partner_webhooks_partner_id ON partner_webhooks(partner_id);
