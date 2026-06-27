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
    GET_SETTINGS: { ok: true, settings: { enableDailyCron: true, enableDailyNotifications: true } },
    GET_CRAWL_STATUS: { ok: true, crawlInProgress: false },
    CRAWL_ALL: { ok: true, sourcesCrawled: 0, postsWritten: 0, newPostsWritten: 0, failures: [] },
    UPDATE_SETTINGS: {
      ok: true,
      settings: { enableDailyCron: false, enableDailyNotifications: true },
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
        settings: { enableDailyNotifications: false },
      })
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
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeTruthy()
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

describe('App source permissions', () => {
  it('requests current-page permission in the popup before saving a source', async () => {
    const queryTabs = chrome.tabs.query as unknown as ReturnType<typeof vi.fn>
    queryTabs.mockResolvedValue([
      { url: 'https://new-source.test/post', title: 'New Source' } as chrome.tabs.Tab,
    ])

    render(<App />)

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

    const sourceItem = await screen.findByText('Source 1')
    const sourceRow = sourceItem.closest('li')
    expect(sourceRow).not.toBeNull()
    expect(within(sourceRow!).getByRole('button', { name: 'Unsubscribe Source 1' })).toBeTruthy()
  })

  it('shows the saved source URL under the source name', async () => {
    await db.sources.add(source(1))

    render(<App />)

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
