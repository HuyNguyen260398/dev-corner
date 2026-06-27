import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import { addFavorite, listFavorites, removeFavorite } from '../../src/lib/favorites'
import type { Post, Source } from '../../src/lib/types'

beforeEach(async () => {
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
  vi.setSystemTime(new Date('2026-06-27T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('favorite persistence', () => {
  it('creates an independent display snapshot', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())

    const favoriteId = await addFavorite(postId)

    await expect(db.favoritePosts.get(favoriteId)).resolves.toMatchObject({
      postUrl: 'https://source.test/post',
      title: 'Post',
      summary: 'Summary',
      thumbnail: 'https://source.test/thumb.jpg',
      sourceUrl: 'https://source.test',
      sourceTitle: 'Source title',
      publishedAt: 100,
      crawledAt: 200,
      favoritedAt: Date.parse('2026-06-27T09:00:00Z'),
    })
  })

  it('uses the source host when the source row no longer exists', async () => {
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await expect(db.favoritePosts.toCollection().first()).resolves.toMatchObject({
      sourceTitle: 'source.test',
    })
  })

  it('preserves one row and the original timestamp on duplicate add', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())
    const firstId = await addFavorite(postId)
    vi.setSystemTime(new Date('2026-06-28T09:00:00Z'))

    const secondId = await addFavorite(postId)

    expect(secondId).toBe(firstId)
    await expect(db.favoritePosts.count()).resolves.toBe(1)
    await expect(db.favoritePosts.get(firstId)).resolves.toMatchObject({
      favoritedAt: Date.parse('2026-06-27T09:00:00Z'),
    })
  })

  it('removes by postUrl and treats repeated removal as success', async () => {
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await removeFavorite('https://source.test/post')
    await expect(removeFavorite('https://source.test/post')).resolves.toBeUndefined()
    await expect(db.favoritePosts.count()).resolves.toBe(0)
  })

  it('retains favorites after source and post deletion', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await db.sources.delete(1)
    await db.posts.delete(postId)
    await expect(db.favoritePosts.count()).resolves.toBe(1)
  })

  it('lists favorites newest-favorited first', async () => {
    const firstPostId = await db.posts.add(post())
    await addFavorite(firstPostId)
    vi.setSystemTime(new Date('2026-06-28T09:00:00Z'))
    const secondPostId = await db.posts.add(
      post({
        postUrl: 'https://source.test/second',
        title: 'Second',
      }),
    )
    await addFavorite(secondPostId)

    expect((await listFavorites()).map((favorite) => favorite.title)).toEqual(['Second', 'Post'])
  })

  it('rejects a missing post with a user-safe message', async () => {
    await expect(addFavorite(999)).rejects.toThrow('Post 999 is no longer available.')
  })
})

function source(): Source {
  return { id: 1, url: 'https://source.test', title: 'Source title', addedAt: 1 }
}

function post(overrides: Partial<Post> = {}): Post {
  return {
    sourceId: 1,
    sourceUrl: 'https://source.test',
    title: 'Post',
    summary: 'Summary',
    thumbnail: 'https://source.test/thumb.jpg',
    postUrl: 'https://source.test/post',
    publishedAt: 100,
    crawledAt: 200,
    crawlDay: '2026-06-27',
    ...overrides,
  }
}
