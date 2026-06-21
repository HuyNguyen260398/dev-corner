export interface DigestNotificationInput {
  newPostCount: number
  digestCount: number
  dateKey: string
}

export interface DigestNotification {
  id: string
  title: string
  message: string
}

export interface ShouldNotifyDailyDigestInput {
  enableDailyCron: boolean
  enableDailyNotifications: boolean
  newPostCount: number
  dateKey: string
  lastNotificationDate?: string
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildDigestNotification({
  newPostCount,
  digestCount,
  dateKey,
}: DigestNotificationInput): DigestNotification {
  const postNoun = newPostCount === 1 ? 'post' : 'posts'
  const verb = newPostCount === 1 ? 'is' : 'are'
  const digestLabel = digestCount > 1 ? `your ${digestCount}-post digest` : 'your digest'

  return {
    id: `daily-digest-${dateKey}`,
    title: 'dev-corner digest',
    message: `${newPostCount} new ${postNoun} ${verb} ready in ${digestLabel}.`,
  }
}

export function shouldNotifyDailyDigest({
  enableDailyCron,
  enableDailyNotifications,
  newPostCount,
  dateKey,
  lastNotificationDate,
}: ShouldNotifyDailyDigestInput): boolean {
  return (
    enableDailyCron &&
    enableDailyNotifications &&
    newPostCount > 0 &&
    lastNotificationDate !== dateKey
  )
}
