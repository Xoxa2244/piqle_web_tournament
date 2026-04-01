import { forwardRef, type ReactNode } from 'react'
import { ScrollView, type ScrollViewProps, StyleSheet, View } from 'react-native'

type Props = Omit<ScrollViewProps, 'children'> & {
  children: ReactNode
}

/**
 * Прокрутка ленты сообщений; фон — полноэкранный градиент родителя (`Screen chatAmbient`).
 */
export const ChatThreadRoot = forwardRef<ScrollView, Props>(function ChatThreadRoot(
  { children, onContentSizeChange, style, contentContainerStyle, ...scrollProps },
  ref
) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        {...scrollProps}
        style={[styles.scroll, style]}
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
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
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
})
