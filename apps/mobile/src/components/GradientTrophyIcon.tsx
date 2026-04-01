import MaskedView from '@react-native-masked-view/masked-view'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { View } from 'react-native'

import { OptionalLinearGradient } from './OptionalLinearGradient'

/** 4-stop gradients for trophy-shaped mask (Material `emoji-events`). */
export const TROPHY_GRADIENT_GOLD = ['#fffbeb', '#fde047', '#d97706', '#92400e'] as const
/** Без «белого» угла: только холодные серые, как полированное серебро. */
export const TROPHY_GRADIENT_SILVER = ['#c5ced8', '#a8b4c2', '#7c8a9a', '#4a5568'] as const
export const TROPHY_GRADIENT_BRONZE = ['#ffedd5', '#fb923c', '#ea580c', '#7c2d12'] as const

type Props = {
  size: number
  colors: readonly [string, string, ...string[]]
}

/**
 * Trophy icon filled with a multi-stop linear gradient (soft silhouette, no sharp fills).
 */
export function GradientTrophyIcon({ size, colors }: Props) {
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View
          style={{
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <MaterialIcons name="emoji-events" size={size} color="#000000" />
        </View>
      }
    >
      <OptionalLinearGradient
        colors={colors}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ width: size, height: size }}
        fallbackColor={colors[0]}
      />
    </MaskedView>
  )
}
