import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseFeed, discoverFeedUrl, feedProbeUrls } from '../../src/lib/feed'
import { PLACEHOLDER_THUMBNAIL } from '../../src/lib/thumbnail'

// vitest runs from the project root; read fixtures relative to it.
const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')

describe('discoverFeedUrl', () => {
  it('returns the first <link rel="alternate"> feed, resolved against the base URL', () => {
    const html = fixture('page-with-feed-link.html')
    expect(discoverFeedUrl(html, 'https://blog.example.com/')).toBe(
      'https://blog.example.com/feed.xml',
    )
  })

  it('returns undefined when the page declares no feed', () => {
    const html = fixture('page-no-feed.html')
    expect(discoverFeedUrl(html, 'https://blog.example.com/')).toBeUndefined()
  })
})

describe('feedProbeUrls', () => {
  it('resolves the common feed paths against the base URL', () => {
    const urls = feedProbeUrls('https://blog.example.com/')
    expect(urls).toEqual([
      'https://blog.example.com/feed',
      'https://blog.example.com/rss',
      'https://blog.example.com/rss.xml',
      'https://blog.example.com/atom.xml',
      'https://blog.example.com/feed.xml',
      'https://blog.example.com/index.xml',
    ])
  })
})

describe('parseFeed — RSS 2.0', () => {
  const entries = parseFeed(fixture('rss-2.0.xml'))

  it('caps at the newest 5 entries', () => {
    expect(entries).toHaveLength(5)
    expect(entries.map((e) => e.title)).not.toContain('Post Six')
  })

  it('maps title, postUrl, and a stripped summary', () => {
    expect(entries[0]).toMatchObject({
      title: 'Post One',
      postUrl: 'https://example.com/post-1',
    })
    expect(entries[0]?.summary).toContain('First post body with HTML')
    expect(entries[0]?.summary).not.toContain('<strong>')
  })

  it('parses pubDate into an epoch-ms timestamp', () => {
    expect(entries[0]?.publishedAt).toBe(Date.parse('Fri, 20 Jun 2026 09:00:00 GMT'))
  })

  it('orders entries newest-first by publishedAt', () => {
    const times = entries.map((e) => e.publishedAt ?? 0)
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('resolves thumbnails through each rung of the chain', () => {
    expect(entries[0]?.thumbnail).toBe('https://example.com/thumb-1.jpg') // media:thumbnail
    expect(entries[1]?.thumbnail).toBe('https://example.com/media-2.jpg') // media:content
    expect(entries[2]?.thumbnail).toBe('https://example.com/enclosure-3.jpg') // enclosure
    expect(entries[3]?.thumbnail).toBe('https://example.com/content-4.png') // content <img>
    expect(entries[4]?.thumbnail).toBe(PLACEHOLDER_THUMBNAIL) // nothing -> placeholder
  })

  it('uses a relative lazy image from content:encoded when description has no image', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Content Image</title>
            <link>https://blog.example.com/posts/content-image</link>
            <description><![CDATA[<p>Excerpt without an image.</p>]]></description>
            <content:encoded><![CDATA[
              <figure>
                <img data-src="/assets/content-image.jpg" alt="Content image" />
              </figure>
            ]]></content:encoded>
          </item>
        </channel>
      </rss>`

    const [entry] = parseFeed(xml)

    expect(entry?.summary).toBe('Excerpt without an image.')
    expect(entry?.thumbnail).toBe('https://blog.example.com/assets/content-image.jpg')
  })
})

describe('parseFeed — Atom', () => {
  const entries = parseFeed(fixture('atom.xml'))

  it('reads all entries', () => {
    expect(entries).toHaveLength(3)
  })

  it('maps title and the alternate link as postUrl', () => {
    expect(entries[0]).toMatchObject({
      title: 'Atom Post One',
      postUrl: 'https://atom.example.com/a1',
    })
  })

  it('uses published or updated for the timestamp', () => {
    expect(entries[0]?.publishedAt).toBe(Date.parse('2026-06-20T08:00:00Z'))
    expect(entries[1]?.publishedAt).toBe(Date.parse('2026-06-19T08:00:00Z'))
  })

  it('falls back to a link without rel when no alternate is present', () => {
    expect(entries[2]?.postUrl).toBe('https://atom.example.com/a3')
  })

  it('resolves thumbnails from media and content', () => {
    expect(entries[0]?.thumbnail).toBe('https://atom.example.com/thumb-a1.jpg')
    expect(entries[1]?.thumbnail).toBe('https://atom.example.com/content-a2.png')
    expect(entries[2]?.thumbnail).toBe(PLACEHOLDER_THUMBNAIL)
  })
})

describe('parseFeed — missing fields', () => {
  const entries = parseFeed(fixture('feed-missing-fields.xml'))

  it('skips entries that have no link (postUrl is required and unique)', () => {
    expect(entries.map((e) => e.postUrl)).not.toContain('')
    expect(entries).toHaveLength(2)
  })

  it('defaults a missing title to "Untitled"', () => {
    const noTitle = entries.find((e) => e.postUrl === 'https://sparse.example.com/no-title')
    expect(noTitle?.title).toBe('Untitled')
  })

  it('leaves publishedAt undefined for an unparseable date', () => {
    const badDate = entries.find((e) => e.postUrl === 'https://sparse.example.com/no-desc')
    expect(badDate?.publishedAt).toBeUndefined()
  })
})

describe('parseFeed — ordering robustness', () => {
  it('sorts out-of-order entries newest-first', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Older</title><link>https://x.test/old</link>
          <pubDate>Mon, 16 Jun 2026 09:00:00 GMT</pubDate></item>
        <item><title>Newer</title><link>https://x.test/new</link>
          <pubDate>Fri, 20 Jun 2026 09:00:00 GMT</pubDate></item>
      </channel></rss>`
    expect(parseFeed(xml).map((e) => e.title)).toEqual(['Newer', 'Older'])
  })
})
