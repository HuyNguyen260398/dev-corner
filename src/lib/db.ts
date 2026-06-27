import Dexie, { type Table } from 'dexie'
import type { FavoritePost, Post, Source } from './types'

// IndexedDB is the single source of truth. The service worker writes; the popup
// reads live via useLiveQuery. `&url` / `&postUrl` are unique so re-crawls upsert
// instead of duplicating (CON-006).
export class DevCornerDB extends Dexie {
  sources!: Table<Source, number>
  posts!: Table<Post, number>
  favoritePosts!: Table<FavoritePost, number>

  constructor(name = 'dev-corner') {
    super(name)
    this.version(1).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
    })
    this.version(2).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
      favoritePosts: '++id, &postUrl, favoritedAt, publishedAt, sourceUrl',
    })
  }
}

export const db = new DevCornerDB()
