import { useState } from 'react'

import { PageLayout } from '../src/components/navigation/PageLayout'
import { EmptyState, SearchField } from '../src/components/ui'

export default function SearchScreen() {
  const [query, setQuery] = useState('')

  return (
    <PageLayout>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search tournaments, clubs, and players"
      />
      <EmptyState
        title="Search is not wired yet"
        body="This screen is added to match the navigation flow from the Figma design. Next step is wiring global search to backend data."
      />
    </PageLayout>
  )
}
