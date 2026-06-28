// fake-indexeddb/auto must load before db.ts so Dexie binds to the in-memory
// IndexedDB rather than jsdom's missing implementation.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { addSource, deleteSource, listSources } from '../../src/lib/sources'
import { db } from '../../src/lib/db'

beforeEach(async () => {
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
})

describe('addSource', () => {
  it('saves a new source, defaulting the title to the url', async () => {
    const id = await addSource('https://blog.test')
    const sources = await listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ id, url: 'https://blog.test', title: 'https://blog.test' })
  })

  it('is idempotent: re-saving the same url keeps one row with the same id', async () => {
    const first = await addSource('https://blog.test', 'Blog')
    const second = await addSource('https://blog.test', 'Blog')
    expect(second).toBe(first)
    expect(await listSources()).toHaveLength(1)
  })

  it('refreshes the title when a re-save supplies a better one', async () => {
    const id = await addSource('https://blog.test')
    await addSource('https://blog.test', 'The Blog')
    const sources = await listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ id, title: 'The Blog' })
  })
})

describe('deleteSource', () => {
  it('removes the source and its posts while retaining favorite snapshots', async () => {
    const id = await addSource('https://blog.test')
    await db.posts.bulkAdd([
      {
        sourceId: id,
        sourceUrl: 'https://blog.test',
        title: 'Post one',
        summary: 'Summary one',
        postUrl: 'https://blog.test/post-one',
        crawledAt: 1,
        crawlDay: '2026-06-28',
      },
      {
        sourceId: id,
        sourceUrl: 'https://blog.test',
        title: 'Post two',
        summary: 'Summary two',
        postUrl: 'https://blog.test/post-two',
        crawledAt: 2,
        crawlDay: '2026-06-28',
      },
    ])
    await db.favoritePosts.add({
      postUrl: 'https://blog.test/post-one',
      title: 'Post one',
      summary: 'Summary one',
      sourceUrl: 'https://blog.test',
      sourceTitle: 'Blog',
      crawledAt: 1,
      favoritedAt: 3,
    })

    const deleted = await deleteSource(id)

    expect(deleted?.url).toBe('https://blog.test')
    await expect(db.sources.count()).resolves.toBe(0)
    await expect(db.posts.where('sourceId').equals(id).count()).resolves.toBe(0)
    await expect(db.favoritePosts.count()).resolves.toBe(1)
  })
})
