import { db } from '../lib/db'
import { mapWithConcurrency } from '../lib/concurrency'
import { parseMarkup } from '../lib/dom'
import { discoverFeedUrl, feedProbeUrls, parseFeed, type FeedEntry } from '../lib/feed'
import { pruneOldPosts } from '../lib/prune'
import { summarize } from '../lib/summary'
import {
  PLACEHOLDER_THUMBNAIL,
  renderableThumbnail,
  resolveThumbnail,
} from '../lib/thumbnail'
import type { Post, Source } from '../lib/types'
import { fetchText, SOURCE_TIMEOUT_MS, type FetchTextResult } from './fetch'
import { ensureSourcePermission } from './permissions'

export const CRAWL_QUEUE_KEY = 'crawlQueue'
export const CRAWL_IN_PROGRESS_KEY = 'crawlInProgress'

const MAX_POSTS_PER_SOURCE = 5
const ENRICHMENT_CONCURRENCY = 3
const NON_POST_PATH_PREFIXES = ['/author', '/authors', '/category', '/page', '/tag', '/tags']

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

interface PreparedEntries<T> {
  entries: T[]
  existingByUrl: Map<string, Post>
}

type PostWithReusableMetadata = Post & { thumbnail: string }

/** Crawl one persisted source, upserting at most five newest posts. */
export async function crawlSource(source: Source): Promise<CrawlSourceResult> {
  if (source.id == null) {
    throw new Error('Cannot crawl a source before it has an id')
  }
  const persistedSource: Source & { id: number } = { ...source, id: source.id }
  const cachedFeedUrl = sameOriginUrl(source.feedUrl, source.url)

  try {
    const sourceSignal = AbortSignal.timeout(SOURCE_TIMEOUT_MS)
    const hasPermission = await ensureSourcePermission(persistedSource.id, persistedSource.url)
    if (!hasPermission) {
      return {
        ok: false,
        sourceId: persistedSource.id,
        postsWritten: 0,
        newPostsWritten: 0,
        error: `Permission required for ${persistedSource.url}`,
      }
    }

    const fetchedPage = cachedFeedUrl
      ? undefined
      : await fetchText(persistedSource.url, sourceSignal)
    const feed = await resolveFeed(persistedSource, fetchedPage, cachedFeedUrl, sourceSignal)
    const prepared =
      feed === undefined
        ? await extractHtmlEntries(
            fetchedPage ?? (await fetchText(persistedSource.url, sourceSignal)),
            sourceSignal,
          )
        : await enrichFeedEntries(parseFeed(feed.text), persistedSource.url, sourceSignal)

    const now = Date.now()
    const crawlDay = localDateKey(new Date(now))
    const posts = prepared.entries.slice(0, MAX_POSTS_PER_SOURCE).map((entry) =>
      toPost({
        entry,
        source: persistedSource,
        crawledAt: now,
        crawlDay,
      }),
    )

    const newPostsWritten = await upsertPosts(posts, prepared.existingByUrl)

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
  sourceSignal: AbortSignal,
): Promise<FetchTextResult | undefined> {
  if (cachedFeedUrl !== undefined) {
    return fetchText(cachedFeedUrl, sourceSignal)
  }

  if (fetchedPage === undefined) return undefined

  const declaredFeedUrl = discoverFeedUrl(fetchedPage.text, source.url)
  const sameOriginDeclaredFeedUrl = sameOriginUrl(declaredFeedUrl, source.url)
  if (sameOriginDeclaredFeedUrl !== undefined) {
    const feed = await fetchMaybe(sameOriginDeclaredFeedUrl, sourceSignal)
    if (feed !== undefined && parseFeed(feed.text).length > 0) return feed
  }

  for (const candidate of feedProbeUrls(source.url)) {
    const feed = await fetchMaybe(candidate, sourceSignal)
    if (feed !== undefined && parseFeed(feed.text).length > 0) return feed
  }

  return undefined
}

async function extractHtmlEntries(
  fetchedPage: FetchTextResult,
  sourceSignal: AbortSignal,
): Promise<PreparedEntries<HtmlEntry>> {
  const doc = parseMarkup(fetchedPage.text, 'text/html')
  const htmlCandidates = htmlPostCandidates(doc, fetchedPage.url).slice(0, MAX_POSTS_PER_SOURCE)
  const existingByUrl = await existingPostsByUrl(
    htmlCandidates.map((candidate) => candidate.postUrl),
  )
  const enrichedHtml = await mapWithConcurrency(
    htmlCandidates,
    ENRICHMENT_CONCURRENCY,
    async (candidate) => {
      const existing = existingByUrl.get(candidate.postUrl)
      return hasReusableMetadata(existing)
        ? {
            ...candidate,
            summary: existing.summary,
            thumbnail: existing.thumbnail,
          }
        : enrichHtmlEntry(candidate, sourceSignal)
    },
  )
  return { entries: enrichedHtml, existingByUrl }
}

function htmlPostCandidates(doc: Document, sourceUrl: string): Array<{ title: string; postUrl: string }> {
  const articleCandidates = Array.from(doc.querySelectorAll('article')).flatMap((article) => {
    const candidate = htmlPostCandidateFromArticle(article, sourceUrl)
    return candidate === undefined ? [] : [candidate]
  })

  const links =
    articleCandidates.length > 0
      ? articleCandidates
      : Array.from(doc.querySelectorAll('h1 a, h2 a, h3 a, article a')).flatMap((link) => {
          const candidate = htmlPostCandidateFromLink(link, sourceUrl)
          return candidate === undefined ? [] : [candidate]
        })

  const seen = new Set<string>()
  const candidates: Array<{ title: string; postUrl: string }> = []

  for (const candidate of links) {
    if (!seen.has(candidate.postUrl)) {
      seen.add(candidate.postUrl)
      candidates.push(candidate)
    }
  }

  return candidates
}

function htmlPostCandidateFromArticle(
  article: Element,
  sourceUrl: string,
): { title: string; postUrl: string } | undefined {
  const headingLinks = Array.from(article.querySelectorAll('h1 a, h2 a, h3 a'))
  for (const link of headingLinks) {
    const candidate = htmlPostCandidateFromLink(link, sourceUrl)
    if (candidate !== undefined) return candidate
  }

  const links = Array.from(article.querySelectorAll('a'))
  for (const link of links) {
    const candidate = htmlPostCandidateFromLink(link, sourceUrl)
    if (candidate !== undefined) return candidate
  }

  return undefined
}

function htmlPostCandidateFromLink(
  link: Element,
  sourceUrl: string,
): { title: string; postUrl: string } | undefined {
  const href = link.getAttribute('href')
  if (href === null) return undefined

  const postUrl = sameOriginUrl(href, sourceUrl)
  if (postUrl === undefined || !isLikelyPostUrl(postUrl, sourceUrl)) return undefined

  const title = linkTitle(link)
  return title === undefined ? undefined : { title, postUrl }
}

function linkTitle(link: Element): string | undefined {
  return (
    cleanText(link.textContent) ??
    cleanText(link.getAttribute('aria-label')) ??
    cleanText(link.querySelector('img')?.getAttribute('alt'))
  )
}

function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned : undefined
}

