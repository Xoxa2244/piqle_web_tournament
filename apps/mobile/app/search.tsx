import { StyleSheet } from 'react-native'

import { PageLayout } from '../src/components/navigation/PageLayout'
import { EmptyState, SearchField } from '../src/components/ui'
import { palette, radius } from '../src/lib/theme'

export default function SearchScreen() {
  return (
    <PageLayout>
      <SearchField
        value=""
        onChangeText={() => {}}
        placeholder="Search tournaments, clubs, and players"
        containerStyle={styles.searchField}
      />
      <EmptyState
        title="Search is not wired yet"
        body="This screen is added to match the navigation flow from the Figma design. Next step is wiring global search to backend data."
      />
    </PageLayout>
  )
}

const styles = StyleSheet.create({
  searchField: {
    minHeight: 44,
    borderWidth: 0,
    backgroundColor: palette.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
})
