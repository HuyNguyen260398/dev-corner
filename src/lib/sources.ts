// Source persistence (F1, F2, F3). Pure IndexedDB ops over the Dexie `sources`
// table — no `chrome.*` here (GUD-001), so the worker and popup share one code
// path and tests run under fake-indexeddb. Saves upsert by the unique `url`
// index so re-saving the same page is idempotent (CON-006).
import { db } from './db'
import type { Source } from './types'

/**
 * Save `url` as a source, or update the existing row with the same `url`.
 * Returns the source id. Idempotent: re-saving a known `url` keeps one row and
 * refreshes its `title` when a better one is supplied.
 */
export async function addSource(url: string, title?: string): Promise<number> {
  const existing = await db.sources.get({ url })
  if (existing?.id != null) {
    if (title && title !== existing.title) {
      await db.sources.update(existing.id, { title })
    }
    return existing.id
  }
  return db.sources.add({
    url,
    title: title ?? url,
    addedAt: Date.now(),
  })
}

/** Remove a source by id. No-op if it no longer exists. */
export async function deleteSource(id: number): Promise<void> {
  await db.sources.delete(id)
}

/** All saved sources, newest first. */
export async function listSources(): Promise<Source[]> {
  const sources = await db.sources.toArray()
  return sources.sort((a, b) => b.addedAt - a.addedAt)
}
