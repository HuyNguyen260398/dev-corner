import { crawlAll } from './crawl'
import { getSettings } from './settings'
import { msUntilNext0700 } from '../lib/schedule'

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
    await crawlAll()
  } finally {
    await configureDailyAlarm()
  }
}

function clearDailyAlarm(): Promise<void> {
  return new Promise((resolve) => {
    chrome.alarms.clear(DAILY_CRAWL_ALARM, () => resolve())
  })
}
