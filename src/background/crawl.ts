import { db } from '../lib/db'
import { parseMarkup } from '../lib/dom'
import { discoverFeedUrl, feedProbeUrls, parseFeed, type FeedEntry } from '../lib/feed'
import { pruneOldPosts } from '../lib/prune'
import { summarize } from '../lib/summary'
import { resolveThumbnail } from '../lib/thumbnail'
import type { Post, Source } from '../lib/types'
import { ensureSourcePermission } from './permissions'

export const CRAWL_QUEUE_KEY = 'crawlQueue'
export const CRAWL_IN_PROGRESS_KEY = 'crawlInProgress'

const MAX_POSTS_PER_SOURCE = 5

export interface CrawlSourceResult {
  ok: boolean
  sourceId: number
  postsWritten: number
  newPostsWritten: number
  error?: string
}

export interface CrawlAllResult {
  ok: true
  sourcesCrawled: number
  postsWritten: number
  newPostsWritten: number
  failures: Array<{ sourceId: number; error: string }>
}

interface HtmlEntry {
  title: string
  postUrl: string
  summary: string
  thumbnail: string
}

interface FetchTextResult {
  url: string
  text: string
}

/** Crawl one persisted source, upserting at most five newest posts. */
export async function crawlSource(source: Source): Promise<CrawlSourceResult> {
  if (source.id == null) {
    throw new Error('Cannot crawl a source before it has an id')
  }
  const persistedSource: Source & { id: number } = { ...source, id: source.id }
  const cachedFeedUrl = sameOriginUrl(source.feedUrl, source.url)

  try {
    const hasPermission = await ensureSourcePermission(persistedSource.id, persistedSource.url)
    if (!hasPermission) {
      return { ok: true, sourceId: persistedSource.id, postsWritten: 0, newPostsWritten: 0 }
    }

    const fetchedPage = cachedFeedUrl ? undefined : await fetchText(persistedSource.url)
    const feed = await resolveFeed(persistedSource, fetchedPage, cachedFeedUrl)
    const entries =
      feed === undefined
        ? await extractHtmlEntries(fetchedPage ?? (await fetchText(persistedSource.url)))
        : parseFeed(feed.text)

    const now = Date.now()
    const crawlDay = localDateKey(new Date(now))
    const posts = entries.slice(0, MAX_POSTS_PER_SOURCE).map((entry) =>
      toPost({
        entry,
        source: persistedSource,
        crawledAt: now,
        crawlDay,
      }),
    )

    let newPostsWritten = 0
    for (const post of posts) {
      if (await upsertPost(post)) {
        newPostsWritten += 1
      }
    }

    await markSourceSuccess(persistedSource.id, now, feed?.url)
    return { ok: true, sourceId: persistedSource.id, postsWritten: posts.length, newPostsWritten }
  } catch (e) {
    const message = errorMessage(e)
    await markSourceFailure(persistedSource.id, message)
    return {
      ok: false,
      sourceId: persistedSource.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: message,
    }
  }
}

/** Crawl all saved sources, resuming an existing storage-backed queue if present. */
export async function crawlAll(): Promise<CrawlAllResult> {
  await storageSet(CRAWL_IN_PROGRESS_KEY, true)

  try {
    let queue = await storageGet<number[]>(CRAWL_QUEUE_KEY)
    if (queue === undefined || queue.length === 0) {
      const sources = await db.sources.toArray()
      queue = sources.flatMap((source) => (source.id == null ? [] : [source.id]))
      if (queue.length > 0) {
        await storageSet(CRAWL_QUEUE_KEY, queue)
      } else {
        await storageRemove(CRAWL_QUEUE_KEY)
      }
    }

    let sourcesCrawled = 0
    let postsWritten = 0
    let newPostsWritten = 0
    const failures: CrawlAllResult['failures'] = []

    while (queue.length > 0) {
      const sourceId = queue[0]
      if (sourceId === undefined) break

      const source = await db.sources.get(sourceId)
      if (source !== undefined) {
        const result = await crawlSource(source)
        sourcesCrawled += 1
        postsWritten += result.postsWritten
        newPostsWritten += result.newPostsWritten
        if (!result.ok) {
          failures.push({
            sourceId,
            error: result.error ?? 'Crawl failed',
          })
        }
      }

      queue = queue.slice(1)
      if (queue.length > 0) {
        await storageSet(CRAWL_QUEUE_KEY, queue)
      } else {
        await storageRemove(CRAWL_QUEUE_KEY)
      }
    }

    await pruneOldPosts()

    return { ok: true, sourcesCrawled, postsWritten, newPostsWritten, failures }
  } finally {
    await storageSet(CRAWL_IN_PROGRESS_KEY, false)
  }
}

export async function isCrawlInProgress(): Promise<boolean> {
  return (await storageGet<boolean>(CRAWL_IN_PROGRESS_KEY)) ?? false
}

export async function crawlSourceById(sourceId: number): Promise<CrawlSourceResult> {
  const source = await db.sources.get(sourceId)
  if (source === undefined) {
    return {
      ok: false,
      sourceId,
      postsWritten: 0,
      newPostsWritten: 0,
      error: `Source ${sourceId} was not found`,
    }
  }
  return crawlSource(source)
}

