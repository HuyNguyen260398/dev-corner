import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crawlAll, crawlSource, CRAWL_QUEUE_KEY } from '../../src/background/crawl'
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
      thumbnail: 'https://example.com/thumb-1.jpg',
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

    expect(fetchMock).toHaveBeenCalledWith('https://blog.example.com/post-with-og-image')
    await expect(db.posts.toArray()).resolves.toMatchObject([
      {
        title: 'Feed post without media',
        summary: 'Feed summary without an image.',
        thumbnail: 'https://blog.example.com/covers/post-with-og-image.png',
        postUrl: 'https://blog.example.com/post-with-og-image',
      },
    ])
  })

  it('uses an AWS image fallback for AWS Blogs posts with no crawled thumbnail', async () => {
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
        thumbnail: 'https://a0.awsstatic.com/libra-css/images/site/touch-icon-ipad-144-smile.png',
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

    expect(fetchMock).not.toHaveBeenCalledWith('https://feeds.example.net/rss.xml')
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

  it('skips fetches and marks the source when origin permission is missing', async () => {
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

    expect(result).toEqual({ ok: true, sourceId: source.id, postsWritten: 0, newPostsWritten: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(db.sources.get(source.id)).resolves.toMatchObject({
      permissionState: 'needsPermission',
    })
  })
})

describe('crawlAll', () => {
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
      settings: { enableDailyCron: false, enableDailyNotifications: true },
    })
    expect(chrome.alarms.clear).toHaveBeenCalledWith('daily-0700-crawl', expect.any(Function))
  })

  it('crawls and reschedules when the daily alarm fires', async () => {
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

  it('does not create a second daily notification on the same local day', async () => {
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
      settings: { enableDailyCron: false, enableDailyNotifications: true },
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

function installFetchMock(responses: FetchMap): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input)
    const response = responses[url]
    if (response instanceof Error) throw response
    return {
      ok: response !== undefined,
      status: response === undefined ? 404 : 200,
      text: async () => response ?? '',
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
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
