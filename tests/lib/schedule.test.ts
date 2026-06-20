import { describe, it, expect, afterAll } from 'vitest'
import { msUntilNext0700 } from '../../src/lib/schedule'

const HOUR = 3_600_000
const originalTz = process.env.TZ

afterAll(() => {
  process.env.TZ = originalTz
})

// Node re-reads process.env.TZ on each Date conversion, so set it per test.
function setTz(tz: string) {
  process.env.TZ = tz
}

describe('msUntilNext0700 — same-day vs rollover (UTC)', () => {
  it('returns time until 07:00 today when called before 07:00', () => {
    setTz('UTC')
    const now = new Date(2026, 0, 15, 5, 30, 0)
    expect(msUntilNext0700(now)).toBe(1.5 * HOUR)
  })

  it('rolls to 07:00 tomorrow when called after 07:00', () => {
    setTz('UTC')
    const now = new Date(2026, 0, 15, 9, 0, 0)
    expect(msUntilNext0700(now)).toBe(22 * HOUR)
  })

  it('rolls to the next day when called exactly at 07:00', () => {
    setTz('UTC')
    const now = new Date(2026, 0, 15, 7, 0, 0, 0)
    expect(msUntilNext0700(now)).toBe(24 * HOUR)
  })

  it('always lands on local 07:00', () => {
    setTz('UTC')
    const now = new Date(2026, 0, 15, 12, 0, 0)
    const next = new Date(now.getTime() + msUntilNext0700(now))
    expect(next.getHours()).toBe(7)
    expect(next.getMinutes()).toBe(0)
  })

  it('crosses a month boundary correctly', () => {
    setTz('UTC')
    const now = new Date(2026, 0, 31, 9, 0, 0) // Jan 31, after 07:00
    const next = new Date(now.getTime() + msUntilNext0700(now))
    expect(next.getMonth()).toBe(1) // February
    expect(next.getDate()).toBe(1)
    expect(next.getHours()).toBe(7)
  })
})

describe('msUntilNext0700 — DST (America/New_York)', () => {
  it('loses an hour across spring-forward', () => {
    setTz('America/New_York')
    const now = new Date(2026, 2, 8, 0, 0, 0) // Mar 8, 00:00, before the 02:00->03:00 jump
    expect(msUntilNext0700(now)).toBe(6 * HOUR)
  })

  it('gains an hour across fall-back', () => {
    setTz('America/New_York')
    const now = new Date(2026, 10, 1, 0, 0, 0) // Nov 1, 00:00, before the 02:00->01:00 repeat
    expect(msUntilNext0700(now)).toBe(8 * HOUR)
  })

  it('still lands on local 07:00 across a DST boundary', () => {
    setTz('America/New_York')
    const now = new Date(2026, 2, 8, 0, 0, 0)
    const next = new Date(now.getTime() + msUntilNext0700(now))
    expect(next.getHours()).toBe(7)
  })
})
