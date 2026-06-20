import { describe, it, expect } from 'vitest'
import { summarize } from '../../src/lib/summary'

describe('summarize', () => {
  it('strips HTML tags, leaving text content', () => {
    expect(summarize('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('collapses runs of whitespace and trims', () => {
    expect(summarize('  a\n\n  b\t c  ')).toBe('a b c')
  })

  it('decodes HTML entities', () => {
    expect(summarize('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3')
  })

  it('returns empty string for empty or undefined input', () => {
    expect(summarize('')).toBe('')
    expect(summarize(undefined)).toBe('')
  })

  it('leaves short text unchanged with no ellipsis', () => {
    const text = 'A short summary.'
    expect(summarize(text)).toBe(text)
  })

  it('clamps long text to ~200 chars and appends an ellipsis', () => {
    const long = 'word '.repeat(100).trim() // 499 chars
    const out = summarize(long)
    expect(out.length).toBeLessThanOrEqual(201) // 200 + ellipsis char
    expect(out.endsWith('…')).toBe(true)
  })

  it('truncates at a word boundary rather than mid-word', () => {
    const long = `${'x'.repeat(190)} alpha bravo charlie delta echo foxtrot`
    const out = summarize(long)
    expect(out.endsWith('…')).toBe(true)
    // The head (everything before the ellipsis) must be a clean prefix of the
    // source that stops exactly where a space begins — never inside a word.
    const head = out.slice(0, -1)
    expect(long.startsWith(head)).toBe(true)
    expect(long[head.length]).toBe(' ')
  })
})
