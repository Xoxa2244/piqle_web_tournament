import { Tabs } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Fragment } from 'react'
import { Platform } from 'react-native'

import { TabBarTabIcon, tabIcons } from '../../src/components/navigation/TabBarTabIcon'
import { TabDataWarmup } from '../../src/components/TabDataWarmup'
import { TabRepeatProvider, useTabRepeat } from '../../src/contexts/TabRepeatContext'
import { useAppTheme } from '../../src/providers/ThemeProvider'

const HAPTIC_RESELECT_GAP_MS = 50

/** Переключение на другую вкладку */
function tabHapticSwitch() {
  if (Platform.OS === 'web') return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

/** Повторный тап по уже активной вкладке */
function tabHapticReselectDouble() {
  if (Platform.OS === 'web') return
  void (async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      await new Promise((r) => setTimeout(r, HAPTIC_RESELECT_GAP_MS))
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {
      /* нет Taptic Engine / haptics */
    }
  })()
}

export default function TabsLayout() {
  return (
    <Fragment>
      <TabDataWarmup />
      <TabRepeatProvider>
        <TabsLayoutInner />
      </TabRepeatProvider>
    </Fragment>
  )
}

function TabsLayoutInner() {
  const { colors, theme } = useAppTheme()
  const tabInactive = colors.textMuted
  const tabActive = colors.primary
  const { bumpTabShake, bumpHomeTabReselect } = useTabRepeat()

  return (
    <Tabs
      key={theme}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: tabInactive,
        tabBarItemStyle: {
          flex: 1,
          paddingHorizontal: 0,
        },
        tabBarIconStyle: {
          width: '100%',
        },
        tabBarStyle: {
          backgroundColor: colors.surfaceOverlay,
          borderTopColor: colors.border,
          height: 84,
          paddingHorizontal: 0,
          paddingBottom: 8,
          paddingTop: 4,
          shadowColor: colors.shadowStrong,
          shadowOpacity: 0.15,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        },
        tabBarIcon: ({ focused }) => {
          const name = route.name as keyof typeof tabIcons
          return (
            <TabBarTabIcon
              routeName={name}
              focused={focused}
              tabActive={tabActive}
              tabInactive={tabInactive}
            />
          )
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              bumpTabShake('index')
              bumpHomeTabReselect()
              tabHapticReselectDouble()
              return
            }
            tabHapticSwitch()
          },
        })}
      />
      <Tabs.Screen
        name="tournaments"
        options={{ title: 'Events' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              bumpTabShake('tournaments')
              tabHapticReselectDouble()
              return
            }
            tabHapticSwitch()
          },
        })}
      />
      <Tabs.Screen
        name="clubs"
        options={{ title: 'Clubs' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              bumpTabShake('clubs')
              tabHapticReselectDouble()
              return
            }
            tabHapticSwitch()
          },
        })}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: 'Chats' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              bumpTabShake('chats')
              tabHapticReselectDouble()
              return
            }
            tabHapticSwitch()
          },
        })}
      />
      <Tabs.Screen
        name="ai"
        options={{ title: 'AI' }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              bumpTabShake('ai')
              tabHapticReselectDouble()
              return
            }
            tabHapticSwitch()
          },
        })}
      />
    </Tabs>
  )
}
