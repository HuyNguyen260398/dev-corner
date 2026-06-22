import { buildDigestNotification } from '../lib/notifications'

export const LAST_DIGEST_NOTIFICATION_DATE_KEY = 'lastDigestNotificationDate'

const DIGEST_NOTIFICATION_PREFIX = 'daily-digest-'
const DIGEST_ICON_URL = 'icons/icon-128.png'
const POPUP_PATH = 'src/popup/index.html'

export async function createDailyDigestNotification(input: {
  newPostCount: number
  digestCount: number
  dateKey: string
}): Promise<void> {
  const notification = buildDigestNotification(input)
  await createNotification(notification.id, {
    type: 'basic',
    iconUrl: DIGEST_ICON_URL,
    title: notification.title,
    message: notification.message,
  })
  await storageSet(LAST_DIGEST_NOTIFICATION_DATE_KEY, input.dateKey)
}

export function getLastDigestNotificationDate(): Promise<string | undefined> {
  return storageGet<string>(LAST_DIGEST_NOTIFICATION_DATE_KEY)
}

export function registerNotificationClickHandler(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId.startsWith(DIGEST_NOTIFICATION_PREFIX)) return

    const action = chrome.action as Partial<Pick<typeof chrome.action, 'openPopup'>>
    const openPopup = action.openPopup
    if (openPopup !== undefined) {
      try {
        openPopup.call(chrome.action, undefined, () => undefined)
      } catch {
        void openDigestTab()
      }
      return
    }

    void openDigestTab()
  })
}

function createNotification(
  notificationId: string,
  options: chrome.notifications.NotificationCreateOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(notificationId, options, () => {
      const lastError = chrome.runtime.lastError
      if (lastError !== undefined) {
        reject(new Error(lastError.message))
        return
      }
      resolve()
    })
  })
}

function openDigestTab(): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: chrome.runtime.getURL(POPUP_PATH) })
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