async function resolveFeed(
  source: Source,
  fetchedPage: FetchTextResult | undefined,
  cachedFeedUrl: string | undefined,
): Promise<FetchTextResult | undefined> {
  if (cachedFeedUrl !== undefined) {
    return fetchText(cachedFeedUrl)
  }

  if (fetchedPage === undefined) return undefined

  const declaredFeedUrl = discoverFeedUrl(fetchedPage.text, source.url)
  const sameOriginDeclaredFeedUrl = sameOriginUrl(declaredFeedUrl, source.url)
  if (sameOriginDeclaredFeedUrl !== undefined) {
    const feed = await fetchMaybe(sameOriginDeclaredFeedUrl)
    if (feed !== undefined && parseFeed(feed.text).length > 0) return feed
  }

  for (const candidate of feedProbeUrls(source.url)) {
    const feed = await fetchMaybe(candidate)
    if (feed !== undefined && parseFeed(feed.text).length > 0) return feed
  }

  return undefined
}

async function extractHtmlEntries(fetchedPage: FetchTextResult): Promise<HtmlEntry[]> {
  const doc = parseMarkup(fetchedPage.text, 'text/html')
  const sourceOrigin = new URL(fetchedPage.url).origin
  const links = Array.from(doc.querySelectorAll('article a, h2 a, h3 a'))
  const seen = new Set<string>()
  const candidates: Array<{ title: string; postUrl: string }> = []

  for (const link of links) {
    const href = link.getAttribute('href')
    if (href === null) continue
    const postUrl = new URL(href, fetchedPage.url).href
    if (new URL(postUrl).origin !== sourceOrigin) continue
    if (seen.has(postUrl)) continue

    seen.add(postUrl)
    candidates.push({
      title: link.textContent?.replace(/\s+/g, ' ').trim() || 'Untitled',
      postUrl,
    })
    if (candidates.length >= MAX_POSTS_PER_SOURCE) break
  }

  const entries: HtmlEntry[] = []
  for (const candidate of candidates) {
    entries.push(await enrichHtmlEntry(candidate))
  }
  return entries
}

async function enrichHtmlEntry(candidate: { title: string; postUrl: string }): Promise<HtmlEntry> {
  const page = await fetchMaybe(candidate.postUrl)
  if (page === undefined) {
    return {
      ...candidate,
      summary: '',
      thumbnail: resolveThumbnail({}),
    }
  }

  const doc = parseMarkup(page.text, 'text/html')
  const summary = metaContent(doc, 'og:description') ?? ''
  const ogImage = absoluteUrl(metaContent(doc, 'og:image'), candidate.postUrl)

  return {
    ...candidate,
    summary: summarize(summary),
    thumbnail: resolveThumbnail({
      ...(ogImage !== undefined ? { ogImage } : {}),
      contentHtml: page.text,
    }),
  }
}

function toPost({
  entry,
  source,
  crawledAt,
  crawlDay,
}: {
  entry: FeedEntry | HtmlEntry
  source: Source & { id: number }
  crawledAt: number
  crawlDay: string
}): Post {
  return {
    sourceId: source.id,
    sourceUrl: source.url,
    title: entry.title,
    summary: entry.summary,
    thumbnail: entry.thumbnail,
    postUrl: entry.postUrl,
    ...('publishedAt' in entry && entry.publishedAt !== undefined
      ? { publishedAt: entry.publishedAt }
      : {}),
    crawledAt,
    crawlDay,
  }
}

async function upsertPost(post: Post): Promise<boolean> {
  const existing = await db.posts.get({ postUrl: post.postUrl })
  await db.posts.put({
    ...post,
    ...(existing?.id !== undefined ? { id: existing.id } : {}),
  })
  return existing === undefined
}

async function fetchText(url: string): Promise<FetchTextResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`)
  }
  return { url, text: await response.text() }
}

async function fetchMaybe(url: string): Promise<FetchTextResult | undefined> {
  try {
    return await fetchText(url)
  } catch {
    return undefined
  }
}

function markSourceSuccess(
  sourceId: number,
  lastCrawledAt: number,
  feedUrl: string | undefined,
): Promise<number> {
  return db.sources.where(':id').equals(sourceId).modify((source) => {
    source.lastCrawledAt = lastCrawledAt
    if (feedUrl !== undefined) source.feedUrl = feedUrl
    delete source.lastError
  })
}

function markSourceFailure(sourceId: number, lastError: string) {
  return db.sources.update(sourceId, { lastError })
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function metaContent(doc: Document, property: string): string | undefined {
  return (
    doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ??
    doc.querySelector(`meta[name="${property}"]`)?.getAttribute('content') ??
    undefined
  )
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (value === undefined || !value.trim()) return undefined
  return new URL(value, baseUrl).href
}

function sameOriginUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (value === undefined) return undefined
  const url = new URL(value, baseUrl)
  return url.origin === new URL(baseUrl).origin ? url.href : undefined
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      resolve(items[key] as T | undefined)
    })
  })
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve)
  })
}

function storageRemove(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve)
  })
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
