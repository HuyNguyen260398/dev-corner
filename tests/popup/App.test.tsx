import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import type { Post, Source, WorkerRequest, WorkerResponse } from '../../src/lib/types'
import { App } from '../../src/popup/App'

let responses: Partial<Record<WorkerRequest['type'], WorkerResponse>>

beforeEach(async () => {
  await db.posts.clear()
  await db.sources.clear()
  responses = {
    GET_SETTINGS: { ok: true, settings: { enableDailyCron: true } },
    GET_CRAWL_STATUS: { ok: true, crawlInProgress: false },
    CRAWL_ALL: { ok: true, sourcesCrawled: 0, postsWritten: 0, failures: [] },
    UPDATE_SETTINGS: { ok: true, settings: { enableDailyCron: false } },
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
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App scheduling controls', () => {
  it('sends manual refresh and persists the daily crawl toggle', async () => {
    render(<App />)

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CRAWL_STATUS' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
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
  })
})

describe('App digest preview', () => {
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

    expect((await screen.findByRole('status')).textContent).toBe('Refreshing latest posts...')
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
