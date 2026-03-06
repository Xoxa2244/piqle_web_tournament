import { PageLayout } from '../../src/components/navigation/PageLayout'
import { EmptyState, SearchField, SurfaceCard } from '../../src/components/ui'

export default function SearchScreen() {
  return (
    <PageLayout>
      <SurfaceCard tone="soft">
        <SearchField value="" onChangeText={() => {}} placeholder="Search tournaments, clubs, and players" />
      </SurfaceCard>
      <EmptyState title="Search is not wired yet" body="This screen is added to match the navigation flow from the Figma design. Next step is wiring global search to backend data." />
    </PageLayout>
  )
}
