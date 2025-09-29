const { PrismaClient } = require('@prisma/client')

async function checkDatabase() {
  console.log('🔍 Checking database state...')
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Disable prepared statements for Transaction pooler compatibility
    __internal: {
      engine: {
        preparedStatements: false,
      },
    },
  })

  try {
    // Test connection
    await prisma.$connect()
    console.log('✅ Database connection successful!')

    // Check tournaments
    const tournaments = await prisma.tournament.findMany()
    console.log(`\n📊 Found ${tournaments.length} tournaments:`)
    tournaments.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.title} (${t.publicSlug}) - Created: ${t.createdAt}`)
    })

    // Check divisions
    const divisions = await prisma.division.findMany()
    console.log(`\n🏆 Found ${divisions.length} divisions:`)
    divisions.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.name} (Tournament: ${d.tournamentId})`)
    })

    // Check users
    const users = await prisma.user.findMany()
    console.log(`\n👥 Found ${users.length} users:`)
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.email} (${u.role})`)
    })

    // Check for duplicate publicSlugs
    const publicSlugs = tournaments.map(t => t.publicSlug)
    const duplicates = publicSlugs.filter((slug, index) => publicSlugs.indexOf(slug) !== index)
    if (duplicates.length > 0) {
      console.log(`\n⚠️  Found duplicate publicSlugs: ${duplicates.join(', ')}`)
    } else {
      console.log('\n✅ No duplicate publicSlugs found')
    }

  } catch (error) {
    console.log('\n❌ Database check failed:')
    console.log('Error:', error.message)
    console.log('Code:', error.code)
  } finally {
    await prisma.$disconnect()
    console.log('\n🔌 Database disconnected')
  }
}

checkDatabase()
