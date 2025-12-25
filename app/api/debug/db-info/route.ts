import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get DATABASE_URL from environment (mask password)
    const dbUrl = process.env.DATABASE_URL || 'Not set'
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@') // Mask password
    
    // Try to query database to see which one we're connected to
    const result = await prisma.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database();
    `
    
    const dbName = result[0]?.current_database || 'Unknown'
    
    // Check if partners table exists
    const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'partners'
      ) as exists;
    `
    
    const partnersTableExists = tableCheck[0]?.exists || false
    
    return NextResponse.json({
      databaseUrl: maskedUrl,
      databaseName: dbName,
      partnersTableExists,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 })
  }
}

