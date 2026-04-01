import Svg, { Path } from 'react-native-svg'

type Props = {
  size?: number
  filled?: boolean
  color?: string
  inactiveColor?: string
}

export function RatingStarIcon({
  size = 24,
  filled = false,
  color = '#F4B000',
  inactiveColor = '#C7C7CC',
}: Props) {
  const fillColor = filled ? color : 'none'
  const strokeColor = filled ? color : inactiveColor

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no">
      <Path
        d="M12 2.9 14.78 8.52 20.98 9.42 16.49 13.8 17.55 20 12 17.08 6.45 20 7.51 13.8 3.02 9.42 9.22 8.52 12 2.9Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
