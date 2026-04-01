import { useEffect, useRef } from 'react'

import { useToast } from '../providers/ToastProvider'

/** Сообщения об отсутствии сущности / недействительной ссылке (tRPC / fetch / copy). */
export function isLikelyNotFoundMessage(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('not found') ||
    m.includes('no longer exists') ||
    m.includes('could not be loaded') ||
    m.includes('unavailable') ||
    m.includes('does not exist')
  )
}

type Args = {
  enabled: boolean
  /** Сброс при смене сущности (например id из URL). */
  entityKey: string
  toastMessage: string
  isLoading: boolean
  hasData: boolean
  isError: boolean
  errorMessage?: string | undefined
}

/**
 * Один тост при переходе по ссылке/уведомлению на несуществующую или недоступную сущность.
 * Не дублирует при повторных рендерах, пока не сменится `entityKey`.
 */
export function useToastWhenEntityMissing({
  enabled,
  entityKey,
  toastMessage,
  isLoading,
  hasData,
  isError,
  errorMessage,
}: Args) {
  const toast = useToast()
  const didToastRef = useRef(false)

  useEffect(() => {
    didToastRef.current = false
  }, [entityKey])

  useEffect(() => {
    if (!enabled || !entityKey.trim()) return
    if (isLoading) return
    if (hasData) return
    if (didToastRef.current) return

    const treatAsMissing =
      (!isError && !hasData) || (isError && isLikelyNotFoundMessage(errorMessage))

    if (!treatAsMissing) return

    didToastRef.current = true
    toast.error(toastMessage)
  }, [enabled, entityKey, toastMessage, isLoading, hasData, isError, errorMessage, toast])
}
