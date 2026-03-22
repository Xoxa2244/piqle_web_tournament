import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { tournamentPlaceholder } from '../constants/images'
import { isRemoteImageUri } from '../lib/imageUri'

type Props = {
  imageUri?: string | null
  /** Сторона квадрата (как «sm» на вебе для списков) */
  size?: number
}

/**
 * Обложка турнира: remote URL или тот же плейсхолдер, что `public/tournament-placeholder.png` на вебе.
 */
export function TournamentThumbnail({ imageUri, size = 48 }: Props) {
  const [failed, setFailed] = useState(false)
  const showRemote = Boolean(imageUri && isRemoteImageUri(imageUri) && !failed)
  /** Круг, как у аватаров в списках */
  const r = size / 2

  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: r }]}>
      {showRemote ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: imageUri! }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: r }]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          source={tournamentPlaceholder}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  /** Иначе в строке с длинным названием ивента RN сжимает картинку до 0 */
  box: {
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    flexShrink: 0,
  },
})
