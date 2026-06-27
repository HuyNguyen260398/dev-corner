import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../../src/lib/types'

type RuntimeListener = (
  message: WorkerRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: WorkerResponse) => void,
) => boolean | undefined

let listener: RuntimeListener

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('chrome', chromeStub())
  await import('../../src/background/index')
  const addListener = chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>
  listener = addListener.mock.calls[0]?.[0] as RuntimeListener
  const { db } = await import('../../src/lib/db')
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
  await db.sources.add({ id: 1, url: 'https://source.test', title: 'Source', addedAt: 1 })
  await db.posts.add({
    id: 1,
    sourceId: 1,
    sourceUrl: 'https://source.test',
    title: 'Post',
    summary: 'Summary',
    postUrl: 'https://source.test/post',
    crawledAt: 1,
    crawlDay: '2026-06-27',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('favorite worker messages', () => {
  it('adds and removes a favorite through the runtime listener', async () => {
    const addResponse = vi.fn<(response: WorkerResponse) => void>()
    expect(listener({ type: 'ADD_FAVORITE', postId: 1 }, {}, addResponse)).toBe(true)
    await vi.waitFor(() =>
      expect(addResponse).toHaveBeenCalledWith({
        ok: true,
        favoriteId: expect.any(Number),
      }),
    )

    const removeResponse = vi.fn<(response: WorkerResponse) => void>()
    expect(
      listener(
        { type: 'REMOVE_FAVORITE', postUrl: 'https://source.test/post' },
        {},
        removeResponse,
      ),
    ).toBe(true)
    await vi.waitFor(() => expect(removeResponse).toHaveBeenCalledWith({ ok: true }))
  })

  it('returns a standard error response when the post is missing', async () => {
    const sendResponse = vi.fn<(response: WorkerResponse) => void>()
    listener({ type: 'ADD_FAVORITE', postId: 999 }, {}, sendResponse)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: 'Post 999 is no longer available.',
      }),
    )
  })
})

function chromeStub(): typeof chrome {
  const event = { addListener: vi.fn() }
  return {
    runtime: {
      onInstalled: event,
      onStartup: event,
      onMessage: { addListener: vi.fn() },
    },
    contextMenus: { create: vi.fn(), onClicked: event },
    alarms: { onAlarm: event },
    notifications: { onClicked: event },
  } as unknown as typeof chrome
}
