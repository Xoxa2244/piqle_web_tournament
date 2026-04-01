import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Screen с title + subtitle (club / tournament), см. ui.tsx header */
const SCREEN_TITLE_BLOCK = 96

/** Блок topicBar над KeyboardAvoidingView на экране турнирного чата */
const TOURNAMENT_TOPIC_BAR_EXTRA = 92

/** TopBar в PageLayout (вкладка AI), фикс. высота 56 */
const TAB_TOP_BAR = 56

/**
 * Смещение для KeyboardAvoidingView на iOS: расстояние от верха экрана до верха KAV
 * (иначе клавиатура накрывает половину инпута).
 * Экраны с PageLayout + чат: всё, что выше KAV (табы и т.д.), должно быть *внутри* KAV,
 * иначе offset нужно дублировать вручную и инпут уезжает вверх.
 */
export function useChatKeyboardVerticalOffset(variant: 'screenChat' | 'screenChatTournament' | 'tabPageLayout') {
  const insets = useSafeAreaInsets()
  if (Platform.OS !== 'ios') return 0

  switch (variant) {
    case 'screenChat':
      return insets.top + SCREEN_TITLE_BLOCK
    case 'screenChatTournament':
      return insets.top + SCREEN_TITLE_BLOCK + TOURNAMENT_TOPIC_BAR_EXTRA
    case 'tabPageLayout':
      return insets.top + TAB_TOP_BAR
    default:
      return insets.top + 80
  }
}
