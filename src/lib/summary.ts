// Turn raw feed description/summary HTML into clean preview text (F5).
// Side-effect-free; relies on DOMParser (provided by the worker at runtime and
// by jsdom in tests), never `document` (CON-004).

const MAX_LEN = 200

/**
 * Strip HTML, decode entities, collapse whitespace, and clamp to ~200 chars.
 * Truncation happens at a word boundary and appends an ellipsis.
 */
export function summarize(html: string | undefined, maxLen = MAX_LEN): string {
  if (!html) return ''

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()

  if (text.length <= maxLen) return text

  const clipped = text.slice(0, maxLen)
  const lastSpace = clipped.lastIndexOf(' ')
  const head = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped
  return `${head.trimEnd()}…`
}
