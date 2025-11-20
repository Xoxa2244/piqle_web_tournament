const { Client } = require('pg');

// Production database connection string
// Uses DATABASE_URL from environment or can be set manually
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please set DATABASE_URL with your database connection string.');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({
    connectionString: connectionString,
    ssl: connectionString.includes('supabase.co') ? {
      rejectUnauthorized: false
    } : false
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Apply the migration
    const migrationSQL = `
      -- Migration: Add user profile fields (gender, city, duprLink)
      -- This migration adds fields to the users table to support user profiles

      -- Add gender field (ENUM: M, F, X)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "gender" VARCHAR(1);

      -- Add city field (string)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "city" VARCHAR(255);

      -- Add duprLink field (string, nullable URL)
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "duprLink" VARCHAR(255);

      -- Add comment to clarify the fields
      COMMENT ON COLUMN users.gender IS 'User gender: M (Male), F (Female), X (Other)';
      COMMENT ON COLUMN users.city IS 'User city/location';
      COMMENT ON COLUMN users.duprLink IS 'Link to user DUPR profile';
    `;

    await client.query(migrationSQL);
    console.log('✓ Migration applied successfully!');
    console.log('✓ Added columns: gender, city, duprLink to users table');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    if (error.code === 'P2022' || error.message.includes('does not exist')) {
      console.error('\nThis might indicate that the table structure is different than expected.');
      console.error('Please verify your database schema and Prisma schema are in sync.');
    }
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed!');
    process.exit(1);
  });

