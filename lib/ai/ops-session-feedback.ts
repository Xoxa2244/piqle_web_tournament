export type OpsSessionLiveFeedbackStatus = 'ahead' | 'tracking' | 'behind' | 'at_risk'

export interface OpsSessionLiveFeedbackInput {
  projectedOccupancy: number
  maxPlayers: number
  confirmedCount: number
  waitlistCount?: number
  sessionDate: string | Date
}

export interface OpsSessionLiveFeedback {
  status: OpsSessionLiveFeedbackStatus
  actualOccupancy: number
  projectedOccupancy: number
  occupancyDelta: number
  confirmedCount: number
  spotsRemaining: number
  waitlistCount: number
  sessionDate: string
  summary: string
  recommendedAction: string
}

export function buildOpsSessionLiveFeedback(input: OpsSessionLiveFeedbackInput, now = new Date()): OpsSessionLiveFeedback {
  const maxPlayers = Math.max(1, input.maxPlayers || 1)
  const confirmedCount = Math.max(0, input.confirmedCount || 0)
  const waitlistCount = Math.max(0, input.waitlistCount || 0)
  const actualOccupancy = Math.max(0, Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)))
  const occupancyDelta = actualOccupancy - input.projectedOccupancy
  const sessionDate = input.sessionDate instanceof Date ? input.sessionDate : new Date(input.sessionDate)
  const sessionDateIso = Number.isNaN(sessionDate.getTime()) ? new Date().toISOString() : sessionDate.toISOString()
  const hoursUntilSession = (sessionDate.getTime() - now.getTime()) / (60 * 60 * 1000)
  const spotsRemaining = Math.max(0, maxPlayers - confirmedCount)

  const status: OpsSessionLiveFeedbackStatus =
    waitlistCount > 0 || occupancyDelta >= 10
      ? 'ahead'
      : hoursUntilSession <= 72 && actualOccupancy < Math.max(50, input.projectedOccupancy - 15)
        ? 'at_risk'
        : occupancyDelta <= -12
          ? 'behind'
          : 'tracking'

  const summary =
    status === 'ahead'
      ? waitlistCount > 0
        ? `Live demand is ahead of plan with ${waitlistCount} player${waitlistCount === 1 ? '' : 's'} already on the waitlist.`
        : `This session is beating projection by ${occupancyDelta} fill point${Math.abs(occupancyDelta) === 1 ? '' : 's'}.`
      : status === 'at_risk'
        ? `This session is close enough to launch that the current ${actualOccupancy}% fill is now a same-week risk.`
        : status === 'behind'
          ? `Live bookings are ${Math.abs(occupancyDelta)} fill point${Math.abs(occupancyDelta) === 1 ? '' : 's'} behind projection so far.`
          : 'This session is tracking close to the original publish projection.'

  const recommendedAction =
    status === 'ahead'
      ? 'Watch the waitlist and consider whether another similar window should follow if demand holds.'
      : status === 'at_risk'
        ? 'Open the schedule and prepare a fill action or a quick ops check before the session window gets too close.'
        : status === 'behind'
          ? 'Watch bookings and consider a fill push if this stays soft into the next review window.'
          : 'Keep monitoring bookings, but no immediate intervention is needed yet.'

  return {
    status,
    actualOccupancy,
    projectedOccupancy: input.projectedOccupancy,
    occupancyDelta,
    confirmedCount,
    spotsRemaining,
    waitlistCount,
    sessionDate: sessionDateIso,
    summary,
    recommendedAction,
  }
}
