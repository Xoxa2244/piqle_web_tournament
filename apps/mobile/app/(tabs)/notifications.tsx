import { PageLayout } from '../../src/components/navigation/PageLayout'
import { EmptyState, SurfaceCard } from '../../src/components/ui'

export default function NotificationsScreen() {
  return (
    <PageLayout>
      <SurfaceCard tone="soft">
        <EmptyState title="Notifications" body="This route now matches the top bar flow from the Figma design. We can wire it to the existing notifications feed next." />
      </SurfaceCard>
    </PageLayout>
  )
}
