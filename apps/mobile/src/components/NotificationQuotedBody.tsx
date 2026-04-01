import { Text } from 'react-native'

/**
 * Текст уведомления: подстроки в кавычках — полужирные и цветом основного текста (как у отзывов).
 */
export function NotificationQuotedBody({
  text,
  baseStyle,
  strongStyle,
}: {
  text: string
  baseStyle: object
  strongStyle: object
}) {
  const safe = String(text ?? '')
  const parts = safe.split(/(".*?")/g)
  return (
    <Text style={baseStyle}>
      {parts.map((part, idx) => {
        const quoted = part.startsWith('"') && part.endsWith('"')
        if (!quoted) return <Text key={`${idx}-${part.slice(0, 12)}`}>{part}</Text>
        return (
          <Text key={`${idx}-${part}`} style={strongStyle}>
            {part.slice(1, -1)}
          </Text>
        )
      })}
    </Text>
  )
}
