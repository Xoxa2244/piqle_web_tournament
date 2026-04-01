import * as Haptics from 'expo-haptics'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Platform } from 'react-native'

/**
 * Состояние для pull-to-refresh (`PickleRefreshScrollView` / `PageLayout` с `pullToRefresh`).
 * При смене вкладки экран теряет фокус — сбрасываем refreshing, иначе индикатор
 * залипает у шапки после возврата (RN + скрытый таб).
 */
export function usePullToRefresh(runRefresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(
    useCallback(() => {
      return () => {
        setRefreshing(false)
      }
    }, [])
  )

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      } catch {
        /* no haptics */
      }
    }

    setRefreshing(true)
    try {
      await runRefresh()
    } catch {
      /* сеть — гасим в finally */
    } finally {
      setRefreshing(false)
    }
  }, [runRefresh])

  return { refreshing, onRefresh }
}
