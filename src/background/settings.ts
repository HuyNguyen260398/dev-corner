import type { Settings } from '../lib/types'

export const SETTINGS_KEY = 'settings'

const DEFAULT_SETTINGS: Settings = {
  enableDailyCron: true,
}

export async function getSettings(): Promise<Settings> {
  const stored = await storageGet<Partial<Settings>>(SETTINGS_KEY)
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  }
}

export async function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  const next = {
    ...(await getSettings()),
    ...settings,
  }
  await storageSet(SETTINGS_KEY, next)
  return next
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      resolve(items[key] as T | undefined)
    })
  })
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve)
  })
}
