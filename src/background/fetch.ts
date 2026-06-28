import { hasSourcePermission } from './permissions'

export const MAX_MARKUP_BYTES = 2 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 10_000
export const SOURCE_TIMEOUT_MS = 30_000

export interface FetchTextResult {
  url: string
  text: string
}

export async function fetchText(
  url: string,
  sourceSignal?: AbortSignal,
): Promise<FetchTextResult> {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = combineSignals(timeoutSignal, sourceSignal)

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`)

    const finalUrl = response.url || url
    if (new URL(url).protocol === 'https:' && new URL(finalUrl).protocol !== 'https:') {
      throw new Error(`Refused HTTPS downgrade: ${finalUrl}`)
    }
    if (!(await hasSourcePermission(finalUrl))) {
      throw new Error(`Redirected to an origin without permission: ${finalUrl}`)
    }

    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_MARKUP_BYTES) {
      throw new Error(`Response exceeded ${MAX_MARKUP_BYTES} bytes for ${url}`)
    }

    return { url: finalUrl, text: await readText(response, url) }
  } catch (error) {
    if (sourceSignal?.aborted === true) {
      throw new Error(`Source crawl timed out after ${SOURCE_TIMEOUT_MS / 1000} seconds for ${url}`, {
        cause: error,
      })
    }
    if (timeoutSignal.aborted) {
      throw new Error(`Fetch timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds for ${url}`, {
        cause: error,
      })
    }
    throw error
  }
}

function combineSignals(first: AbortSignal, second: AbortSignal | undefined): AbortSignal {
  if (second === undefined) return first
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (first.aborted || second.aborted) abort()
  first.addEventListener('abort', abort, { once: true })
  second.addEventListener('abort', abort, { once: true })
  return controller.signal
}

async function readText(response: Response, url: string): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    assertWithinLimit(bytes.byteLength, url)
    return new TextDecoder().decode(bytes)
  }

  const decoder = new TextDecoder()
  const chunks: string[] = []
  let total = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    total += result.value.byteLength
    assertWithinLimit(total, url)
    chunks.push(decoder.decode(result.value, { stream: true }))
  }
  chunks.push(decoder.decode())
  return chunks.join('')
}

function assertWithinLimit(bytes: number, url: string): void {
  if (bytes > MAX_MARKUP_BYTES) {
    throw new Error(`Response exceeded ${MAX_MARKUP_BYTES} bytes for ${url}`)
  }
}
