import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db'
import { POST_RETENTION_CRAWL_DAYS, pruneOldPosts } from '../../src/lib/prune'
import type { Post } from '../../src/lib/types'

beforeEach(async () => {
  await db.posts.clear()
  await db.sources.clear()
})

describe('pruneOldPosts', () => {
  it('removes posts outside the latest 7 crawl days and keeps recent posts', async () => {
    await db.posts.bulkAdd([
      post('2026-06-11', 1),
      post('2026-06-12', 2),
      post('2026-06-13', 3),
      post('2026-06-14', 4),
      post('2026-06-15', 5),
      post('2026-06-16', 6),
      post('2026-06-17', 7),
      post('2026-06-18', 8),
    ])

    await expect(pruneOldPosts()).resolves.toBe(1)

    const remainingDays = (await db.posts.orderBy('crawlDay').toArray()).map((p) => p.crawlDay)
    expect(remainingDays).toEqual([
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ])
    expect(remainingDays).toHaveLength(POST_RETENTION_CRAWL_DAYS)
  })

  it('does not delete posts when retention has not been exceeded', async () => {
    await db.posts.bulkAdd([post('2026-06-17', 1), post('2026-06-18', 2)])

    await expect(pruneOldPosts()).resolves.toBe(0)

    await expect(db.posts.count()).resolves.toBe(2)
  })
})

function post(crawlDay: string, id: number): Post {
  return {
    sourceId: id,
    sourceUrl: `https://source-${id}.test`,
    title: `Post ${id}`,
    summary: `Summary ${id}`,
    thumbnail: `https://source-${id}.test/thumb.jpg`,
    postUrl: `https://source-${id}.test/post`,
    publishedAt: Date.parse(`${crawlDay}T08:00:00Z`),
    crawledAt: Date.parse(`${crawlDay}T09:00:00Z`),
    crawlDay,
  }
}
