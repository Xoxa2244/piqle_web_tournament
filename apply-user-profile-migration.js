const { Client } = require('pg');

// Production database connection string
// Set DATABASE_URL environment variable or replace with your actual connection string
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please set DATABASE_URL with your database connection string');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({
    connectionString: connectionString,
    ssl: connectionString.includes('supabase') ? {
      rejectUnauthorized: false
    } : false
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Apply the migration
    const migrationSQL = `
      -- Migration: Add user profile fields (gender, city, duprLink)
      -- This migration adds fields to support user profile information

      -- Add gender field (enum: 'M', 'F', 'X')
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "gender" TEXT CHECK ("gender" IN ('M', 'F', 'X'));

      -- Add city field
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "city" TEXT;

      -- Add duprLink field
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "duprLink" TEXT;

      -- Add comments for documentation
      COMMENT ON COLUMN users."gender" IS 'User gender: M (Male), F (Female), X (Other)';
      COMMENT ON COLUMN users."city" IS 'User city';
      COMMENT ON COLUMN users."duprLink" IS 'Link to user DUPR profile';
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

applyMigration()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

