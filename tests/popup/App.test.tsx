import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import type { Post, Source, WorkerRequest, WorkerResponse } from '../../src/lib/types'
import { App } from '../../src/popup/App'

let responses: Partial<Record<WorkerRequest['type'], WorkerResponse>>

beforeEach(async () => {
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
  responses = {
    GET_SETTINGS: { ok: true, settings: { enableDailyCron: true, enableDailyNotifications: false } },
    GET_CRAWL_STATUS: { ok: true, crawlInProgress: false },
    CRAWL_ALL: { ok: true, sourcesCrawled: 0, postsWritten: 0, newPostsWritten: 0, failures: [] },
    UPDATE_SETTINGS: {
      ok: true,
      settings: { enableDailyCron: false, enableDailyNotifications: false },
    },
  }
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn((request: WorkerRequest) =>
        Promise.resolve(
          responses[request.type] ?? {
            ok: false,
            error: `Unhandled ${request.type}`,
          },
        ),
      ),
    },
    tabs: {
      query: vi.fn(),
    },
    permissions: {
      request: vi.fn(
        (_permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
          callback(true)
        },
      ),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App scheduling controls', () => {
  it('sends manual refresh and persists the daily crawl and notification toggles', async () => {
    render(<App />)

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CRAWL_STATUS' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh digest' }))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CRAWL_ALL' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))
    expect(screen.getByRole('checkbox', { name: 'Daily notifications' })).toHaveProperty(
      'checked',
      false,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Daily 07:00 crawl' }))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'UPDATE_SETTINGS',
        settings: { enableDailyCron: false },
      })
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Daily notifications' }))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'UPDATE_SETTINGS',
        settings: { enableDailyNotifications: true },
      })
    })
  })

  it('clears refresh progress and reports a rejected crawl message', async () => {
    let rejectCrawl!: (reason: unknown) => void
    const pendingCrawl = new Promise<WorkerResponse>((_resolve, reject) => {
      rejectCrawl = reject
    })
    const sendMessage = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>
    sendMessage.mockImplementation((request: WorkerRequest) =>
      request.type === 'CRAWL_ALL'
        ? pendingCrawl
        : Promise.resolve(
            responses[request.type] ?? { ok: false, error: `Unhandled ${request.type}` },
          ),
    )

    render(<App />)
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CRAWL_STATUS' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh digest' }))
    expect(await screen.findByText('Refreshing latest posts...')).toBeTruthy()

    rejectCrawl(new Error('Service worker disconnected.'))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Service worker disconnected.',
    )
    await waitFor(() => {
      expect(screen.queryByText('Refreshing latest posts...')).toBeNull()
      expect(screen.getByRole('button', { name: 'Refresh digest' })).toHaveProperty(
        'disabled',
        false,
      )
    })
  })
})

describe('App digest preview', () => {
  it('renders the dark morning brief shell with primary actions and local status', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Morning brief' })).toBeTruthy()
    expect(screen.getByText('Daily digest')).toBeTruthy()
    expect(screen.getAllByText('Morning brief')).toHaveLength(1)
    expect(screen.getByText('Local only')).toBeTruthy()
    expect(screen.getByText('07:00 crawl')).toBeTruthy()
    expect(screen.getByText('5 min read')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sources' })).toBeTruthy()
  })

  it("renders today's selected 5-post digest with thumbnails, summaries, and post links", async () => {
    vi.setSystemTime(new Date('2026-06-20T10:15:00+07:00'))
    await db.sources.bulkAdd(sources(6))
    await db.posts.bulkAdd([
      digestPost(1, '2026-06-20'),
      digestPost(2, '2026-06-20'),
      digestPost(3, '2026-06-20'),
      digestPost(4, '2026-06-20'),
      digestPost(5, '2026-06-20'),
      digestPost(6, '2026-06-20'),
      digestPost(7, '2026-06-19'),
    ])

    render(<App />)

    const digest = await screen.findByRole('list', { name: "Today's digest" })
    const items = within(digest).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(screen.queryByText('5 posts from your saved sources')).toBeNull()
    expect(screen.queryByText('Post 7')).toBeNull()
    for (const item of items) {
      expect(within(item).getByRole('img').getAttribute('src')).toBeTruthy()
      const link = within(item).getByRole('link')
      expect(link.getAttribute('href')).toMatch(/^https:\/\/post-\d\.test\//)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(within(item).getByText(/^Summary \d$/)).toBeTruthy()
    }

    const navigation = screen.getByRole('navigation', { name: 'Main views' })
    expect(within(navigation).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Daily Posts' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      screen.getByRole('button', { name: 'Add Post 1 to favorites' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('shows an empty state when no sources have been saved', async () => {
    render(<App />)

    expect(await screen.findByText('No sources saved yet.')).toBeTruthy()
  })

  it('shows crawl progress while a refresh is running', async () => {
    responses.GET_CRAWL_STATUS = { ok: true, crawlInProgress: true }

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Refreshing latest posts...')
    })
    expect(screen.getByRole('progressbar', { name: 'Refreshing latest posts progress' })).toBeTruthy()
  })

  it('surfaces source errors when every saved source failed and no posts are available', async () => {
    await db.sources.bulkAdd([
      source(1, { lastError: 'network down' }),
      source(2, { lastError: 'HTTP 500' }),
    ])

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('All sources failed to crawl.')
    expect(alert.textContent).toContain('network down')
    expect(alert.textContent).toContain('HTTP 500')
  })
})

