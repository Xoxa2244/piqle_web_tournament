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
      -- Migration: Add user profile fields (gender, city, duprLink)
      -- This migration adds fields to support user profile information

      -- Create Gender enum if it doesn't exist
      DO $$ BEGIN
          CREATE TYPE "Gender" AS ENUM ('M', 'F', 'X');
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      -- Add gender column to users table
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS gender "Gender";

      -- Add city column to users table
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS city VARCHAR(255);

      -- Add duprLink column to users table
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "duprLink" VARCHAR(255);

      -- Add comments for clarity
      COMMENT ON COLUMN users.gender IS 'User gender: M (Male), F (Female), X (Other)';
      COMMENT ON COLUMN users.city IS 'User city/location';
      COMMENT ON COLUMN users."duprLink" IS 'Link to DUPR profile';
    `;

    await client.query(migrationSQL);
    console.log('Migration applied successfully!');
    console.log('Added columns: gender, city, duprLink to users table');

  } catch (error) {
    console.error('Error applying migration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration();

