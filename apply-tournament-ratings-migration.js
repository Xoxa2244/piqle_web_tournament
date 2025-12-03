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

    // Read migration SQL from file
    const fs = require('fs');
    const path = require('path');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'prisma', 'migrations', 'add-tournament-ratings.sql'),
      'utf8'
    );

    await client.query(migrationSQL);
    console.log('Migration applied successfully!');
    console.log('Created tournament_ratings table with RatingType enum');

  } catch (error) {
    console.error('Error applying migration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration();

