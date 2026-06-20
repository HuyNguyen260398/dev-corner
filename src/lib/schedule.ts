// Scheduling math for the daily 07:00 crawl (F7, DEVELOPMENT_PLAN §6). Pure and
// side-effect-free: the worker turns this delay into a one-shot chrome.alarms
// entry (never setInterval/setTimeout). Local-time aware via the Date the worker
// sees; DST and day/month rollover are handled by wall-clock Date arithmetic.

const DAILY_HOUR = 7

/**
 * Milliseconds from `now` until the next local 07:00.
 * If `now` is exactly 07:00 (or later), targets 07:00 the following day.
 * The result is real elapsed time, so it shrinks/grows across DST transitions.
 */
export function msUntilNext0700(now: Date): number {
  const target = new Date(now)
  target.setHours(DAILY_HOUR, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime() - now.getTime()
}
