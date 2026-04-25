export function buildReactivationDraft({
  memberName,
  clubName,
  daysSinceLastActivity,
}: {
  memberName: string
  clubName?: string | null
  daysSinceLastActivity?: number | null
}) {
  const firstName = memberName.split(' ')[0] || memberName
  const safeClubName = clubName || 'your club'
  const safeDays = typeof daysSinceLastActivity === 'number' && Number.isFinite(daysSinceLastActivity)
    ? daysSinceLastActivity
    : 21

  return `Hey ${firstName}, we miss you!\n\nIt's been ${safeDays} days since your last session at ${safeClubName}. We've got some great sessions coming up that match your level - come back and play!`
}
