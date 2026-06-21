import { db } from './db'

export const POST_RETENTION_CRAWL_DAYS = 7

/** Delete posts outside the latest retained crawl-day window. */
export async function pruneOldPosts(keepCrawlDays = POST_RETENTION_CRAWL_DAYS): Promise<number> {
  const crawlDays = await db.posts.orderBy('crawlDay').uniqueKeys()
  const retainedDays = crawlDays.map(String).sort().reverse().slice(0, keepCrawlDays)
  if (crawlDays.length <= retainedDays.length) return 0

  const oldestRetainedDay = retainedDays[retainedDays.length - 1]
  if (oldestRetainedDay === undefined) return 0

  const stalePosts = await db.posts.where('crawlDay').below(oldestRetainedDay).primaryKeys()
  if (stalePosts.length === 0) return 0

  await db.posts.bulkDelete(stalePosts as number[])
  return stalePosts.length
}
