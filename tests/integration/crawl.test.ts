import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crawlAll,
  crawlSource,
  CRAWL_CONTINUATION_ALARM,
  CRAWL_QUEUE_KEY,
  CRAWL_RUN_KEY,
  MAX_CRAWL_INVOCATION_MS,
} from '../../src/background/crawl'
import { MAX_MARKUP_BYTES, SOURCE_TIMEOUT_MS } from '../../src/background/fetch'
import { db } from '../../src/lib/db'
import type { Source, WorkerRequest, WorkerResponse } from '../../src/lib/types'

type FetchMap = Record<string, string | Error | undefined>

interface MockStorageArea {
  values: Record<string, unknown>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

interface MockPermissions {
  contains: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

interface ListenerSlot<T extends (...args: never[]) => unknown> {
  listeners: T[]
  addListener: (listener: T) => void
}

type MessageListener = (
  message: WorkerRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: WorkerResponse) => void,
) => boolean | undefined

type ContextMenuClickListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
) => void

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')

const pageWithFeed = fixture('page-with-feed-link.html')
const rss = fixture('rss-2.0.xml')
const pageWithoutFeed = fixture('page-no-feed.html')
const declaredFeedPage = `<!doctype html>
  <html><head>
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
  </head><body></body></html>`

let storage: MockStorageArea
let messageListeners: MessageListener[]
let clickListeners: ContextMenuClickListener[]
let startupListeners: Array<() => void>
let installedListeners: Array<() => void>
let alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void>
let notificationClickListeners: Array<(notificationId: string) => void>
let permissions: MockPermissions

beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-20T10:15:00+07:00').getTime())

  await db.posts.clear()
  await db.sources.clear()
  await db.favoritePosts.clear()

  storage = installChromeMock()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('crawlSource', () => {
  it('discovers a declared feed, caches the feed URL, and writes the newest 5 posts', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({ ok: true, sourceId: source.id, postsWritten: 5, newPostsWritten: 5 })
    const posts = await db.posts.orderBy('publishedAt').reverse().toArray()
    expect(posts).toHaveLength(5)
    expect(posts[0]).toMatchObject({
      sourceId: source.id,
      sourceUrl: 'https://blog.example.com/',
      title: 'Post One',
      summary: 'First post body with HTML and an image.',
      thumbnail: '/placeholder.svg',
      postUrl: 'https://example.com/post-1',
      publishedAt: Date.parse('Fri, 20 Jun 2026 09:00:00 GMT'),
      crawledAt: Date.now(),
      crawlDay: '2026-06-20',
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      feedUrl: 'https://blog.example.com/feed.xml',
      lastCrawledAt: Date.now(),
    })
  })

  it('falls back to a same-origin post image when feed media is off-origin', async () => {
    installFetchMock({
      'https://blog.test/': `<!doctype html>
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        </head><body></body></html>`,
      'https://blog.test/feed.xml': `<?xml version="1.0"?>
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
          <item>
            <title>Post with CDN media</title>
            <link>https://blog.test/post-with-cdn-media</link>
            <description>Feed summary.</description>
            <media:thumbnail url="https://cdn.test/image.jpg" />
          </item>
        </channel></rss>`,
      'https://blog.test/post-with-cdn-media': `<!doctype html>
        <html><head>
          <meta property="og:image" content="/images/post-cover.jpg" />
        </head><body><h1>Post with CDN media</h1></body></html>`,
    })
    const source = await addSourceRow('https://blog.test/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 1,
      newPostsWritten: 1,
    })

    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'Post with CDN media',
        thumbnail: 'https://blog.test/images/post-cover.jpg',
        postUrl: 'https://blog.test/post-with-cdn-media',
      },
    ])
  })

  it('stores a DEV thumbnail served from a secure source subdomain', async () => {
    installFetchMock({
      'https://dev.to/': `<!doctype html>
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/feed" />
        </head><body></body></html>`,
      'https://dev.to/feed': `<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <item>
            <title>DEV post</title>
            <link>https://dev.to/author/post</link>
            <description>DEV post summary.</description>
          </item>
        </channel></rss>`,
      'https://dev.to/author/post': `<!doctype html>
        <html><head>
          <meta property="og:image" content="https://media2.dev.to/dynamic/image/post.webp" />
        </head><body><h1>DEV post</h1></body></html>`,
    })
    const source = await addSourceRow('https://dev.to/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 1,
      newPostsWritten: 1,
    })

    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'DEV post',
        thumbnail: 'https://media2.dev.to/dynamic/image/post.webp',
        postUrl: 'https://dev.to/author/post',
      },
    ])
  })

  it('crawls in a service-worker-like runtime without global DOMParser', async () => {
    vi.stubGlobal('DOMParser', undefined)
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({ ok: true, sourceId: source.id, postsWritten: 5, newPostsWritten: 5 })
    expect(await db.posts.count()).toBe(5)
  })

  it('upserts by postUrl so re-crawling the same feed does not duplicate posts', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://blog.example.com/')

    const firstResult = await crawlSource(source)
    const firstIds = new Map(
      (await db.posts.toArray()).map((post) => [post.postUrl, post.id]),
    )
    const secondResult = await crawlSource({ ...source, feedUrl: 'https://blog.example.com/feed.xml' })

    expect(firstResult).toEqual({
      ok: true,
      sourceId: source.id,
      postsWritten: 5,
      newPostsWritten: 5,
    })
    expect(secondResult).toEqual({
      ok: true,
      sourceId: source.id,
      postsWritten: 5,
      newPostsWritten: 0,
    })
    expect(await db.posts.count()).toBe(5)
    for (const post of await db.posts.toArray()) {
      expect(post.id).toBe(firstIds.get(post.postUrl))
    }
  })

  it('reuses complete metadata without repeating post-page requests', async () => {
    const responses: FetchMap = {
      'https://cache.test/': declaredFeedPage,
      'https://cache.test/feed.xml': noMediaFeed('https://cache.test'),
    }
    for (let index = 1; index <= 5; index += 1) {
      responses[`https://cache.test/post-${index}`] = metadataPage(index)
    }
    const fetchMock = installFetchMock(responses)
    const source = await addSourceRow('https://cache.test/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      newPostsWritten: 5,
    })
    fetchMock.mockClear()

    await expect(
      crawlSource({ ...source, feedUrl: 'https://cache.test/feed.xml' }),
    ).resolves.toMatchObject({
      ok: true,
      postsWritten: 5,
      newPostsWritten: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cache.test/feed.xml',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    for (let index = 1; index <= 5; index += 1) {
      expect(fetchMock).not.toHaveBeenCalledWith(
        `https://cache.test/post-${index}`,
        expect.anything(),
      )
    }
  })

  it('limits post-page enrichment to three active requests', async () => {
    let activePostRequests = 0
    let maximumActivePostRequests = 0
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url === 'https://concurrency.test/') {
        return httpResponse(declaredFeedPage, url)
      }
      if (url === 'https://concurrency.test/feed.xml') {
        return httpResponse(noMediaFeed('https://concurrency.test'), url)
      }

      activePostRequests += 1
      maximumActivePostRequests = Math.max(maximumActivePostRequests, activePostRequests)
      await new Promise<void>((resolve) =>
        queueMicrotask(() => {
          activePostRequests -= 1
          resolve()
        }),
      )
      const index = Number(url.split('-').at(-1))
      return httpResponse(metadataPage(index), url)
    })
    vi.stubGlobal('fetch', fetchMock)
    const source = await addSourceRow('https://concurrency.test/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 5,
      newPostsWritten: 5,
    })
    expect(maximumActivePostRequests).toBe(3)
  })

  it('writes a source crawl with one bulk operation', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    const bulkPutSpy = vi.spyOn(db.posts, 'bulkPut')
    const putSpy = vi.spyOn(db.posts, 'put')
    const source = await addSourceRow('https://blog.example.com/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 5,
      newPostsWritten: 5,
    })
    expect(bulkPutSpy).toHaveBeenCalledOnce()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('falls back to HTML links and Open Graph metadata when no feed is available', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithoutFeed,
      'https://blog.example.com/post-x': `<!doctype html>
        <html><head>
          <title>Post X Full Title</title>
          <meta property="og:description" content="A fallback summary from Open Graph." />
          <meta property="og:image" content="/cover-x.png" />
        </head><body><h1>Post X</h1></body></html>`,
    })
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({ ok: true, sourceId: source.id, postsWritten: 1, newPostsWritten: 1 })
    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        sourceId: source.id,
        sourceUrl: 'https://blog.example.com/',
        title: 'Post X',
        summary: 'A fallback summary from Open Graph.',
        thumbnail: 'https://blog.example.com/cover-x.png',
        postUrl: 'https://blog.example.com/post-x',
        crawledAt: Date.now(),
        crawlDay: '2026-06-20',
      },
    ])
  })

  it('uses article title links when HTML fallback pages include image, tag, and author links', async () => {
    installFetchMock({
      'https://devopscube.com/blog/': `<!doctype html>
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/rss/" />
        </head><body>
          <article>
            <a href="https://devopscube.com/create-helm-chart/">
              <img
                alt="Helm Chart Tutorial: A Simple Guide for Beginners"
                src="https://storage.ghost.io/content/images/size/w100/helm-chart.png"
              />
            </a>
            <a href="/tag/kubernetes/">Kubernetes</a>
            <h2>
              <a
                aria-label="Helm Chart Tutorial: A Simple Guide for Beginners"
                href="https://devopscube.com/create-helm-chart/"
              >Helm Chart Tutorial: A Simple Guide for Beginners</a>
            </h2>
            <a aria-label="Aman Jaiswal" href="/author/aman/">
              <img alt="Aman Jaiswal" src="https://devopscube.com/author-avatar.png" />
            </a>
          </article>
          <article>
            <a href="https://devopscube.com/slsa-provenance/">
              <img
                alt="SLSA Provenance Creation using GitHub Actions"
                src="https://storage.ghost.io/content/images/size/w100/slsa.png"
              />
            </a>
            <a href="/tag/github-actions/">GITHUB ACTIONS</a>
            <h2>
              <a
                aria-label="SLSA Provenance Creation using GitHub Actions"
                href="https://devopscube.com/slsa-provenance/"
              >SLSA Provenance Creation using GitHub Actions</a>
            </h2>
            <a aria-label="Aswin Vijayan" href="/author/aswin/">
              <img alt="Aswin Vijayan" src="https://devopscube.com/aswin-avatar.png" />
            </a>
          </article>
        </body></html>`,
      'https://devopscube.com/rss/': `<?xml version="1.0"?>
        <rss version="2.0"><channel><title>DevOpsCube</title></channel></rss>`,
      'https://devopscube.com/feed': new Error('not found'),
      'https://devopscube.com/rss': new Error('not found'),
      'https://devopscube.com/rss.xml': new Error('not found'),
      'https://devopscube.com/atom.xml': new Error('not found'),
      'https://devopscube.com/feed.xml': new Error('not found'),
      'https://devopscube.com/index.xml': new Error('not found'),
      'https://devopscube.com/create-helm-chart/': `<!doctype html>
        <html><head>
          <meta property="og:description" content="Learn how to create a Helm chart." />
          <meta property="og:image" content="https://devopscube.com/helm-og.png" />
        </head><body></body></html>`,
      'https://devopscube.com/slsa-provenance/': `<!doctype html>
        <html><head>
          <meta property="og:description" content="Learn SLSA provenance with GitHub Actions." />
          <meta property="og:image" content="https://devopscube.com/slsa-og.png" />
        </head><body></body></html>`,
    })
    const source = await addSourceRow('https://devopscube.com/blog/')

    const result = await crawlSource(source)

    expect(result).toEqual({ ok: true, sourceId: source.id, postsWritten: 2, newPostsWritten: 2 })
    await expect(db.posts.orderBy('postUrl').toArray()).resolves.toMatchObject([
      {
        title: 'Helm Chart Tutorial: A Simple Guide for Beginners',
        thumbnail: 'https://devopscube.com/helm-og.png',
        postUrl: 'https://devopscube.com/create-helm-chart/',
      },
      {
        title: 'SLSA Provenance Creation using GitHub Actions',
        thumbnail: 'https://devopscube.com/slsa-og.png',
        postUrl: 'https://devopscube.com/slsa-provenance/',
      },
    ])
  })

  it('enriches feed entries with post Open Graph images when the feed has no image', async () => {
    const fetchMock = installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': `<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <item>
            <title>Feed post without media</title>
            <link>/post-with-og-image</link>
            <description><![CDATA[<p>Feed summary without an image.</p>]]></description>
            <pubDate>Fri, 20 Jun 2026 09:00:00 GMT</pubDate>
          </item>
        </channel></rss>`,
      'https://blog.example.com/post-with-og-image': `<!doctype html>
        <html><head>
          <meta property="og:image" content="/covers/post-with-og-image.png" />
        </head><body><h1>Feed post without media</h1></body></html>`,
    })
    const source = await addSourceRow('https://blog.example.com/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 1,
      newPostsWritten: 1,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://blog.example.com/post-with-og-image',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'Feed post without media',
        summary: 'Feed summary without an image.',
        thumbnail: 'https://blog.example.com/covers/post-with-og-image.png',
        postUrl: 'https://blog.example.com/post-with-og-image',
      },
    ])
  })

  it('falls back to a same-origin content image when Open Graph media is off-origin', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': `<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <item>
            <title>Feed post with mixed image origins</title>
            <link>/post-with-mixed-images</link>
            <description>Feed summary without an image.</description>
          </item>
        </channel></rss>`,
      'https://blog.example.com/post-with-mixed-images': `<!doctype html>
        <html><head>
          <meta property="og:image" content="https://cdn.test/remote-cover.jpg" />
        </head><body>
          <img src="/images/local-cover.jpg" alt="Post cover" />
        </body></html>`,
    })
    const source = await addSourceRow('https://blog.example.com/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 1,
      newPostsWritten: 1,
    })

    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'Feed post with mixed image origins',
        thumbnail: 'https://blog.example.com/images/local-cover.jpg',
        postUrl: 'https://blog.example.com/post-with-mixed-images',
      },
    ])
  })

  it('uses the packaged placeholder for AWS Blogs posts with no crawled thumbnail', async () => {
    installFetchMock({
      'https://aws.amazon.com/blogs/': `<!doctype html>
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/blogs/feed/" />
        </head><body></body></html>`,
      'https://aws.amazon.com/blogs/feed/': `<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <item>
            <title>AWS post without image metadata</title>
            <link>https://aws.amazon.com/blogs/example/post-without-image/</link>
            <description><![CDATA[<p>AWS feed summary without image metadata.</p>]]></description>
            <pubDate>Fri, 20 Jun 2026 09:00:00 GMT</pubDate>
          </item>
        </channel></rss>`,
      'https://aws.amazon.com/blogs/example/post-without-image/': `<!doctype html>
        <html><head>
          <meta property="og:description" content="No image here." />
        </head><body><h1>AWS post without image metadata</h1></body></html>`,
    })
    const source = await addSourceRow('https://aws.amazon.com/blogs/')

    await expect(crawlSource(source)).resolves.toMatchObject({
      ok: true,
      postsWritten: 1,
      newPostsWritten: 1,
    })

    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'AWS post without image metadata',
        thumbnail: '/placeholder.svg',
        postUrl: 'https://aws.amazon.com/blogs/example/post-without-image/',
      },
    ])
  })

  it('does not fetch an off-origin declared feed', async () => {
    const fetchMock = installFetchMock({
      'https://blog.example.com/': `<!doctype html>
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="https://feeds.example.net/rss.xml" />
        </head><body><article><a href="/local-post">Local Post</a></article></body></html>`,
      'https://blog.example.com/local-post': `<!doctype html>
        <html><head>
          <meta property="og:description" content="Local only." />
        </head><body></body></html>`,
      'https://feeds.example.net/rss.xml': rss,
    })
    const source = await addSourceRow('https://blog.example.com/')

    await crawlSource(source)

    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://feeds.example.net/rss.xml',
      expect.anything(),
    )
    await expect(db.posts.toArray()).resolves.toMatchObject([
      { postUrl: 'https://blog.example.com/local-post', summary: 'Local only.' },
    ])
  })

  it('records lastError when a crawl fails', async () => {
    installFetchMock({
      'https://blog.example.com/': new Error('network down'),
    })
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({
      ok: false,
      sourceId: source.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: 'network down',
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      lastError: 'network down',
    })
    expect(await db.posts.count()).toBe(0)
  })

  it('aborts and records a crawl that exceeds the shared source deadline', async () => {
    const sourceTimeout = new AbortController()
    const requestTimeout = new AbortController()
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(sourceTimeout.signal)
      .mockReturnValue(requestTimeout.signal)
    let rejectFetch: ((reason?: unknown) => void) | undefined
    const fetchMock = vi.fn(
      (input: URL | RequestInfo, init?: RequestInit) => {
        const url = String(input)
        if (url === 'https://slow.example.com/') {
          return Promise.resolve(httpResponse(pageWithFeed, url))
        }
        if (url !== 'https://slow.example.com/feed.xml') {
          return Promise.resolve(httpResponse('', url, 404))
        }
        return new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject
          if (init?.signal?.aborted === true) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const source = await addSourceRow('https://slow.example.com/')

    const crawl = crawlSource(source)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://slow.example.com/feed.xml',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    sourceTimeout.abort()
    rejectFetch?.(new DOMException('Aborted', 'AbortError'))

    await expect(crawl).resolves.toEqual({
      ok: false,
      sourceId: source.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: 'Source crawl timed out after 30 seconds for https://slow.example.com/feed.xml',
    })
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, SOURCE_TIMEOUT_MS)
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      lastError: 'Source crawl timed out after 30 seconds for https://slow.example.com/feed.xml',
    })
  })

  it('records a redirect to an origin without permission', async () => {
    permissions.contains.mockImplementation(
      (request: chrome.permissions.Permissions, callback: (result: boolean) => void) => {
        callback(request.origins?.[0] === 'https://blog.example.com/*')
      },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => httpResponse('<rss version="2.0"></rss>', 'https://redirected.test/feed')),
    )
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({
      ok: false,
      sourceId: source.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: 'Redirected to an origin without permission: https://redirected.test/feed',
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      lastError: 'Redirected to an origin without permission: https://redirected.test/feed',
    })
  })

  it('records a streamed source body that exceeds the markup limit', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url !== 'https://large.example.com/') {
        return httpResponse('', url, 404)
      }
      const chunk = new Uint8Array(MAX_MARKUP_BYTES / 2 + 1)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk)
          controller.enqueue(chunk)
          controller.close()
        },
      })
      return httpResponse(body, url)
    })
    vi.stubGlobal('fetch', fetchMock)
    const source = await addSourceRow('https://large.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({
      ok: false,
      sourceId: source.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: 'Response exceeded 2097152 bytes for https://large.example.com/',
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      lastError: 'Response exceeded 2097152 bytes for https://large.example.com/',
    })
  })

  it('reports a failure and marks the source when origin permission is missing', async () => {
    permissions.contains.mockImplementation(
      (_request: chrome.permissions.Permissions, callback: (result: boolean) => void) => {
        callback(false)
      },
    )
    const fetchMock = installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://blog.example.com/')

    const result = await crawlSource(source)

    expect(result).toEqual({
      ok: false,
      sourceId: source.id,
      postsWritten: 0,
      newPostsWritten: 0,
      error: 'Permission required for https://blog.example.com/',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      permissionState: 'needsPermission',
    })
  })
})

describe('crawlAll', () => {
  it('shares one active crawl across concurrent callers', async () => {
    const source = await addSourceRow('https://single-flight.test/')
    await db.sources.update(source.id, { feedUrl: 'https://single-flight.test/feed.xml' })
    let releaseFeed!: () => void
    const feedGate = new Promise<void>((resolve) => {
      releaseFeed = resolve
    })
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      await feedGate
      return httpResponse(rss.replaceAll('https://example.com/', 'https://single-flight.test/'), url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = crawlAll()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const second = crawlAll()
    const samePromise = first === second
    const settledPromise = Promise.allSettled([first, second])
    queueMicrotask(releaseFeed)
    const settled = await settledPromise

    expect(samePromise).toBe(true)
    expect(settled[0]).toMatchObject({ status: 'fulfilled' })
    expect(settled[1]).toMatchObject({ status: 'fulfilled' })
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === 'https://single-flight.test/feed.xml',
      ),
    ).toHaveLength(1)
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === 'https://single-flight.test/post-5',
      ),
    ).toHaveLength(1)
  })

  it('persists partial progress and resumes with cumulative totals', async () => {
    const first = await addSourceRow('https://first.batch.test/')
    const second = await addSourceRow('https://second.batch.test/')
    await db.sources.update(first.id, { feedUrl: 'https://first.batch.test/feed.xml' })
    await db.sources.update(second.id, { feedUrl: 'https://second.batch.test/feed.xml' })

    const startedAt = new Date('2026-06-20T10:15:00+07:00').getTime()
    let clock = startedAt
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url === 'https://first.batch.test/feed.xml') {
        clock = startedAt + MAX_CRAWL_INVOCATION_MS
        return httpResponse(
          rss.replaceAll('https://example.com/', 'https://first.batch.test/'),
          url,
        )
      }
      return httpResponse(
        rss.replaceAll('https://example.com/', 'https://second.batch.test/'),
        url,
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const now = () => clock

    const partial = await crawlAll({ now })

    expect(partial).toEqual({
      ok: true,
      completed: false,
      notificationRequested: false,
      sourcesCrawled: 1,
      postsWritten: 5,
      newPostsWritten: 5,
      failures: [],
    })
    expect(storage.values[CRAWL_QUEUE_KEY]).toEqual([second.id])
    expect(storage.values[CRAWL_RUN_KEY]).toEqual({
      startedAt,
      notificationRequested: false,
      sourcesCrawled: 1,
      postsWritten: 5,
      newPostsWritten: 5,
      failures: [],
    })
    expect(storage.values.crawlInProgress).toBe(true)
    expect(chrome.alarms.create).toHaveBeenCalledWith(CRAWL_CONTINUATION_ALARM, {
      when: clock + 60_000,
    })

    const completed = await crawlAll({ now })

    expect(completed).toEqual({
      ok: true,
      completed: true,
      notificationRequested: false,
      sourcesCrawled: 2,
      postsWritten: 10,
      newPostsWritten: 10,
      failures: [],
    })
    expect(storage.values[CRAWL_QUEUE_KEY]).toBeUndefined()
    expect(storage.values[CRAWL_RUN_KEY]).toBeUndefined()
    expect(storage.values.crawlInProgress).toBe(false)
  })

  it('rebuilds a stale empty checkpoint so newly saved sources are crawled', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    storage.values[CRAWL_QUEUE_KEY] = []

    const result = await crawlAll()

    expect(result).toEqual({
      ok: true,
      completed: true,
      notificationRequested: false,
      sourcesCrawled: 1,
      postsWritten: 5,
      newPostsWritten: 5,
      failures: [],
    })
    expect(await db.posts.count()).toBe(5)
    expect(storage.values[CRAWL_QUEUE_KEY]).toBeUndefined()
  })

  it('prunes posts outside the retention window after crawling', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await db.posts.bulkAdd([
      oldPost('2026-06-11', 1),
      oldPost('2026-06-12', 2),
      oldPost('2026-06-13', 3),
      oldPost('2026-06-14', 4),
      oldPost('2026-06-15', 5),
      oldPost('2026-06-16', 6),
      oldPost('2026-06-17', 7),
    ])
    await addSourceRow('https://blog.example.com/')

    await crawlAll()

    const remainingDays = new Set((await db.posts.toArray()).map((post) => post.crawlDay))
    expect(remainingDays.has('2026-06-11')).toBe(false)
    expect(remainingDays.has('2026-06-20')).toBe(true)
  })

  it('resumes an existing checkpoint queue instead of restarting every source', async () => {
    installFetchMock({
      'https://second.example.com/': pageWithFeed,
      'https://second.example.com/feed.xml': rss,
    })
    await addSourceRow('https://first.example.com/')
    const second = await addSourceRow('https://second.example.com/')
    storage.values[CRAWL_QUEUE_KEY] = [second.id]

    const result = await crawlAll()

    expect(result).toEqual({
      ok: true,
      completed: true,
      notificationRequested: false,
      sourcesCrawled: 1,
      postsWritten: 5,
      newPostsWritten: 5,
      failures: [],
    })
    expect(await db.posts.count()).toBe(5)
    expect(storage.values[CRAWL_QUEUE_KEY]).toBeUndefined()
  })
})

describe('worker crawl wiring', () => {
  it('removes an optional origin grant only after its final source is deleted', async () => {
    const firstId = await db.sources.add({
      url: 'https://blog.test/first',
      title: 'First',
      addedAt: 1,
    })
    const secondId = await db.sources.add({
      url: 'https://blog.test/second',
      title: 'Second',
      addedAt: 2,
    })
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(
      sendWorkerMessage(listener, { type: 'DELETE_SOURCE', sourceId: firstId }),
    ).resolves.toEqual({ ok: true })
    expect(permissions.remove).not.toHaveBeenCalled()

    await expect(
      sendWorkerMessage(listener, { type: 'DELETE_SOURCE', sourceId: secondId }),
    ).resolves.toEqual({ ok: true })
    expect(permissions.remove).toHaveBeenCalledWith(
      { origins: ['https://blog.test/*'] },
      expect.any(Function),
    )
  })

  it('requests an origin grant on source save and records denial without crawling', async () => {
    permissions.request.mockImplementation(
      (_request: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
        callback(false)
      },
    )
    const fetchMock = installFetchMock({
      'https://denied.example.com/': pageWithFeed,
      'https://denied.example.com/feed.xml': rss,
    })
    await import('../../src/background/index')
    const listener = expectMessageListener()

    const response = await sendWorkerMessage(listener, {
      type: 'SAVE_SOURCE',
      url: 'https://denied.example.com/',
      title: 'Denied Blog',
    })

    expect(response).toMatchObject({ ok: true, permissionGranted: false })
    expect(permissions.request).toHaveBeenCalledWith(
      { origins: ['https://denied.example.com/*'] },
      expect.any(Function),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(db.sources.get({ url: 'https://denied.example.com/' })).resolves.toMatchObject({
      title: 'Denied Blog',
      permissionState: 'needsPermission',
    })
  })

  it('re-requests permission and crawls the source after a grant', async () => {
    permissions.request.mockImplementation(
      (_request: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
        callback(true)
      },
    )
    installFetchMock({
      'https://denied.example.com/': pageWithFeed,
      'https://denied.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://denied.example.com/')
    await db.sources.update(source.id, { permissionState: 'needsPermission' })
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(
      sendWorkerMessage(listener, {
        type: 'REQUEST_SOURCE_PERMISSION',
        sourceId: source.id,
      }),
    ).resolves.toMatchObject({ ok: true, permissionGranted: true })

    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(5)
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      permissionState: 'granted',
    })
  })

  it('records a popup-granted permission result without prompting from the worker', async () => {
    installFetchMock({
      'https://denied.example.com/': pageWithFeed,
      'https://denied.example.com/feed.xml': rss,
    })
    const source = await addSourceRow('https://denied.example.com/')
    await db.sources.update(source.id, { permissionState: 'needsPermission' })
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(
      sendWorkerMessage(listener, {
        type: 'REQUEST_SOURCE_PERMISSION',
        sourceId: source.id,
        permissionGranted: true,
      }),
    ).resolves.toMatchObject({ ok: true, permissionGranted: true })

    expect(permissions.request).not.toHaveBeenCalled()
    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(5)
    })
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      permissionState: 'granted',
    })
  })

  it('handles CRAWL_SOURCE / CRAWL_ALL messages and crawls after a context-menu save', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
      'https://saved.example.com/': pageWithFeed,
      'https://saved.example.com/feed.xml': rss.replaceAll(
        'https://example.com/',
        'https://saved.example.com/',
      ),
    })
    const source = await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(sendWorkerMessage(listener, { type: 'CRAWL_SOURCE', sourceId: source.id })).resolves
      .toMatchObject({ ok: true })
    expect(await db.posts.count()).toBe(5)

    await db.posts.clear()
    await expect(sendWorkerMessage(listener, { type: 'CRAWL_ALL' })).resolves.toEqual({
      ok: true,
      crawlCompleted: true,
      sourcesCrawled: 1,
      postsWritten: 5,
      newPostsWritten: 5,
      failures: [],
    })
    expect(await db.posts.count()).toBe(5)

    expectClickListener()(
      {
        menuItemId: 'dev-corner-save',
        pageUrl: 'https://saved.example.com/',
      } as chrome.contextMenus.OnClickData,
      { title: 'Example Blog' } as chrome.tabs.Tab,
    )

    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(10)
    })
    await expect(db.sources.get({ url: 'https://saved.example.com/' })).resolves.toMatchObject({
      title: 'Example Blog',
    })
  })

  it('starts a crawl when Chrome starts', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')

    expectStartupListener()()

    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(5)
    })
    expect(storage.values.crawlInProgress).toBe(false)
  })

  it('schedules daily 07:00 crawls when enabled and clears the alarm when disabled', async () => {
    vi.mocked(Date.now).mockReturnValue(new Date(2026, 5, 20, 6, 30, 0).getTime())
    await import('../../src/background/index')

    expectInstalledListener()()
    await vi.waitFor(() => {
      expect(chrome.alarms.create).toHaveBeenCalledWith('daily-0700-crawl', {
        when: new Date(2026, 5, 20, 7, 0, 0).getTime(),
      })
    })

    const listener = expectMessageListener()
    await expect(
      sendWorkerMessage(listener, {
        type: 'UPDATE_SETTINGS',
        settings: { enableDailyCron: false },
      }),
    ).resolves.toEqual({
      ok: true,
      settings: { enableDailyCron: false, enableDailyNotifications: false },
    })
    expect(chrome.alarms.clear).toHaveBeenCalledWith('daily-0700-crawl', expect.any(Function))
  })

  it('crawls and reschedules when the daily alarm fires', async () => {
    storage.values.settings = { enableDailyCron: true, enableDailyNotifications: true }
    vi.mocked(Date.now).mockReturnValue(new Date(2026, 5, 20, 7, 0, 0).getTime())
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')

    expectAlarmListener()({ name: 'daily-0700-crawl', scheduledTime: Date.now() })

    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(5)
    })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'daily-digest-2026-06-20',
      {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'dev-corner digest',
        message: '5 new posts are ready in your 5-post digest.',
      },
      expect.any(Function),
    )
    expect(storage.values.lastDigestNotificationDate).toBe('2026-06-20')
    expect(chrome.alarms.create).toHaveBeenCalledWith('daily-0700-crawl', {
      when: new Date(2026, 5, 21, 7, 0, 0).getTime(),
    })
  })

  it('notifies once after a daily crawl completes across continuation batches', async () => {
    storage.values.settings = { enableDailyCron: true, enableDailyNotifications: true }
    const startedAt = new Date(2026, 5, 20, 7, 0, 0).getTime()
    let clock = startedAt
    vi.mocked(Date.now).mockImplementation(() => clock)
    const first = await addSourceRow('https://first.daily.test/')
    const second = await addSourceRow('https://second.daily.test/')
    await db.sources.update(first.id, { feedUrl: 'https://first.daily.test/feed.xml' })
    await db.sources.update(second.id, { feedUrl: 'https://second.daily.test/feed.xml' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => {
        const url = String(input)
        if (url === 'https://first.daily.test/feed.xml') {
          clock = startedAt + MAX_CRAWL_INVOCATION_MS
          return httpResponse(
            rss.replaceAll('https://example.com/', 'https://first.daily.test/'),
            url,
          )
        }
        return httpResponse(
          rss.replaceAll('https://example.com/', 'https://second.daily.test/'),
          url,
        )
      }),
    )
    await import('../../src/background/index')
    const alarmListener = expectAlarmListener()

    alarmListener({ name: 'daily-0700-crawl', scheduledTime: startedAt })

    await vi.waitFor(() => {
      expect(chrome.alarms.create).toHaveBeenCalledWith(CRAWL_CONTINUATION_ALARM, {
        when: startedAt + MAX_CRAWL_INVOCATION_MS + 60_000,
      })
      expect(chrome.alarms.create).toHaveBeenCalledWith('daily-0700-crawl', {
        when: new Date(2026, 5, 21, 7, 0, 0).getTime(),
      })
    })
    expect(storage.values.crawlInProgress).toBe(true)
    expect(chrome.notifications.create).not.toHaveBeenCalled()

    alarmListener({ name: CRAWL_CONTINUATION_ALARM, scheduledTime: clock + 60_000 })

    await vi.waitFor(() => {
      expect(chrome.notifications.create).toHaveBeenCalledTimes(1)
      expect(storage.values.crawlInProgress).toBe(false)
    })
    expect(storage.values.lastDigestNotificationDate).toBe('2026-06-20')
    expect(await db.posts.count()).toBe(10)
  })

  it('does not create a second daily notification on the same local day', async () => {
    storage.values.settings = { enableDailyCron: true, enableDailyNotifications: true }
    vi.mocked(Date.now).mockReturnValue(new Date(2026, 5, 20, 7, 0, 0).getTime())
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')
    const alarm = { name: 'daily-0700-crawl', scheduledTime: Date.now() }

    expectAlarmListener()(alarm)
    await vi.waitFor(() => {
      expect(chrome.notifications.create).toHaveBeenCalledTimes(1)
    })

    expectAlarmListener()(alarm)
    await vi.waitFor(() => {
      expect(chrome.alarms.create).toHaveBeenCalledTimes(2)
    })
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1)
  })

  it('does not notify after a manual crawl refresh', async () => {
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(sendWorkerMessage(listener, { type: 'CRAWL_ALL' })).resolves.toMatchObject({
      ok: true,
      newPostsWritten: 5,
    })
    expect(chrome.notifications.create).not.toHaveBeenCalled()
  })

  it('does not notify when daily notifications are disabled', async () => {
    storage.values.settings = { enableDailyCron: true, enableDailyNotifications: false }
    vi.mocked(Date.now).mockReturnValue(new Date(2026, 5, 20, 7, 0, 0).getTime())
    installFetchMock({
      'https://blog.example.com/': pageWithFeed,
      'https://blog.example.com/feed.xml': rss,
    })
    await addSourceRow('https://blog.example.com/')
    await import('../../src/background/index')

    expectAlarmListener()({ name: 'daily-0700-crawl', scheduledTime: Date.now() })

    await vi.waitFor(async () => {
      expect(await db.posts.count()).toBe(5)
    })
    expect(chrome.notifications.create).not.toHaveBeenCalled()
    expect(storage.values.lastDigestNotificationDate).toBeUndefined()
  })

  it('returns persisted settings with notification defaults and crawl status over typed messages', async () => {
    storage.values.settings = { enableDailyCron: false }
    storage.values.crawlInProgress = true
    await import('../../src/background/index')
    const listener = expectMessageListener()

    await expect(sendWorkerMessage(listener, { type: 'GET_SETTINGS' })).resolves.toEqual({
      ok: true,
      settings: { enableDailyCron: false, enableDailyNotifications: false },
    })
    await expect(sendWorkerMessage(listener, { type: 'GET_CRAWL_STATUS' })).resolves.toEqual({
      ok: true,
      crawlInProgress: true,
    })
  })
})

describe('background notifications', () => {
  it('creates a daily digest notification and persists same-day dedupe state', async () => {
    const { createDailyDigestNotification, LAST_DIGEST_NOTIFICATION_DATE_KEY } = await import(
      '../../src/background/notifications'
    )

    await createDailyDigestNotification({
      newPostCount: 3,
      digestCount: 5,
      dateKey: '2026-06-21',
    })

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'daily-digest-2026-06-21',
      {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'dev-corner digest',
        message: '3 new posts are ready in your 5-post digest.',
      },
      expect.any(Function),
    )
    expect(storage.values[LAST_DIGEST_NOTIFICATION_DATE_KEY]).toBe('2026-06-21')
  })

  it('opens the digest surface when a daily notification is clicked', async () => {
    const { registerNotificationClickHandler } = await import('../../src/background/notifications')

    registerNotificationClickHandler()
    const listener = notificationClickListeners[0]
    if (listener === undefined) throw new Error('Expected a notification click listener')
    listener('daily-digest-2026-06-21')

    await vi.waitFor(() => {
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://dev-corner/src/popup/index.html',
      })
    })
  })

  it('rejects when Chrome cannot create the notification', async () => {
    const { createDailyDigestNotification } = await import('../../src/background/notifications')
    Object.assign(chrome.runtime, { lastError: { message: 'Notifications are disabled' } })

    await expect(
      createDailyDigestNotification({
        newPostCount: 3,
        digestCount: 5,
        dateKey: '2026-06-21',
      }),
    ).rejects.toThrow('Notifications are disabled')
    expect(storage.values.lastDigestNotificationDate).toBeUndefined()

    delete (chrome.runtime as typeof chrome.runtime & { lastError?: chrome.runtime.LastError })
      .lastError
  })
})

async function addSourceRow(url: string): Promise<Source & { id: number }> {
  const id = await db.sources.add({ url, title: url, addedAt: Date.now() })
  return { id, url, title: url, addedAt: Date.now() }
}

function oldPost(crawlDay: string, id: number) {
  return {
    sourceId: id,
    sourceUrl: `https://old-${id}.example.com/`,
    title: `Old ${id}`,
    summary: `Old summary ${id}`,
    thumbnail: `https://old-${id}.example.com/thumb.jpg`,
    postUrl: `https://old-${id}.example.com/post`,
    publishedAt: Date.parse(`${crawlDay}T08:00:00Z`),
    crawledAt: Date.parse(`${crawlDay}T09:00:00Z`),
    crawlDay,
  }
}

