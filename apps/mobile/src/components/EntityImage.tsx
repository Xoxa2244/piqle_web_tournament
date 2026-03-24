import { memo, useEffect, useMemo, useState } from 'react'
import { Image, type ImageStyle, type StyleProp } from 'react-native'

import { tournamentPlaceholder } from '../constants/images'
import { isRemoteImageUri } from '../lib/imageUri'

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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [uri])

  const showRemote = Boolean(uri && isRemoteImageUri(uri) && !failed)
  const imageSource = useMemo(
    () => (showRemote ? { uri: uri! } : tournamentPlaceholder),
    [showRemote, uri]
  )

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={imageSource}
      style={style}
      resizeMode={showRemote ? resizeMode : placeholderResizeMode}
      onError={() => setFailed(true)}
    />
  )
})
