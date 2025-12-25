import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export async function GET() {
  const dbUrl = process.env.DATABASE_URL
  
  if (!dbUrl) {
    return NextResponse.json({
      success: false,
      error: 'DATABASE_URL is not set',
      timestamp: new Date().toISOString(),
    }, { status: 400 })
  }

  // Mask password in URL for display
  let maskedUrl = dbUrl
  try {
    const url = new URL(dbUrl)
    maskedUrl = `${url.protocol}//${url.username}:***@${url.host}${url.pathname}${url.search}`
  } catch (e) {
    // URL parsing failed
  }

  // Try to connect and execute a simple query
  let testClient: PrismaClient | null = null
  const result: any = {
    databaseUrl: maskedUrl,
    timestamp: new Date().toISOString(),
    tests: {},
  }

  try {
    // Create a new Prisma client instance for testing
    testClient = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    })

    // Test 1: Simple query (SELECT 1)
    try {
      const queryResult = await testClient.$queryRaw<Array<{ '?column?': number }>>`SELECT 1 as "?column?"`
      result.tests.simpleQuery = {
        success: true,
        result: queryResult[0],
        message: 'Connection successful - simple query works',
      }
    } catch (error: any) {
      result.tests.simpleQuery = {
        success: false,
        error: error.message,
        code: error.code,
        hint: getErrorHint(error),
      }
    }

    // Test 2: Get current database name
    try {
      const dbResult = await testClient.$queryRaw<Array<{ current_database: string }>>`
        SELECT current_database();
      `
      result.tests.getDatabaseName = {
        success: true,
        databaseName: dbResult[0]?.current_database,
        message: 'Successfully retrieved database name',
      }
    } catch (error: any) {
      result.tests.getDatabaseName = {
        success: false,
        error: error.message,
        code: error.code,
      }
    }

    // Test 3: Check if partners table exists
    try {
      const tableCheck = await testClient.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'partners'
        ) as exists;
      `
      result.tests.checkPartnersTable = {
        success: true,
        exists: tableCheck[0]?.exists || false,
        message: tableCheck[0]?.exists 
          ? 'Partners table exists' 
          : 'Partners table does NOT exist (migration may be needed)',
      }
    } catch (error: any) {
      result.tests.checkPartnersTable = {
        success: false,
        error: error.message,
        code: error.code,
      }
    }

    // Test 4: Get PostgreSQL version
    try {
      const versionResult = await testClient.$queryRaw<Array<{ version: string }>>`
        SELECT version();
      `
      result.tests.getVersion = {
        success: true,
        version: versionResult[0]?.version,
        message: 'Successfully retrieved PostgreSQL version',
      }
    } catch (error: any) {
      result.tests.getVersion = {
        success: false,
        error: error.message,
      }
    }

    // Overall result
    const allTestsPassed = Object.values(result.tests).every((test: any) => test.success)
    result.success = allTestsPassed
    result.summary = allTestsPassed
      ? 'All connection tests passed! Database connection is working correctly.'
      : 'Some connection tests failed. Check individual test results below.'

  } catch (error: any) {
    result.success = false
    result.error = error.message
    result.code = error.code
    result.hint = getErrorHint(error)
  } finally {
    // Disconnect the test client
    if (testClient) {
      try {
        await testClient.$disconnect()
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  })
}

function getErrorHint(error: any): string {
  const message = error.message?.toLowerCase() || ''
  const code = error.code || ''

  if (message.includes('password') || message.includes('authentication')) {
    return '❌ Password or authentication failed. Check if the password in DATABASE_URL is correct.'
  }
  
  if (message.includes('does not exist') || code === 'P2021') {
    return '⚠️ Database or table does not exist. You may need to run migrations.'
  }
  
  if (message.includes('connection') || message.includes('timeout') || message.includes('refused')) {
    return '❌ Connection failed. Check if the host, port, and network access are correct.'
  }
  
  if (message.includes('protocol') || message.includes('url must start')) {
    return '❌ Invalid DATABASE_URL format. Must start with postgresql:// or postgres://'
  }

  if (code === '28P01') {
    return '❌ Authentication failed. Wrong username or password.'
  }

  if (code === '3D000') {
    return '❌ Database does not exist. Check the database name in DATABASE_URL.'
  }

  return 'Check the error message above for details.'
}

