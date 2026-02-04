export const sendWaitlistPromotionNotification = async ({
  userId,
  tournamentId,
  divisionName,
  teamName,
}: {
  userId: string | null
  tournamentId: string
  divisionName: string
  teamName?: string | null
}) => {
  if (!userId) {
    return
  }

  // TODO: Replace with real push notification provider (FCM/APNS/OneSignal).
  console.log('[push] waitlist_promotion', {
    userId,
    tournamentId,
    divisionName,
    teamName,
  })
}
