import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { PageLayout } from './navigation/PageLayout'
import { LoadingBlock } from './ui'
import { spacing } from '../lib/theme'

type ChatScreenLoadingProps = {
  title: string
  label?: string
}

/** Тот же каркас, что у экранов чата (TopBar + chat ambient), с `LoadingBlock` по центру. */
export function ChatScreenLoading({ title, label = 'Loading chat…' }: ChatScreenLoadingProps) {
  const styles = useMemo(() => createStyles(), [])
  return (
    <PageLayout chatAmbient scroll={false} contentStyle={styles.shell} topBarTitle={title}>
      <View style={styles.center}>
        <LoadingBlock label={label} />
      </View>
    </PageLayout>
  )
}

const createStyles = () =>
  StyleSheet.create({
    shell: {
      flex: 1,
      minHeight: 0,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: 32,
    },
  })
