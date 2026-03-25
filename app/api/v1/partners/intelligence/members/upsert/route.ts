import { NextRequest, NextResponse } from 'next/server'
import { withPartnerAuth } from '@/server/utils/partnerApiMiddleware'
import { prisma } from '@/lib/prisma'
import { setExternalIdMapping, getInternalId } from '@/server/utils/externalIdMapping'
import { validatePartnerClubAccess } from '@/server/utils/partnerClubBinding'
import { z } from 'zod'

const memberSchema = z.object({
  externalMemberId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  gender: z.enum(['M', 'F', 'X']).optional(),
  city: z.string().optional(),
  duprRatingSingles: z.number().min(0).max(8).optional(),
  duprRatingDoubles: z.number().min(0).max(8).optional(),
  // Preferences
  preferredDays: z.array(z.string()).optional(),
  preferredFormats: z.array(z.string()).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  targetSessionsPerWeek: z.number().int().min(0).max(14).optional(),
})

const upsertMembersSchema = z.object({
  clubId: z.string().uuid(),
  members: z.array(memberSchema).min(1).max(200),
})

export const POST = withPartnerAuth(
  async (req: NextRequest, context) => {
    const body = await req.json()
    const validated = upsertMembersSchema.parse(body)

    await validatePartnerClubAccess(context.partnerId, validated.clubId)

    const results: Array<{
      externalMemberId: string
      internalUserId?: string
      status: 'created' | 'updated' | 'matched'
      error?: string
    }> = []

    for (const member of validated.members) {
      try {
        // 1. Try ExternalIdMapping lookup
        let userId = await getInternalId(
          context.partnerId,
          'MEMBER',
          member.externalMemberId
        )

        let status: 'created' | 'updated' | 'matched' = 'updated'

        if (userId) {
          // Mapping exists — update user
          const existingUser = await prisma.user.findUnique({
            where: { id: userId },
          })

          if (existingUser) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                name: member.name,
                phone: member.phone ?? existingUser.phone,
                gender: member.gender ?? existingUser.gender,
                city: member.city ?? existingUser.city,
                duprRatingSingles: member.duprRatingSingles ?? existingUser.duprRatingSingles,
                duprRatingDoubles: member.duprRatingDoubles ?? existingUser.duprRatingDoubles,
              },
            })
            status = 'updated'
          } else {
            // Mapping exists but user deleted — will recreate below
            userId = null
          }
        }

        if (!userId) {
          // 2. Try email match
          const existingByEmail = await prisma.user.findUnique({
            where: { email: member.email.toLowerCase() },
          })

          if (existingByEmail) {
            userId = existingByEmail.id
            status = 'matched'

            // Update user data
            await prisma.user.update({
              where: { id: userId },
              data: {
                name: member.name || existingByEmail.name,
                phone: member.phone ?? existingByEmail.phone,
                gender: member.gender ?? existingByEmail.gender,
                city: member.city ?? existingByEmail.city,
                duprRatingSingles: member.duprRatingSingles ?? existingByEmail.duprRatingSingles,
                duprRatingDoubles: member.duprRatingDoubles ?? existingByEmail.duprRatingDoubles,
              },
            })
          } else {
            // 3. Create new user
            const newUser = await prisma.user.create({
              data: {
                email: member.email.toLowerCase(),
                name: member.name,
                phone: member.phone || null,
                gender: member.gender || null,
                city: member.city || null,
                duprRatingSingles: member.duprRatingSingles || null,
                duprRatingDoubles: member.duprRatingDoubles || null,
              },
            })
            userId = newUser.id
            status = 'created'
          }

          // Create/update external ID mapping
          await setExternalIdMapping(
            context.partnerId,
            'MEMBER',
            member.externalMemberId,
            userId
          )
        }

        // Ensure ClubFollower exists
        await prisma.clubFollower.upsert({
          where: {
            clubId_userId: {
              clubId: validated.clubId,
              userId,
            },
          },
          create: {
            clubId: validated.clubId,
            userId,
          },
          update: {},
        })

        // Update preferences if provided
        if (member.preferredDays || member.preferredFormats || member.skillLevel || member.targetSessionsPerWeek) {
          await prisma.userPlayPreference.upsert({
            where: {
              userId_clubId: {
                userId,
                clubId: validated.clubId,
              },
            },
            create: {
              userId,
              clubId: validated.clubId,
              preferredDays: member.preferredDays || [],
              preferredFormats: member.preferredFormats || [],
              skillLevel: member.skillLevel || 'ALL_LEVELS',
              targetSessionsPerWeek: member.targetSessionsPerWeek || 2,
            },
            update: {
              ...(member.preferredDays && { preferredDays: member.preferredDays }),
              ...(member.preferredFormats && { preferredFormats: member.preferredFormats }),
              ...(member.skillLevel && { skillLevel: member.skillLevel }),
              ...(member.targetSessionsPerWeek !== undefined && { targetSessionsPerWeek: member.targetSessionsPerWeek }),
            },
          })
        }

        results.push({
          externalMemberId: member.externalMemberId,
          internalUserId: userId,
          status,
        })
      } catch (error: any) {
        console.error(`Error upserting member ${member.externalMemberId}:`, error)
        results.push({
          externalMemberId: member.externalMemberId,
          status: 'updated',
          error: error.message || 'Failed to upsert member',
        })
      }
    }

    return NextResponse.json({ items: results })
  },
  {
    requiredScope: 'intelligence:write',
    requireIdempotency: true,
  }
)
