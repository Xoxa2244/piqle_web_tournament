import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { buildLocationMessageText } from '../lib/chatSpecialMessages'
import { radius, type ThemePalette } from '../lib/theme'
import { useAppTheme } from '../providers/ThemeProvider'
import { AppBottomSheet } from './AppBottomSheet'
import { LocationPickerSheet } from './LocationPickerSheet'

export function ChatLocationAction({
  disabled,
  onShareLocation,
}: {
  disabled?: boolean
  onShareLocation: (messageText: string) => void
}) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingPickerOpen, setPendingPickerOpen] = useState(false)

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => [
          styles.plusButton,
          disabled && styles.plusButtonDisabled,
          pressed && !disabled && styles.plusButtonPressed,
        ]}
      >
        <Feather name="plus" size={18} color={colors.text} />
      </Pressable>

      <AppBottomSheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false)
          setPendingPickerOpen(false)
        }}
        onDismissed={() => {
          if (!pendingPickerOpen) return
          setPendingPickerOpen(false)
          setPickerOpen(true)
        }}
        title="More actions"
      >
        <View style={styles.menuList}>
          <Pressable
            onPress={() => {
              setPendingPickerOpen(true)
              setMenuOpen(false)
            }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Feather name="map-pin" size={18} color={colors.text} />
            <Text style={styles.menuItemText}>Share location</Text>
          </Pressable>
        </View>
      </AppBottomSheet>

      <LocationPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onShare={(payload) => {
          onShareLocation(buildLocationMessageText(payload))
          setPickerOpen(false)
        }}
      />
    </>
  )
}

const createStyles = (colors: ThemePalette) =>
  StyleSheet.create({
    plusButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    plusButtonDisabled: {
      opacity: 0.52,
    },
    plusButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    menuList: {
      gap: 6,
      paddingBottom: 4,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: colors.surfaceMuted,
    },
    menuItemPressed: {
      opacity: 0.86,
    },
    menuItemText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
  })
