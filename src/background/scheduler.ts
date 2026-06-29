import { CRAWL_CONTINUATION_ALARM, crawlAll, type CrawlAllResult } from './crawl'
import {
  createDailyDigestNotification,
  getLastDigestNotificationDate,
} from './notifications'
import { getSettings } from './settings'
import { db } from '../lib/db'
import { localDateKey, shouldNotifyDailyDigest } from '../lib/notifications'
import { msUntilNext0700 } from '../lib/schedule'
import { selectDigest } from '../lib/selection'
import type { Settings } from '../lib/types'

export const DAILY_CRAWL_ALARM = 'daily-0700-crawl'

export async function configureDailyAlarm(): Promise<void> {
  const settings = await getSettings()
  if (!settings.enableDailyCron) {
    await clearDailyAlarm()
    return
  }

  const now = new Date(Date.now())
  chrome.alarms.create(DAILY_CRAWL_ALARM, {
    when: now.getTime() + msUntilNext0700(now),
  })
}

export async function handleDailyAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== DAILY_CRAWL_ALARM) return

  const settings = await getSettings()
  if (!settings.enableDailyCron) {
    await clearDailyAlarm()
    return
  }

  try {
    const result = await crawlAll({ notificationRequested: true })
    if (result.completed) {
      await maybeNotifyDailyDigest(result, settings)
    }
  } finally {
    await configureDailyAlarm()
  }
}

export async function handleCrawlContinuationAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== CRAWL_CONTINUATION_ALARM) return

  const result = await crawlAll()
  if (!result.completed || !result.notificationRequested) return

  const settings = await getSettings()
  await maybeNotifyDailyDigest(result, settings)
}

async function maybeNotifyDailyDigest(result: CrawlAllResult, settings: Settings): Promise<void> {
  const dateKey = localDateKey(new Date(Date.now()))
  const lastNotificationDate = await getLastDigestNotificationDate()

  if (
    !shouldNotifyDailyDigest({
      enableDailyCron: settings.enableDailyCron,
      enableDailyNotifications: settings.enableDailyNotifications,
      newPostCount: result.newPostsWritten,
      dateKey,
      lastNotificationDate,
    })
  ) {
    return
  }

  const posts = await db.posts.where('crawlDay').equals(dateKey).toArray()
  const sources = await db.sources.toArray()
  const digestCount = selectDigest(posts, sources, dateKey).length

  await createDailyDigestNotification({
    newPostCount: result.newPostsWritten,
    digestCount,
    dateKey,
  })
}

function clearDailyAlarm(): Promise<void> {
  return new Promise((resolve) => {
    chrome.alarms.clear(DAILY_CRAWL_ALARM, () => resolve())
  })
}
