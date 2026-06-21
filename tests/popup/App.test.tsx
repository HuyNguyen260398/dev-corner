import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import type { WorkerRequest, WorkerResponse } from '../../src/lib/types'
import { App } from '../../src/popup/App'

const responses: Partial<Record<WorkerRequest['type'], WorkerResponse>> = {
  GET_SETTINGS: { ok: true, settings: { enableDailyCron: true } },
  GET_CRAWL_STATUS: { ok: true, crawlInProgress: false },
  CRAWL_ALL: { ok: true, sourcesCrawled: 0, postsWritten: 0, failures: [] },
  UPDATE_SETTINGS: { ok: true, settings: { enableDailyCron: false } },
}

beforeEach(async () => {
  await db.posts.clear()
  await db.sources.clear()
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
