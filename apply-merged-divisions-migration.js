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
      -- Migration: Add merged divisions support
      -- This migration adds fields to support merging two divisions into one temporary merged division

      -- Add isMerged boolean field
      ALTER TABLE divisions ADD COLUMN IF NOT EXISTS "isMerged" BOOLEAN NOT NULL DEFAULT false;

      -- Add mergedFromDivisionIds JSON field to store array of original division IDs
      ALTER TABLE divisions ADD COLUMN IF NOT EXISTS "mergedFromDivisionIds" JSONB;
    `;

    await client.query(migrationSQL);
    console.log('Migration applied successfully!');

  } catch (error) {
    console.error('Error applying migration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration();

