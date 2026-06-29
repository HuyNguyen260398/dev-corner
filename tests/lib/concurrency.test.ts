import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../../src/lib/concurrency'

describe('mapWithConcurrency', () => {
  it('preserves result order while limiting active workers', async () => {
    let active = 0
    let maximumActive = 0

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (item, index) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      active -= 1
      return `${index}:${item * 2}`
    })

    expect(results).toEqual(['0:2', '1:4', '2:6', '3:8', '4:10'])
    expect(maximumActive).toBe(3)
  })

  it('rejects concurrency limits below one', async () => {
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(
      'Concurrency limit must be at least 1',
    )
  })
})
