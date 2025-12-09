import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user with DUPR tokens
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        duprId: true,
        duprAccessToken: true,
        duprRefreshToken: true,
      },
    })

    if (!user || !user.duprId || !user.duprAccessToken) {
      return NextResponse.json(
        { error: 'DUPR account not linked or tokens missing' },
        { status: 400 }
      )
    }

    // Fetch ratings from DUPR API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    try {
      // Use production API: /user/{version}/{id}
      // According to Swagger: This API provides details like full name, singles and doubles ratings
      // Note: Use user's access token, not partner token
      // Based on DUPR email, production API base URL is https://prod.mydupr.com
      const duprApiUrl = process.env.NEXT_PUBLIC_DUPR_API_URL || 'https://prod.mydupr.com'
      
      // Try different endpoint variations
      const endpoints = [
        `/api/user/v1.0/${user.duprId}`,
        `/user/v1.0/${user.duprId}`,
        `/api/v1.0/user/${user.duprId}`,
        `/user/v1.0/${user.duprId}/details`,
      ]
      
      let response: Response | null = null
      let lastError: string = ''
      
      for (const endpoint of endpoints) {
        const url = `${duprApiUrl}${endpoint}`
        console.log(`Trying DUPR API endpoint: ${url}`)
        
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${user.duprAccessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          })
          
          if (response.ok) {
            console.log(`Success with endpoint: ${endpoint}`)
            break
          } else {
            const errorText = await response.text()
            console.log(`Endpoint ${endpoint} failed: ${response.status} - ${errorText}`)
            lastError = `${response.status}: ${errorText}`
          }
        } catch (error: any) {
          console.log(`Endpoint ${endpoint} error:`, error.message)
          lastError = error.message
        }
      }
      
      if (!response || !response.ok) {
        const errorText = lastError || (response ? await response.text() : 'No response')
        console.warn('All DUPR API endpoints failed. Last error:', errorText)
        
        // If token expired, return error
        if (response?.status === 401) {
          return NextResponse.json(
            { error: 'DUPR token expired. Please reconnect your DUPR account.' },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR. Tried multiple endpoints. Last error: ${errorText}` },
          { status: response?.status || 500 }
        )
      }
      
      if (response && response.ok) {
        const apiData = await response.json()
        console.log('DUPR API response (refresh):', JSON.stringify(apiData, null, 2))
        
        // Extract ratings from API response
        // According to Swagger: response contains singles and doubles ratings
        // Check various possible field names and structures
        if (apiData.singlesRating !== undefined && apiData.singlesRating !== null) {
          duprRatingSingles = parseFloat(String(apiData.singlesRating))
        }
        if (apiData.doublesRating !== undefined && apiData.doublesRating !== null) {
          duprRatingDoubles = parseFloat(String(apiData.doublesRating))
        }
        
        // Check for nested ratings object
        if (!duprRatingSingles && apiData.ratings?.singles !== undefined && apiData.ratings?.singles !== null) {
          duprRatingSingles = parseFloat(String(apiData.ratings.singles))
        }
        if (!duprRatingDoubles && apiData.ratings?.doubles !== undefined && apiData.ratings?.doubles !== null) {
          duprRatingDoubles = parseFloat(String(apiData.ratings.doubles))
        }
        
        // Check for nested stats object
        if (!duprRatingSingles && apiData.stats?.singlesRating !== undefined && apiData.stats?.singlesRating !== null) {
          duprRatingSingles = parseFloat(String(apiData.stats.singlesRating))
        }
        if (!duprRatingDoubles && apiData.stats?.doublesRating !== undefined && apiData.stats?.doublesRating !== null) {
          duprRatingDoubles = parseFloat(String(apiData.stats.doublesRating))
        }
        
        // Check for direct rating fields (if API returns them directly)
        if (!duprRatingSingles && apiData.singles !== undefined && apiData.singles !== null) {
          duprRatingSingles = parseFloat(String(apiData.singles))
        }
        if (!duprRatingDoubles && apiData.doubles !== undefined && apiData.doubles !== null) {
          duprRatingDoubles = parseFloat(String(apiData.doubles))
        }
        // If token expired, return error
        if (response?.status === 401) {
          return NextResponse.json(
            { error: 'DUPR token expired. Please reconnect your DUPR account.' },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to fetch ratings from DUPR. Tried multiple endpoints. Last error: ${lastError || 'Unknown error'}` },
          { status: response?.status || 500 }
        )
      }
    } catch (error) {
      console.error('Error fetching DUPR ratings from API:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ratings from DUPR API' },
        { status: 500 }
      )
    }

    // Update ratings in database
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        duprRatingSingles: duprRatingSingles !== null ? duprRatingSingles : null,
        duprRatingDoubles: duprRatingDoubles !== null ? duprRatingDoubles : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        duprId: true,
        duprRatingSingles: true,
        duprRatingDoubles: true,
      },
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
      ratings: {
        singles: duprRatingSingles,
        doubles: duprRatingDoubles,
      },
    })
  } catch (error) {
    console.error('Error refreshing DUPR ratings:', error)
    return NextResponse.json(
      { error: 'Failed to refresh DUPR ratings' },
      { status: 500 }
    )
  }
}