describe('App favorite tabs', () => {
  it('opens Daily Posts and shows favorite membership for a daily post', async () => {
    vi.setSystemTime(new Date('2026-06-27T10:00:00+07:00'))
    await db.sources.add(source(1))
    await db.posts.add(digestPost(1, '2026-06-27'))
    await db.favoritePosts.add(favoritePost())

    render(<App />)

    expect(
      (await screen.findByRole('button', { name: 'Daily Posts' })).getAttribute('aria-current'),
    ).toBe('page')
    expect(
      (
        await screen.findByRole('button', { name: 'Remove Post 1 from favorites' })
      ).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('shows persisted favorite snapshots in Favorite Posts', async () => {
    await db.favoritePosts.add(favoritePost())

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Favorite Posts' }))

    expect(await screen.findByRole('link', { name: 'Post 1' })).toBeTruthy()
    expect(screen.queryByText('No favorite posts yet.')).toBeNull()
  })

  it('shows guidance when Favorite Posts is empty', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Favorite Posts' }))

    expect(await screen.findByText('No favorite posts yet.')).toBeTruthy()
    expect(screen.getByText('Add favorites from Daily Posts to keep them here.')).toBeTruthy()
  })

  it('sends exact typed add and remove favorite requests', async () => {
    vi.setSystemTime(new Date('2026-06-27T10:00:00+07:00'))
    responses.ADD_FAVORITE = { ok: true, favoriteId: 1 }
    responses.REMOVE_FAVORITE = { ok: true }
    await db.sources.add(source(1))
    await db.posts.add(digestPost(1, '2026-06-27'))

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add Post 1 to favorites' }))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'ADD_FAVORITE',
        postId: 1,
      })
    })

    await db.favoritePosts.add(favoritePost())
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Post 1 from favorites' }))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'REMOVE_FAVORITE',
        postUrl: 'https://post-1.test/',
      })
    })
  })

  it("disables only the pending post's favorite button", async () => {
    vi.setSystemTime(new Date('2026-06-27T10:00:00+07:00'))
    await db.sources.bulkAdd(sources(2))
    await db.posts.bulkAdd([digestPost(1, '2026-06-27'), digestPost(2, '2026-06-27')])
    let resolveAdd!: (response: WorkerResponse) => void
    const pendingAdd = new Promise<WorkerResponse>((resolve) => {
      resolveAdd = resolve
    })
    const sendMessage = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>
    sendMessage.mockImplementation((request: WorkerRequest) =>
      request.type === 'ADD_FAVORITE'
        ? pendingAdd
        : Promise.resolve(
            responses[request.type] ?? { ok: false, error: `Unhandled ${request.type}` },
          ),
    )

    render(<App />)

    const first = await screen.findByRole('button', { name: 'Add Post 1 to favorites' })
    const second = screen.getByRole('button', { name: 'Add Post 2 to favorites' })
    fireEvent.click(first)
    await waitFor(() => expect(first).toHaveProperty('disabled', true))
    expect(second).toHaveProperty('disabled', false)

    resolveAdd({ ok: true, favoriteId: 1 })
    await waitFor(() => expect(first).toHaveProperty('disabled', false))
  })

  it('keeps the post visible and reports a failed favorite request', async () => {
    vi.setSystemTime(new Date('2026-06-27T10:00:00+07:00'))
    responses.ADD_FAVORITE = { ok: false, error: 'Favorite write failed.' }
    await db.sources.add(source(1))
    await db.posts.add(digestPost(1, '2026-06-27'))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Post 1 to favorites' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Favorite write failed.',
    )
    expect(screen.getByRole('link', { name: 'Post 1' })).toBeTruthy()
  })
})

