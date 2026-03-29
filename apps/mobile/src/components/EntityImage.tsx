import { memo, useEffect, useMemo, useState } from 'react'
import { Image, type ImageStyle, type StyleProp } from 'react-native'

import { tournamentPlaceholder } from '../constants/images'
import { entityPlaceholderBackground } from '../lib/theme'
import { isRemoteImageUri, resolveRemoteImageUriForApp } from '../lib/imageUri'
import { useAppTheme } from '../providers/ThemeProvider'

type Props = {
  uri?: string | null
  style: StyleProp<ImageStyle>
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'
  placeholderResizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'
}

export const EntityImage = memo(function EntityImage({
  uri,
  style,
  resizeMode = 'cover',
  placeholderResizeMode = 'contain',
}: Props) {
  const { colors, theme } = useAppTheme()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [uri])

  const resolvedUri = useMemo(() => resolveRemoteImageUriForApp(uri), [uri])
  const showRemote = Boolean(resolvedUri && isRemoteImageUri(resolvedUri) && !failed)
  const imageSource = useMemo(
    () => (showRemote ? { uri: resolvedUri! } : tournamentPlaceholder),
    [showRemote, resolvedUri],
  )

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={imageSource}
      style={[style, !showRemote && { backgroundColor: entityPlaceholderBackground(theme, colors) }]}
      resizeMode={showRemote ? resizeMode : placeholderResizeMode}
      onError={() => setFailed(true)}
    />
  )
})
