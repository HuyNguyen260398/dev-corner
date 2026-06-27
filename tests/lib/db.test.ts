import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DevCornerDB } from '../../src/lib/db'

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('DevCornerDB schema upgrades', () => {
  it('adds favoritePosts without losing version 1 sources or posts', async () => {
    const name = `dev-corner-upgrade-${crypto.randomUUID()}`
    databaseNames.push(name)

    const legacy = new Dexie(name)
    legacy.version(1).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
    })
    await legacy.table('sources').add({
      id: 1,
      url: 'https://source.test',
      title: 'Source',
      addedAt: 1,
    })
    await legacy.table('posts').add({
      id: 1,
      sourceId: 1,
      sourceUrl: 'https://source.test',
      title: 'Post',
      summary: 'Summary',
      postUrl: 'https://source.test/post',
      crawledAt: 2,
      crawlDay: '2026-06-27',
    })
    legacy.close()

    const upgraded = new DevCornerDB(name)
    await upgraded.open()

    await expect(upgraded.sources.count()).resolves.toBe(1)
    await expect(upgraded.posts.count()).resolves.toBe(1)
    await expect(upgraded.favoritePosts.count()).resolves.toBe(0)
    expect(upgraded.tables.map((table) => table.name).sort()).toEqual([
      'favoritePosts',
      'posts',
      'sources',
    ])
    upgraded.close()
  })
})