function isLikelyPostUrl(postUrl: string, sourceUrl: string): boolean {
  const url = new URL(postUrl)
  const source = new URL(sourceUrl)
  if (url.href === source.href) return false

  const path = url.pathname.replace(/\/+$/, '')
  const sourcePath = source.pathname.replace(/\/+$/, '')
  if (path === sourcePath) return false

  return !NON_POST_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

async function enrichFeedEntries(
  entries: FeedEntry[],
  sourceUrl: string,
  sourceSignal: AbortSignal,
): Promise<PreparedEntries<FeedEntry>> {
  const feedEntries = entries.slice(0, MAX_POSTS_PER_SOURCE)
  const existingByUrl = await existingPostsByUrl(feedEntries.map((entry) => entry.postUrl))
  const enrichedFeed = await mapWithConcurrency(
    feedEntries,
    ENRICHMENT_CONCURRENCY,
    async (entry) => {
      const existing = existingByUrl.get(entry.postUrl)
      return hasReusableMetadata(existing)
        ? { ...entry, summary: existing.summary, thumbnail: existing.thumbnail }
        : enrichFeedEntry(entry, sourceUrl, sourceSignal)
    },
  )
  return { entries: enrichedFeed, existingByUrl }
}

async function enrichFeedEntry(
  entry: FeedEntry,
  sourceUrl: string,
  sourceSignal: AbortSignal,
): Promise<FeedEntry> {
  if (entry.thumbnail !== PLACEHOLDER_THUMBNAIL) return entry
  const postUrl = sameOriginUrl(entry.postUrl, sourceUrl)
  if (postUrl === undefined) return entry

  const page = await fetchMaybe(postUrl, sourceSignal)
  if (page === undefined) return entry

  const doc = parseMarkup(page.text, 'text/html')
  const ogImage = absoluteUrl(metaContent(doc, 'og:image'), page.url)
  return {
    ...entry,
    postUrl,
    thumbnail: resolveThumbnail({
      ...(ogImage !== undefined ? { ogImage } : {}),
      contentHtml: page.text,
      baseUrl: page.url,
    }),
  }
}

async function enrichHtmlEntry(
  candidate: { title: string; postUrl: string },
  sourceSignal: AbortSignal,
): Promise<HtmlEntry> {
  const page = await fetchMaybe(candidate.postUrl, sourceSignal)
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
      baseUrl: page.url,
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
    thumbnail: renderableThumbnail(entry.thumbnail, source.url),
    postUrl: entry.postUrl,
    ...('publishedAt' in entry && entry.publishedAt !== undefined
      ? { publishedAt: entry.publishedAt }
      : {}),
    crawledAt,
    crawlDay,
  }
}

async function existingPostsByUrl(postUrls: readonly string[]): Promise<Map<string, Post>> {
  if (postUrls.length === 0) return new Map()
  const rows = await db.posts.where('postUrl').anyOf([...postUrls]).toArray()
  return new Map(rows.map((post) => [post.postUrl, post]))
}

function hasReusableMetadata(post: Post | undefined): post is PostWithReusableMetadata {
  return (
    post !== undefined &&
    post.summary.trim().length > 0 &&
    post.thumbnail !== undefined &&
    post.thumbnail !== PLACEHOLDER_THUMBNAIL
  )
}

async function upsertPosts(
  posts: readonly Post[],
  existingByUrl: ReadonlyMap<string, Post>,
): Promise<number> {
  const rows = posts.map((post) => {
    const existing = existingByUrl.get(post.postUrl)
    return existing?.id === undefined ? post : { ...post, id: existing.id }
  })

  await db.transaction('rw', db.posts, async () => {
    await db.posts.bulkPut(rows)
  })
  return posts.filter((post) => !existingByUrl.has(post.postUrl)).length
}

async function fetchMaybe(
  url: string,
  sourceSignal: AbortSignal,
): Promise<FetchTextResult | undefined> {
  try {
    return await fetchText(url, sourceSignal)
  } catch (error) {
    if (sourceSignal.aborted) throw error
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
