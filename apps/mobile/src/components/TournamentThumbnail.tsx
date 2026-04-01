import { StyleSheet, View } from 'react-native'

import { entityPlaceholderBackground } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { EntityImage } from './EntityImage'

type Props = {
  imageUri?: string | null
  /** Сторона квадрата (как «sm» на вебе для списков) */
  size?: number
}

/**
 * Обложка турнира: remote URL или тот же плейсхолдер, что `public/tournament-placeholder.png` на вебе.
 */
export function TournamentThumbnail({ imageUri, size = 48 }: Props) {
  const { colors, theme } = useAppTheme()
  /** Как в `ClubCard`: скруглённый квадрат + видимый фон под плейсхолдером */
  const r = 14

  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: r, backgroundColor: entityPlaceholderBackground(theme, colors) },
      ]}
    >
      <EntityImage
        uri={imageUri}
        style={{ width: size, height: size, borderRadius: r }}
        resizeMode="cover"
        placeholderResizeMode="contain"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  /** Иначе в строке с длинным названием ивента RN сжимает картинку до 0 */
  box: {
    overflow: 'hidden',
    flexShrink: 0,
  },
})
