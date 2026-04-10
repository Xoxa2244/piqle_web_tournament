import { verifyInterestToken } from '@/lib/utils/interest-token'
import { prisma } from '@/lib/prisma'
import { NotifyMeForm } from './_components/NotifyMeForm'

export default async function NotifyMePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const params = await searchParams
  const token = params.t

  if (!token) return <ErrorCard message="Invalid link — no token provided." />

  const decoded = verifyInterestToken(token)
  if (!decoded) return <ErrorCard message="This link has expired or is invalid. Please ask the club for a new one." />

  const [user, club, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: decoded.userId }, select: { name: true, email: true } }),
    prisma.club.findUnique({ where: { id: decoded.clubId }, select: { name: true } }),
    prisma.sessionInterestRequest.findFirst({ where: { userId: decoded.userId, clubId: decoded.clubId } }),
  ])

  if (!user || !club) return <ErrorCard message="Link is no longer valid." />

  const existingPrefs = existing ? {
    preferredDays: existing.preferredDays,
    preferredFormats: existing.preferredFormats,
    preferredTimeSlots: existing.preferredTimeSlots as { morning: boolean; afternoon: boolean; evening: boolean },
  } : undefined

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0a0f' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }}>
            ✨ IQSport Intelligence
          </div>
          <h1 className="text-2xl font-bold text-white">{club.name}</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Session availability notification</p>
        </div>
        <NotifyMeForm
          token={token}
          memberName={user.name || user.email?.split('@')[0] || 'there'}
          clubName={club.name}
          existing={existingPrefs}
        />
      </div>
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0a0f' }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">😕</div>
        <div className="text-white font-bold text-lg mb-2">Invalid Link</div>
        <div className="text-sm" style={{ color: '#6B7280' }}>{message}</div>
      </div>
    </div>
  )
}
