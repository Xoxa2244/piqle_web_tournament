import { forwardRef, type ReactNode } from 'react'
import { ScrollView, type ScrollViewProps, StyleSheet, View } from 'react-native'

type Props = Omit<ScrollViewProps, 'children'> & {
  children: ReactNode
}

/**
 * Прокрутка ленты сообщений; фон — полноэкранный градиент родителя (`Screen chatAmbient`).
 */
export const ChatThreadRoot = forwardRef<ScrollView, Props>(function ChatThreadRoot(
  { children, onContentSizeChange, style, ...scrollProps },
  ref
) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        {...scrollProps}
        style={[styles.scroll, style]}
        onContentSizeChange={onContentSizeChange}
      >
        {children}
      </ScrollView>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
})
