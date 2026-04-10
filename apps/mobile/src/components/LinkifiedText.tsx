import { useMemo } from 'react'
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'

import { useAppTheme } from '../providers/ThemeProvider'

type Segment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; url: string }

const LINK_PATTERN = /((?:https?:\/\/|www\.|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?:\/[^\s]*)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi

export function LinkifiedText({
  text,
  textStyle,
  linkStyle,
  onBeforeOpen,
}: {
  text: string
  textStyle?: StyleProp<TextStyle>
  linkStyle?: StyleProp<TextStyle>
  onBeforeOpen?: (url: string, open: () => Promise<void>) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors.primary), [colors.primary])

  const segments = useMemo<Segment[]>(() => {
    const source = String(text ?? '')
    if (!source) return []
    const matches: Array<{ raw: string; index: number }> = []
    const regex = new RegExp(LINK_PATTERN)
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      matches.push({ raw: match[0], index: match.index ?? 0 })
    }
    if (matches.length === 0) {
      return [{ type: 'text', value: source }]
    }

    const next: Segment[] = []
    let cursor = 0
    for (const match of matches) {
      const raw = match.raw
      const index = match.index
      if (index > cursor) {
        next.push({ type: 'text', value: source.slice(cursor, index) })
      }
      next.push({
        type: 'link',
        value: raw,
        url: raw.includes('@') && !raw.startsWith('http')
          ? `mailto:${raw}`
          : /^https?:\/\//i.test(raw)
            ? raw
            : `https://${raw}`,
      })
      cursor = index + raw.length
    }
    if (cursor < source.length) {
      next.push({ type: 'text', value: source.slice(cursor) })
    }
    return next
  }, [text])

  return (
    <Text style={textStyle}>
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <Text key={`text-${index}`} style={textStyle}>
            {segment.value}
          </Text>
        ) : (
          <Text
            key={`link-${index}`}
            style={[styles.link, linkStyle]}
            suppressHighlighting
            onPress={() => {
              const open = async () => {
                await Linking.openURL(segment.url)
              }
              if (onBeforeOpen) {
                onBeforeOpen(segment.url, open)
                return
              }
              void open()
            }}
          >
            {segment.value}
          </Text>
        )
      )}
    </Text>
  )
}

const createStyles = (primary: string) =>
  StyleSheet.create({
    link: {
      color: primary,
      textDecorationLine: 'underline',
    },
  })
