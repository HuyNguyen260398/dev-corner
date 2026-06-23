import { describe, it, expect } from 'vitest'
import {
  resolveThumbnail,
  firstImageSrc,
  PLACEHOLDER_THUMBNAIL,
} from '../../src/lib/thumbnail'

describe('firstImageSrc', () => {
  it('returns the src of the first <img> in content HTML', () => {
    const html = '<p>hi</p><img src="https://x.test/a.png"><img src="https://x.test/b.png">'
    expect(firstImageSrc(html)).toBe('https://x.test/a.png')
  })

  it('recognizes common lazy image attributes and srcset candidates', () => {
    expect(firstImageSrc('<img data-src="https://x.test/lazy.png">')).toBe(
      'https://x.test/lazy.png',
    )
    expect(firstImageSrc('<img srcset="https://x.test/small.png 1x, https://x.test/big.png 2x">'))
      .toBe('https://x.test/small.png')
  })

  it('returns undefined when there is no image', () => {
    expect(firstImageSrc('<p>no images here</p>')).toBeUndefined()
    expect(firstImageSrc('')).toBeUndefined()
  })
})

describe('resolveThumbnail fallback chain', () => {
  it('prefers feed media when present', () => {
    expect(
      resolveThumbnail({
        feedMedia: 'https://x.test/feed.jpg',
        ogImage: 'https://x.test/og.jpg',
        contentHtml: '<img src="https://x.test/content.jpg">',
      }),
    ).toBe('https://x.test/feed.jpg')
  })

  it('falls back to og:image when feed media is absent', () => {
    expect(
      resolveThumbnail({
        ogImage: 'https://x.test/og.jpg',
        contentHtml: '<img src="https://x.test/content.jpg">',
      }),
    ).toBe('https://x.test/og.jpg')
  })

  it('falls back to the first content image when feed media and og:image are absent', () => {
    expect(
      resolveThumbnail({
        contentHtml: '<p>x</p><img src="https://x.test/content.jpg">',
      }),
    ).toBe('https://x.test/content.jpg')
  })

  it('falls back to the placeholder when nothing is available', () => {
    expect(resolveThumbnail({})).toBe(PLACEHOLDER_THUMBNAIL)
    expect(resolveThumbnail({ contentHtml: '<p>no image</p>' })).toBe(PLACEHOLDER_THUMBNAIL)
  })

  it('treats empty-string candidates as absent', () => {
    expect(
      resolveThumbnail({ feedMedia: '', ogImage: '', contentHtml: '' }),
    ).toBe(PLACEHOLDER_THUMBNAIL)
  })

  it('resolves relative thumbnail candidates against the post URL', () => {
    expect(
      resolveThumbnail({
        contentHtml: '<img src="/content.jpg">',
        baseUrl: 'https://x.test/posts/a',
      }),
    ).toBe('https://x.test/content.jpg')
  })
})
