const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkDivisions() {
  try {
    console.log('Checking divisions and pools...')
    
    const divisions = await prisma.division.findMany({
      include: {
        pools: true,
        _count: {
          select: {
            pools: true,
            teams: true
          }
        }
      }
    })
    
    console.log(`Found ${divisions.length} divisions:`)
    
    divisions.forEach(division => {
      console.log(`\nDivision: ${division.name}`)
      console.log(`  ID: ${division.id}`)
      console.log(`  poolCount: ${division.poolCount}`)
      console.log(`  Actual pools: ${division._count.pools}`)
      console.log(`  Teams: ${division._count.teams}`)
      
      if (division.pools.length > 0) {
        console.log(`  Pool details:`)
        division.pools.forEach(pool => {
          console.log(`    - ${pool.name} (order: ${pool.order})`)
        })
      }
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDivisions()
