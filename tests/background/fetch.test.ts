import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchText,
  MAX_MARKUP_BYTES,
  REQUEST_TIMEOUT_MS,
} from '../../src/background/fetch'

let containsPermission: ReturnType<typeof vi.fn>

beforeEach(() => {
  containsPermission = vi.fn(
    (_request: chrome.permissions.Permissions, callback: (result: boolean) => void) => {
      callback(true)
    },
  )
  vi.stubGlobal('chrome', {
    permissions: {
      contains: containsPermission,
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchText', () => {
  it('rejects a declared body length above the markup limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response('small', 'https://source.test/feed', {
          'content-length': String(MAX_MARKUP_BYTES + 1),
        }),
      ),
    )

    await expect(fetchText('https://source.test/feed')).rejects.toThrow(
      'Response exceeded 2097152 bytes for https://source.test/feed',
    )
  })

  it('rejects a streamed body after it crosses the markup limit', async () => {
    const chunk = new Uint8Array(MAX_MARKUP_BYTES / 2 + 1)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => response(body, 'https://source.test/feed')))

    await expect(fetchText('https://source.test/feed')).rejects.toThrow(
      'Response exceeded 2097152 bytes for https://source.test/feed',
    )
  })

  it('returns text and the final URL when its origin remains permitted', async () => {
    const fetchMock = vi.fn(async () => response('feed body', 'https://source.test/final'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchText('https://source.test/feed')).resolves.toEqual({
      url: 'https://source.test/final',
      text: 'feed body',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://source.test/feed',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects a redirect to an origin without permission', async () => {
    containsPermission.mockImplementation(
      (request: chrome.permissions.Permissions, callback: (result: boolean) => void) => {
        callback(request.origins?.[0] === 'https://source.test/*')
      },
    )
    vi.stubGlobal('fetch', vi.fn(async () => response('feed body', 'https://other.test/feed')))

    await expect(fetchText('https://source.test/feed')).rejects.toThrow(
      'Redirected to an origin without permission: https://other.test/feed',
    )
  })

  it('rejects an HTTPS redirect downgrade even when both origins are permitted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('feed body', 'http://source.test/feed')))

    await expect(fetchText('https://source.test/feed')).rejects.toThrow(
      'Refused HTTPS downgrade: http://source.test/feed',
    )
  })

  it('reports HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('unavailable', 'https://source.test/feed', undefined, 503)),
    )

    await expect(fetchText('https://source.test/feed')).rejects.toThrow(
      'Fetch failed for https://source.test/feed: HTTP 503',
    )
  })

  it('aborts a request after the request deadline', async () => {
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    const fetchMock = vi.fn(
      (_input: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = fetchText('https://source.test/feed')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    timeout.abort()

    await expect(request).rejects.toThrow(
      `Fetch timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds for https://source.test/feed`,
    )
  })
})

function response(
  body: BodyInit | null,
  url: string,
  headers?: HeadersInit,
  status = 200,
): Response {
  const value = new Response(body, {
    status,
    ...(headers !== undefined ? { headers } : {}),
  })
  Object.defineProperty(value, 'url', { value: url })
  return value
}
