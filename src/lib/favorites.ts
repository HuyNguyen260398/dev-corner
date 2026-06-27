import { db } from './db'
import type { FavoritePost } from './types'

export async function addFavorite(postId: number): Promise<number> {
  return db.transaction('rw', db.posts, db.sources, db.favoritePosts, async () => {
    const post = await db.posts.get(postId)
    if (post === undefined) throw new Error(`Post ${postId} is no longer available.`)

    const existing = await db.favoritePosts.get({ postUrl: post.postUrl })
    if (existing?.id !== undefined) return existing.id

    const source = await db.sources.get(post.sourceId)
    const favorite: FavoritePost = {
      postUrl: post.postUrl,
      title: post.title,
      summary: post.summary,
      sourceUrl: post.sourceUrl,
      sourceTitle: source?.title ?? sourceHost(post.sourceUrl),
      crawledAt: post.crawledAt,
      favoritedAt: Date.now(),
      ...(post.thumbnail !== undefined ? { thumbnail: post.thumbnail } : {}),
      ...(post.publishedAt !== undefined ? { publishedAt: post.publishedAt } : {}),
    }
    return db.favoritePosts.add(favorite)
  })
}

export async function removeFavorite(postUrl: string): Promise<void> {
  const existing = await db.favoritePosts.get({ postUrl })
  if (existing?.id !== undefined) await db.favoritePosts.delete(existing.id)
}

export function listFavorites(): Promise<FavoritePost[]> {
  return db.favoritePosts.orderBy('favoritedAt').reverse().toArray()
}

function sourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'Saved source'
  }
}
