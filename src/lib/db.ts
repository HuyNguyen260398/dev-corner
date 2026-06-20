import Dexie, { type Table } from 'dexie'
import type { Post, Source } from './types'

// IndexedDB is the single source of truth. The service worker writes; the popup
// reads live via useLiveQuery. `&url` / `&postUrl` are unique so re-crawls upsert
// instead of duplicating (CON-006).
export class DevCornerDB extends Dexie {
  sources!: Table<Source, number>
  posts!: Table<Post, number>

  constructor() {
    super('dev-corner')
    this.version(1).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
    })
  }
}

export const db = new DevCornerDB()
