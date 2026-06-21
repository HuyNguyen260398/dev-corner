import { describe, expect, it } from 'vitest'
import {
  buildDigestNotification,
  localDateKey,
  shouldNotifyDailyDigest,
} from '../../src/lib/notifications'

describe('localDateKey', () => {
  it('formats a date using the local calendar day', () => {
    expect(localDateKey(new Date(2026, 5, 21, 7, 0, 0))).toBe('2026-06-21')
  })
})

describe('buildDigestNotification', () => {
  it('builds a stable daily notification for multiple new posts', () => {
    expect(
      buildDigestNotification({
        newPostCount: 3,
        digestCount: 5,
        dateKey: '2026-06-21',
      }),
    ).toEqual({
      id: 'daily-digest-2026-06-21',
      title: 'dev-corner digest',
      message: '3 new posts are ready in your 5-post digest.',
    })
  })

  it('uses singular copy for one new post', () => {
    expect(
      buildDigestNotification({
        newPostCount: 1,
        digestCount: 1,
        dateKey: '2026-06-21',
      }).message,
    ).toBe('1 new post is ready in your digest.')
  })
})

describe('shouldNotifyDailyDigest', () => {
  it('notifies when scheduling and notifications are enabled and new posts exist', () => {
    expect(
      shouldNotifyDailyDigest({
        enableDailyCron: true,
        enableDailyNotifications: true,
        newPostCount: 2,
        dateKey: '2026-06-21',
        lastNotificationDate: undefined,
      }),
    ).toBe(true)
  })

  it('does not notify when notifications are disabled', () => {
    expect(
      shouldNotifyDailyDigest({
        enableDailyCron: true,
        enableDailyNotifications: false,
        newPostCount: 2,
        dateKey: '2026-06-21',
        lastNotificationDate: undefined,
      }),
    ).toBe(false)
  })

  it('does not notify when there are no new posts', () => {
    expect(
      shouldNotifyDailyDigest({
        enableDailyCron: true,
        enableDailyNotifications: true,
        newPostCount: 0,
        dateKey: '2026-06-21',
        lastNotificationDate: undefined,
      }),
    ).toBe(false)
  })

  it('does not notify twice on the same local day', () => {
    expect(
      shouldNotifyDailyDigest({
        enableDailyCron: true,
        enableDailyNotifications: true,
        newPostCount: 2,
        dateKey: '2026-06-21',
        lastNotificationDate: '2026-06-21',
      }),
    ).toBe(false)
  })
})
