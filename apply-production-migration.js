const { Client } = require('pg');

// Production database connection string
// Replace with your actual Supabase production connection string
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:[password]@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres';

async function applyMigration() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to production database');

    // Apply the migration
    const migrationSQL = `
      -- Migration to update Player model with new fields
      -- Add new fields to players table

      ALTER TABLE players 
      ADD COLUMN IF NOT EXISTS dupr_rating DECIMAL(3,2),
      ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN DEFAULT false;

      -- Update existing dupr field from DECIMAL to VARCHAR
      -- First, create a temporary column
      ALTER TABLE players ADD COLUMN IF NOT EXISTS dupr_temp VARCHAR;

      -- Copy data from old dupr column to new temp column
      UPDATE players SET dupr_temp = dupr::text WHERE dupr IS NOT NULL;

      -- Drop the old dupr column
      ALTER TABLE players DROP COLUMN IF EXISTS dupr;

      -- Rename the temp column to dupr
      ALTER TABLE players RENAME COLUMN dupr_temp TO dupr;

      -- Add comment to clarify the change
      COMMENT ON COLUMN players.dupr IS 'DUPR ID as string identifier';
      COMMENT ON COLUMN players.dupr_rating IS 'DUPR rating from 0.00 to 5.00';
      COMMENT ON COLUMN players.is_paid IS 'Payment status of the player';
      COMMENT ON COLUMN players.is_waitlist IS 'Whether player is on waitlist';
    `;

    await client.query(migrationSQL);
    console.log('Migration applied successfully!');

  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await client.end();
  }
}

applyMigration();
