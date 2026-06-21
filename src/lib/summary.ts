// Turn raw feed description/summary HTML into clean preview text (F5).
// Side-effect-free; uses a bundled DOMParser-compatible parser, never `document`
// (CON-004).

import { parseMarkup } from './dom'

const MAX_LEN = 200

/**
 * Strip HTML, decode entities, collapse whitespace, and clamp to ~200 chars.
 * Truncation happens at a word boundary and appends an ellipsis.
 */
export function summarize(html: string | undefined, maxLen = MAX_LEN): string {
  if (!html) return ''

  const doc = parseMarkup(html, 'text/html')
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()

  if (text.length <= maxLen) return text

  const clipped = text.slice(0, maxLen)
  const lastSpace = clipped.lastIndexOf(' ')
  const head = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped
  return `${head.trimEnd()}…`
}