function noMediaFeed(origin: string): string {
  const items = Array.from({ length: 5 }, (_value, index) => {
    const number = index + 1
    return `<item>
      <title>Post ${number}</title>
      <link>${origin}/post-${number}</link>
      <description>Summary ${number}</description>
      <pubDate>${20 - index} Jun 2026 09:00:00 GMT</pubDate>
    </item>`
  }).join('')
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`
}

function metadataPage(index: number): string {
  return `<!doctype html><html><head>
    <meta property="og:image" content="/images/post-${index}.jpg" />
  </head><body></body></html>`
}

function installFetchMock(responses: FetchMap): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input)
    const body = responses[url]
    if (body instanceof Error) throw body
    return httpResponse(body ?? '', url, body === undefined ? 404 : 200)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function httpResponse(body: BodyInit | null, url: string, status = 200): Response {
  const value = new Response(body, { status })
  Object.defineProperty(value, 'url', { value: url })
  return value
}

function installChromeMock(): MockStorageArea {
  const area: MockStorageArea = {
    values: {},
    get: vi.fn((key: string, callback: (items: Record<string, unknown>) => void) => {
      callback({ [key]: area.values[key] })
    }),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(area.values, items)
      callback?.()
    }),
    remove: vi.fn((key: string, callback?: () => void) => {
      delete area.values[key]
      callback?.()
    }),
  }
  messageListeners = []
  clickListeners = []
  startupListeners = []
  installedListeners = []
  alarmListeners = []
  notificationClickListeners = []
  permissions = {
    contains: vi.fn(
      (_request: chrome.permissions.Permissions, callback: (result: boolean) => void) => {
        callback(true)
      },
    ),
    request: vi.fn(
      (_request: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
        callback(true)
      },
    ),
    remove: vi.fn(
      (_request: chrome.permissions.Permissions, callback: (removed: boolean) => void) => {
        callback(true)
      },
    ),
  }

  vi.stubGlobal('chrome', {
    storage: { local: area },
    runtime: {
      onInstalled: listenerSlot(installedListeners),
      onStartup: listenerSlot(startupListeners),
      onMessage: listenerSlot(messageListeners),
      getURL: vi.fn((path: string) => `chrome-extension://dev-corner/${path}`),
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn((_name: string, callback?: (wasCleared: boolean) => void) => callback?.(true)),
      onAlarm: listenerSlot(alarmListeners),
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: listenerSlot(clickListeners),
    },
    notifications: {
      create: vi.fn(
        (
          _notificationId: string,
          _options: chrome.notifications.NotificationCreateOptions,
          callback?: (notificationId: string) => void,
        ) => callback?.(_notificationId),
      ),
      onClicked: listenerSlot(notificationClickListeners),
    },
    tabs: {
      create: vi.fn(),
    },
    action: {},
    permissions,
  })
  return area
}

function listenerSlot<T extends (...args: never[]) => unknown>(listeners: T[]): ListenerSlot<T> {
  return {
    listeners,
    addListener: (listener: T) => {
      listeners.push(listener)
    },
  }
}

function expectMessageListener(): MessageListener {
  const listener = messageListeners[0]
  if (listener === undefined) throw new Error('Expected a worker message listener')
  return listener
}

function expectClickListener(): ContextMenuClickListener {
  const listener = clickListeners[0]
  if (listener === undefined) throw new Error('Expected a context-menu click listener')
  return listener
}

function expectStartupListener(): () => void {
  const listener = startupListeners[0]
  if (listener === undefined) throw new Error('Expected a startup listener')
  return listener
}

function expectInstalledListener(): () => void {
  const listener = installedListeners[0]
  if (listener === undefined) throw new Error('Expected an installed listener')
  return listener
}

function expectAlarmListener(): (alarm: chrome.alarms.Alarm) => void {
  const listener = alarmListeners[0]
  if (listener === undefined) throw new Error('Expected an alarm listener')
  return listener
}

function sendWorkerMessage(
  listener: MessageListener,
  message: WorkerRequest,
): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    expect(listener(message, {} as chrome.runtime.MessageSender, resolve)).toBe(true)
  })
}
