import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { tournamentPlaceholder } from '../constants/images'
import { entityPlaceholderBackground } from '../lib/theme'
import { isRemoteImageUri } from '../lib/imageUri'
import { useAppTheme } from '../providers/ThemeProvider'
import { AvatarInitialsBadge } from './AvatarInitialsBadge'

type Props = {
  uri?: string | null
  size?: number
  /**
   * Без фото: `initials` — дефолт для user/avatar мест;
   * `tournament` — плейсхолдер-мячик для не-user сущностей; `icon` — нейтральная иконка.
   */
  fallback?: 'tournament' | 'icon' | 'initials'
  /** Имя/email для `AvatarInitialsBadge`, когда `fallback="initials"` */
  initialsLabel?: string
}

/**
 * Аватар пользователя: remote — cover; без фото — по `fallback`.
 */
export function RemoteUserAvatar({
  uri,
  size = 32,
  fallback = 'initials',
  initialsLabel = 'User',
}: Props) {
  const { colors, theme } = useAppTheme()
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(uri && isRemoteImageUri(uri) && !failed)
  const r = size / 2
  const iconSize = Math.max(14, Math.round(size * 0.48))

  if (!showImage && fallback === 'initials') {
    return <AvatarInitialsBadge label={initialsLabel || 'User'} size={size} />
  }

  const ringBackground =
    showImage || fallback === 'tournament'
      ? { backgroundColor: 'transparent' as const }
      : { backgroundColor: entityPlaceholderBackground(theme, colors) }

  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: r }, ringBackground]}>
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: uri! }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: r, borderWidth: 0 }]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : fallback === 'tournament' ? (
        <Image
          accessibilityIgnoresInvertColors
          source={tournamentPlaceholder}
          style={{ width: size, height: size, backgroundColor: entityPlaceholderBackground(theme, colors) }}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.fallbackIcon, { borderRadius: r, backgroundColor: entityPlaceholderBackground(theme, colors) }]}>
          <Feather name="user" size={iconSize} color={colors.textMuted} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
