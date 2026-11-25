// QA simulator builds are ad-hoc and have no keychain entitlement, so SecureStore throws.
// AsyncStorage lets pairing persist for end-to-end checks. This file is not product code.
import AsyncStorage from '@react-native-async-storage/async-storage'

export const WHEN_UNLOCKED = 'WHEN_UNLOCKED'
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK'
export const ALWAYS = 'ALWAYS'
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY'
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY'
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY'
export const ALWAYS_THIS_DEVICE_ONLY = 'ALWAYS_THIS_DEVICE_ONLY'

function storageKey(key, options) {
  const service = options && options.keychainService ? options.keychainService : 'default'
  return `qa-secure-store:${service}:${key}`
}

export async function setItemAsync(key, value, options) {
  await AsyncStorage.setItem(storageKey(key, options), value)
}

export async function getItemAsync(key, options) {
  const value = await AsyncStorage.getItem(storageKey(key, options))
  return value
}

export async function deleteItemAsync(key, options) {
  await AsyncStorage.removeItem(storageKey(key, options))
}
