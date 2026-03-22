import Svg, { Path } from 'react-native-svg'

type Props = {
  size?: number
  color: string
}

/** Кастомная иконка перезагрузки (стрелка по дуге), вместо корзины для сброса чата. */
export function ReloadIcon({ size = 20, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no">
      <Path
        d="M23 4v6h-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
