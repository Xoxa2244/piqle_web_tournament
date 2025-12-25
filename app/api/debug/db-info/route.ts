import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get DATABASE_URL from environment (mask password)
    const dbUrl = process.env.DATABASE_URL || 'Not set'
    
    // Show URL info without password
    let maskedUrl = 'Not set'
    let urlInfo: any = {}
    
    if (dbUrl && dbUrl !== 'Not set') {
      try {
        const url = new URL(dbUrl)
        maskedUrl = `${url.protocol}//${url.username}:***@${url.host}${url.pathname}${url.search}`
        urlInfo = {
          protocol: url.protocol,
          host: url.host,
          pathname: url.pathname,
          hasPassword: !!url.password,
          username: url.username,
        }
      } catch (e) {
        // URL parsing failed - show first 50 chars
        maskedUrl = dbUrl.substring(0, 50) + (dbUrl.length > 50 ? '...' : '')
        urlInfo = { error: 'Invalid URL format', rawLength: dbUrl.length }
      }
    }
    
    // Try to query database to see which one we're connected to
    let dbName = 'Unknown'
    let partnersTableExists = false
    let connectionError: string | null = null
    
    try {
      const result = await prisma.$queryRaw<Array<{ current_database: string }>>`
        SELECT current_database();
      `
      dbName = result[0]?.current_database || 'Unknown'
      
      // Check if partners table exists
      const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'partners'
        ) as exists;
      `
      partnersTableExists = tableCheck[0]?.exists || false
    } catch (dbError: any) {
      connectionError = dbError.message
    }
    
    return NextResponse.json({
      databaseUrl: maskedUrl,
      urlInfo,
      databaseName: dbName,
      partnersTableExists,
      connectionError,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
      databaseUrl: process.env.DATABASE_URL ? 'Set but invalid' : 'Not set',
    }, { status: 500 })
  }
}

