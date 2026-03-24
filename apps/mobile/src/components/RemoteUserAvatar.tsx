import { Feather } from '@expo/vector-icons'
import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { tournamentPlaceholder } from '../constants/images'
import { isRemoteImageUri } from '../lib/imageUri'
import { AvatarBadge } from './ui'

type Props = {
  uri?: string | null
  size?: number
  /**
   * Без фото: `initials` — дефолт для user/avatar мест;
   * `tournament` — плейсхолдер-мячик для не-user сущностей; `icon` — нейтральная иконка.
   */
  fallback?: 'tournament' | 'icon' | 'initials'
  /** Имя/email для `AvatarBadge`, когда `fallback="initials"` */
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
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(uri && isRemoteImageUri(uri) && !failed)
  const r = size / 2
  const iconSize = Math.max(14, Math.round(size * 0.48))

  if (!showImage && fallback === 'initials') {
    return <AvatarBadge label={initialsLabel || 'User'} size={size} />
  }

  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: r }]}>
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: uri! }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: r }]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : fallback === 'tournament' ? (
        <Image
          accessibilityIgnoresInvertColors
          source={tournamentPlaceholder}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.fallbackIcon, { borderRadius: r }]}>
          <Feather name="user" size={iconSize} color="#6b7280" />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226, 232, 240, 0.95)',
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
})
