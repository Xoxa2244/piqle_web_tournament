import MaskedView from '@react-native-masked-view/masked-view'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { StyleProp, TextStyle } from 'react-native'

import { OptionalLinearGradient } from '../OptionalLinearGradient'

const BRAND_GRADIENT_COLORS = [
  '#BAEC00',
  '#B5EC00',
  '#A7EB00',
  '#91EA00',
  '#71E800',
  '#55E600',
] as const

export function BrandGradientText({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode
  style?: StyleProp<TextStyle>
  numberOfLines?: number
}) {
  return (
    <MaskedView
      style={styles.wrapper}
      maskElement={
        <Text numberOfLines={numberOfLines} style={[style, styles.maskText]}>
          {children}
        </Text>
      }
    >
      <OptionalLinearGradient
        colors={BRAND_GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientFill}
        fallbackColor={BRAND_GRADIENT_COLORS[0]}
      >
        <Text numberOfLines={numberOfLines} style={[style, styles.hiddenText]}>
          {children}
        </Text>
      </OptionalLinearGradient>
    </MaskedView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
  },
  gradientFill: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  hiddenText: {
    opacity: 0,
  },
  maskText: {
    color: '#000000',
  },
})
