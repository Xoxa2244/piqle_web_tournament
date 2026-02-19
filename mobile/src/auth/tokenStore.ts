import * as SecureStore from 'expo-secure-store'

const MOBILE_SESSION_TOKEN_KEY = 'piqle_mobile_session_token'

export const loadSessionToken = async () => {
  return SecureStore.getItemAsync(MOBILE_SESSION_TOKEN_KEY)
}

export const saveSessionToken = async (sessionToken: string) => {
  await SecureStore.setItemAsync(MOBILE_SESSION_TOKEN_KEY, sessionToken)
}

export const clearSessionToken = async () => {
  await SecureStore.deleteItemAsync(MOBILE_SESSION_TOKEN_KEY)
}
