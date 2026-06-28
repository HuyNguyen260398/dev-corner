import { describe, it, expect } from 'vitest'
import {
  resolveThumbnail,
  firstImageSrc,
  PLACEHOLDER_THUMBNAIL,
  renderableThumbnail,
  resolveRenderableThumbnail,
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

describe('renderableThumbnail', () => {
  it('allows HTTPS images from the saved source origin', () => {
    expect(
      renderableThumbnail('https://blog.test/images/post.webp', 'https://blog.test/feed'),
    ).toBe('https://blog.test/images/post.webp')
  })

  it.each([
    'https://cdn.test/post.webp',
    'http://blog.test/post.webp',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
  ])('replaces disallowed thumbnail %s', (thumbnail) => {
    expect(renderableThumbnail(thumbnail, 'https://blog.test')).toBe(PLACEHOLDER_THUMBNAIL)
  })

  it('keeps the packaged placeholder', () => {
    expect(renderableThumbnail(PLACEHOLDER_THUMBNAIL, 'https://blog.test')).toBe(
      PLACEHOLDER_THUMBNAIL,
    )
  })
})

describe('resolveRenderableThumbnail', () => {
  it('skips disallowed candidates and returns the next same-origin image', () => {
    expect(
      resolveRenderableThumbnail(
        {
          ogImage: 'https://cdn.test/remote-cover.jpg',
          contentHtml: '<img src="/images/local-cover.jpg">',
          baseUrl: 'https://blog.test/posts/example',
        },
        'https://blog.test',
      ),
    ).toBe('https://blog.test/images/local-cover.jpg')
  })

  it('returns the placeholder when every candidate is disallowed', () => {
    expect(
      resolveRenderableThumbnail(
        {
          feedMedia: 'https://cdn.test/feed-cover.jpg',
          contentHtml: '<img src="http://blog.test/insecure.jpg">',
        },
        'https://blog.test',
      ),
    ).toBe(PLACEHOLDER_THUMBNAIL)
  })
})