describe('App tab ownership', () => {
  it('selects Daily Posts on every fresh mount', async () => {
    const firstRender = render(<App />)
    expect(
      (await screen.findByRole('button', { name: 'Daily Posts' })).getAttribute('aria-current'),
    ).toBe('page')

    fireEvent.click(screen.getByRole('button', { name: 'Favorite Posts' }))
    expect(screen.getByRole('button', { name: 'Favorite Posts' }).getAttribute('aria-current')).toBe(
      'page',
    )
    firstRender.unmount()

    render(<App />)
    expect(screen.getByRole('button', { name: 'Daily Posts' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('keeps source and automation controls under Sources only', async () => {
    await db.sources.add(
      source(1, {
        permissionState: 'needsPermission',
        lastCrawledAt: Date.parse('2026-06-27T09:00:00Z'),
      }),
    )

    render(<App />)
    await screen.findByRole('heading', { name: 'Morning brief' })

    expect(screen.queryByRole('checkbox', { name: 'Daily 07:00 crawl' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Daily notifications' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull()
    expect(screen.queryByText('https://source-1.test')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Grant permission' })).toBeNull()
    expect(screen.queryByText(/Last crawl/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))

    expect(await screen.findByRole('checkbox', { name: 'Daily 07:00 crawl' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Daily notifications' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeTruthy()
    expect(screen.getByText('https://source-1.test')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grant permission' })).toBeTruthy()
    expect(screen.getByText(/Last crawl/)).toBeTruthy()
  })
})

describe('App source permissions', () => {
  it('requests current-page permission in the popup before saving a source', async () => {
    const queryTabs = chrome.tabs.query as unknown as ReturnType<typeof vi.fn>
    queryTabs.mockResolvedValue([
      { url: 'https://new-source.test/post', title: 'New Source' } as chrome.tabs.Tab,
    ])

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe' }))

    await waitFor(() => {
      expect(chrome.permissions.request).toHaveBeenCalledWith(
        { origins: ['https://new-source.test/*'] },
        expect.any(Function),
      )
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SAVE_SOURCE',
        url: 'https://new-source.test/post',
        title: 'New Source',
        permissionGranted: true,
      })
    })
  })

  it('requests denied source permission in the popup gesture before notifying the worker', async () => {
    await db.sources.add(source(1, { permissionState: 'needsPermission' }))
    responses.REQUEST_SOURCE_PERMISSION = {
      ok: true,
      permissionGranted: true,
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))

    const sourceItem = await screen.findByText('Source 1')
    const sourceRow = sourceItem.closest('li')
    expect(sourceRow).not.toBeNull()
    expect(within(sourceRow!).getByText('Needs permission')).toBeTruthy()

    fireEvent.click(within(sourceRow!).getByRole('button', { name: 'Grant permission' }))

    await waitFor(() => {
      expect(chrome.permissions.request).toHaveBeenCalledWith(
        { origins: ['https://source-1.test/*'] },
        expect.any(Function),
      )
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_SOURCE_PERMISSION',
        sourceId: 1,
        permissionGranted: true,
      })
    })
  })

  it('labels source removal as unsubscribe instead of delete', async () => {
    await db.sources.add(source(1))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))

    const sourceItem = await screen.findByText('Source 1')
    const sourceRow = sourceItem.closest('li')
    expect(sourceRow).not.toBeNull()
    expect(within(sourceRow!).getByRole('button', { name: 'Unsubscribe Source 1' })).toBeTruthy()
  })

  it('shows the saved source URL under the source name', async () => {
    await db.sources.add(source(1))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sources' }))

    const sourceItem = await screen.findByText('Source 1')
    const sourceRow = sourceItem.closest('li')
    expect(sourceRow).not.toBeNull()
    expect(within(sourceRow!).getByText('https://source-1.test')).toBeTruthy()
  })
})

function sources(count: number): Source[] {
  return Array.from({ length: count }, (_value, index) => source(index + 1))
}

function source(id: number, overrides: Partial<Source> = {}): Source {
  return {
    id,
    url: `https://source-${id}.test`,
    title: `Source ${id}`,
    addedAt: id,
    ...overrides,
  }
}

function digestPost(id: number, crawlDay: string): Post {
  return {
    id,
    sourceId: id,
    sourceUrl: `https://source-${id}.test`,
    title: `Post ${id}`,
    summary: `Summary ${id}`,
    thumbnail: `https://post-${id}.test/thumb.jpg`,
    postUrl: `https://post-${id}.test/`,
    publishedAt: Date.parse(`${crawlDay}T0${id}:00:00Z`),
    crawledAt: Date.parse(`${crawlDay}T09:00:00Z`),
    crawlDay,
  }
}

function favoritePost() {
  return {
    postUrl: 'https://post-1.test/',
    title: 'Post 1',
    summary: 'Summary 1',
    thumbnail: 'https://post-1.test/thumb.jpg',
    sourceUrl: 'https://source-1.test',
    sourceTitle: 'Source 1',
    publishedAt: Date.parse('2026-06-20T01:00:00Z'),
    crawledAt: Date.parse('2026-06-20T09:00:00Z'),
    favoritedAt: Date.parse('2026-06-20T10:00:00Z'),
  }
}
