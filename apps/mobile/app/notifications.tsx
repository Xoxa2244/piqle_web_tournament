import { PageLayout } from '../src/components/navigation/PageLayout'
import { EmptyState } from '../src/components/ui'

export default function NotificationsScreen() {
  return (
    <PageLayout>
      <EmptyState
        title="Notifications"
        body="This route now matches the top bar flow from the Figma design. We can wire it to the existing notifications feed next."
      />
    </PageLayout>
  )
}
