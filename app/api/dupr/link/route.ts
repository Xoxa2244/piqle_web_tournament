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

    const body = await req.json()
    const { duprId, numericId, accessToken, refreshToken, stats } = body

    if ((!duprId && !numericId) || !accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing required fields: duprId or numericId, accessToken, refreshToken' },
        { status: 400 }
      )
    }

    // Fetch ratings from postMessage stats or DUPR API
    let duprRatingSingles: number | null = null
    let duprRatingDoubles: number | null = null

    // First, try to get ratings from postMessage stats
    // Stats come in format: { singles: "3.5" | "NR", doubles: "3.5" | "NR", ... }
    if (stats) {
      // Try singlesRating first (if present)
      if (stats.singlesRating !== undefined && stats.singlesRating !== null && stats.singlesRating !== 'NR') {
        const parsed = parseFloat(String(stats.singlesRating))
        if (!isNaN(parsed)) duprRatingSingles = parsed
      }
      // Try singles (direct field)
      if (!duprRatingSingles && stats.singles !== undefined && stats.singles !== null && stats.singles !== 'NR') {
        const parsed = parseFloat(String(stats.singles))
        if (!isNaN(parsed)) duprRatingSingles = parsed
      }
      
      // Try doublesRating first (if present)
      if (stats.doublesRating !== undefined && stats.doublesRating !== null && stats.doublesRating !== 'NR') {
        const parsed = parseFloat(String(stats.doublesRating))
        if (!isNaN(parsed)) duprRatingDoubles = parsed
      }
      // Try doubles (direct field)
      if (!duprRatingDoubles && stats.doubles !== undefined && stats.doubles !== null && stats.doubles !== 'NR') {
        const parsed = parseFloat(String(stats.doubles))
        if (!isNaN(parsed)) duprRatingDoubles = parsed
      }
    }

    // If ratings not in stats, fetch from DUPR API using /Public/getBasicInfo
    // This endpoint works with user access token and is publicly available
    if ((!duprRatingSingles || !duprRatingDoubles) && accessToken && duprId) {
      try {
        // Use /Public/getBasicInfo endpoint with duprId as query parameter
        // According to DUPR docs: This endpoint works with user access token
        const baseUrls = [
          'https://api.dupr.gg',
          'https://api.uat.dupr.gg',
        ]
        
        let response: Response | null = null
        
        // Try both production and UAT endpoints
        for (const baseUrl of baseUrls) {
          // Build URL with duprId as query parameter
          const url = `${baseUrl}/Public/getBasicInfo?duprId=${encodeURIComponent(duprId)}`
          
          console.log(`Trying DUPR API endpoint (link): ${url}`, {
            duprId,
            hasToken: !!accessToken,
          })
          
          try {
            response = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            })
            
            if (response.ok) {
              console.log(`Success with endpoint (link): ${url}`)
              break
            } else {
              // Clone response to read text without consuming body
              const responseClone = response.clone()
              const errorText = await responseClone.text()
              console.log(`Endpoint ${url} failed (link): ${response.status} - ${errorText.substring(0, 200)}`)
            }
          } catch (error: any) {
            console.log(`Endpoint ${url} error (link):`, error.message)
          }
          
          if (response && response.ok) {
            break
          }
        }
        
        if (response && response.ok) {
          const apiData = await response.json()
          console.log('DUPR API response (link):', JSON.stringify(apiData, null, 2))
          
          // Extract ratings from API response
          // Helper function to parse rating (handles "NR" and numeric values)
          const parseRating = (value: any): number | null => {
            if (value === undefined || value === null) return null
            const str = String(value).trim()
            if (str === 'NR' || str === '' || str.toLowerCase() === 'not rated') return null
            const parsed = parseFloat(str)
            return isNaN(parsed) ? null : parsed
          }
          
          // Check various possible field names and structures
          if (!duprRatingSingles && apiData.singlesRating !== undefined) {
            duprRatingSingles = parseRating(apiData.singlesRating)
          }
          if (!duprRatingDoubles && apiData.doublesRating !== undefined) {
            duprRatingDoubles = parseRating(apiData.doublesRating)
          }
          
          // Check for nested ratings object
          if (!duprRatingSingles && apiData.ratings?.singles !== undefined) {
            duprRatingSingles = parseRating(apiData.ratings.singles)
          }
          if (!duprRatingDoubles && apiData.ratings?.doubles !== undefined) {
            duprRatingDoubles = parseRating(apiData.ratings.doubles)
          }
          
          // Check for nested stats object
          if (!duprRatingSingles && apiData.stats?.singlesRating !== undefined) {
            duprRatingSingles = parseRating(apiData.stats.singlesRating)
          }
          if (!duprRatingDoubles && apiData.stats?.doublesRating !== undefined) {
            duprRatingDoubles = parseRating(apiData.stats.doublesRating)
          }
          if (!duprRatingSingles && apiData.stats?.singles !== undefined) {
            duprRatingSingles = parseRating(apiData.stats.singles)
          }
          if (!duprRatingDoubles && apiData.stats?.doubles !== undefined) {
            duprRatingDoubles = parseRating(apiData.stats.doubles)
          }
          
          // Check for direct rating fields (if API returns them directly)
          if (!duprRatingSingles && apiData.singles !== undefined) {
            duprRatingSingles = parseRating(apiData.singles)
          }
          if (!duprRatingDoubles && apiData.doubles !== undefined) {
            duprRatingDoubles = parseRating(apiData.doubles)
          }
        } else if (response) {
          // Response body already consumed in loop above, just log status
          console.warn('DUPR API request failed:', response.status)
        } else {
          console.warn('DUPR API request failed: No response received')
        }
      } catch (error) {
        console.error('Error fetching DUPR ratings from API:', error)
        // Continue without ratings - not critical
      }
    }

    // Update or create DUPR link for user
    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        duprId: duprId || undefined,
        duprNumericId: numericId ? BigInt(numericId) : undefined,
        duprAccessToken: accessToken,
        duprRefreshToken: refreshToken,
        duprRatingSingles: duprRatingSingles ? duprRatingSingles : null,
        duprRatingDoubles: duprRatingDoubles ? duprRatingDoubles : null,
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
    })
  } catch (error) {
    console.error('Error linking DUPR account:', error)
    return NextResponse.json(
      { error: 'Failed to link DUPR account' },
      { status: 500 }
    )
  }
}

