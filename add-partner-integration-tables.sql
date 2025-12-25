-- Migration: Add Partner Integration tables
-- Run this in Supabase SQL editor

-- 1. Create enums
DO $$ BEGIN
    CREATE TYPE "PartnerStatus" AS ENUM (
        'ACTIVE',
        'SUSPENDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PartnerEnvironment" AS ENUM (
        'SANDBOX',
        'PRODUCTION'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PartnerAppStatus" AS ENUM (
        'ACTIVE',
        'REVOKED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ExternalEntityType" AS ENUM (
        'TOURNAMENT',
        'DIVISION',
        'TEAM',
        'PLAYER',
        'MATCH_DAY',
        'MATCHUP'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create partners table
CREATE TABLE IF NOT EXISTS partners (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    contact_email TEXT,
    contact_name TEXT,
    status "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_code ON partners(code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);

COMMENT ON TABLE partners IS 'Partner organizations that integrate with Piqle API';
COMMENT ON COLUMN partners.code IS 'Short unique identifier for the partner';

-- 3. Create partner_apps table
CREATE TABLE IF NOT EXISTS partner_apps (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    environment "PartnerEnvironment" NOT NULL,
    key_id TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    status "PartnerAppStatus" NOT NULL DEFAULT 'ACTIVE',
    allowed_ips TEXT[] DEFAULT '{}',
    rate_limit_rpm INT NOT NULL DEFAULT 60,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_apps_partner_id ON partner_apps(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_apps_key_id ON partner_apps(key_id);
CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_apps(status);

COMMENT ON TABLE partner_apps IS 'API credentials for partner applications';
COMMENT ON COLUMN partner_apps.key_id IS 'Public identifier for the API key';
COMMENT ON COLUMN partner_apps.secret_hash IS 'Bcrypt hash of the secret';
COMMENT ON COLUMN partner_apps.allowed_ips IS 'IP allowlist (empty array = no restriction)';
COMMENT ON COLUMN partner_apps.rate_limit_rpm IS 'Rate limit: requests per minute';
COMMENT ON COLUMN partner_apps.scopes IS 'API scopes (e.g., indyleague:write, indyleague:read)';

-- 4. Create external_id_mappings table
CREATE TABLE IF NOT EXISTS external_id_mappings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    entity_type "ExternalEntityType" NOT NULL,
    external_id TEXT NOT NULL,
    internal_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT external_id_mappings_unique UNIQUE (partner_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_id_mappings_partner_entity_external ON external_id_mappings(partner_id, entity_type, external_id);
CREATE INDEX IF NOT EXISTS idx_external_id_mappings_entity_internal ON external_id_mappings(entity_type, internal_id);

COMMENT ON TABLE external_id_mappings IS 'Maps partner external IDs to internal Piqle IDs';
COMMENT ON COLUMN external_id_mappings.external_id IS 'Partner-provided external ID';
COMMENT ON COLUMN external_id_mappings.internal_id IS 'Piqle internal ID';

-- 5. Create api_request_logs table
CREATE TABLE IF NOT EXISTS api_request_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_id TEXT REFERENCES partners(id) ON DELETE SET NULL,
    partner_app_id TEXT REFERENCES partner_apps(id) ON DELETE SET NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INT NOT NULL,
    duration INT NOT NULL,
    idempotency_key TEXT,
    correlation_id TEXT,
    request_body JSONB,
    response_body JSONB,
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_partner_id_created ON api_request_logs(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_partner_app_id_created ON api_request_logs(partner_app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_idempotency_key ON api_request_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_correlation_id ON api_request_logs(correlation_id);

COMMENT ON TABLE api_request_logs IS 'Audit log of all partner API requests';
COMMENT ON COLUMN api_request_logs.duration IS 'Request duration in milliseconds';

-- 6. Create idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    partner_app_id TEXT NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    request_hash TEXT,
    response_status INT NOT NULL,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    CONSTRAINT idempotency_keys_unique UNIQUE (partner_app_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_partner_app_key ON idempotency_keys(partner_app_id, key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);

COMMENT ON TABLE idempotency_keys IS 'Stores idempotency keys to prevent duplicate requests';
COMMENT ON COLUMN idempotency_keys.key IS 'The idempotency key (UUID)';
COMMENT ON COLUMN idempotency_keys.request_hash IS 'Hash of request body for validation';
COMMENT ON COLUMN idempotency_keys.expires_at IS 'When the idempotency key expires (default 24 hours)';

-- 7. Add updated_at triggers
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_partner_apps_updated_at BEFORE UPDATE ON partner_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_id_mappings_updated_at BEFORE UPDATE ON external_id_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Cleanup expired idempotency keys (optional, can be run periodically)
-- DELETE FROM idempotency_keys WHERE expires_at < NOW();

