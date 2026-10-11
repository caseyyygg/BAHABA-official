import { useEffect, useState } from 'react'

export function readSavedSetting(storage, key, fallback) {
  try {
    const saved = storage.getItem(key)
    return saved === 'on' ? true : saved === 'off' ? false : fallback
  } catch {
    return fallback
  }
}

export function useSavedSetting(key, fallback) {
  const [value, setValue] = useState(() => readSavedSetting(window.localStorage, key, fallback))
  useEffect(() => {
    try { window.localStorage.setItem(key, value ? 'on' : 'off') }
    catch { /* Settings still work when browser storage is unavailable. */ }
  }, [key, value])
  return [value, setValue]
}
