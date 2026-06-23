// Thumbnail resolution (F5). Fallback chain per DEVELOPMENT_PLAN §3:
//   feed media → og:image → first content <img> → placeholder asset.
// Side-effect-free; uses a bundled DOMParser-compatible parser, never `document`
// (CON-004).

import { parseMarkup } from './dom'

/** Bundled placeholder shown when a post yields no usable image. */
export const PLACEHOLDER_THUMBNAIL = '/placeholder.svg'

/** First `<img>` src found in a fragment of content HTML, if any. */
export function firstImageSrc(html: string | undefined): string | undefined {
  if (!html) return undefined
  const doc = parseMarkup(html, 'text/html')
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    for (const attr of IMAGE_SRC_ATTRIBUTES) {
      const src = firstNonEmpty(img.getAttribute(attr) ?? undefined)
      if (src !== undefined) return src
    }

    const srcset = firstSrcsetCandidate(img.getAttribute('srcset') ?? undefined)
    if (srcset !== undefined) return srcset

    const dataSrcset = firstSrcsetCandidate(img.getAttribute('data-srcset') ?? undefined)
    if (dataSrcset !== undefined) return dataSrcset
  }
  return undefined
}

export interface ThumbnailCandidates {
  /** media:thumbnail / media:content / enclosure from a feed entry. */
  feedMedia?: string
  /** og:image scraped from the post page (HTML fallback). */
  ogImage?: string
  /** Entry content/description HTML to scan for an inline image. */
  contentHtml?: string
  /** Page URL used to resolve relative image paths. */
  baseUrl?: string
}

const IMAGE_SRC_ATTRIBUTES = ['src', 'data-src', 'data-lazy-src', 'data-original']

/** Walk the fallback chain and return the best available thumbnail URL. */
export function resolveThumbnail({
  feedMedia,
  ogImage,
  contentHtml,
  baseUrl,
}: ThumbnailCandidates): string {
  const thumbnail =
    firstNonEmpty(feedMedia) ??
    firstNonEmpty(ogImage) ??
    firstImageSrc(contentHtml) ??
    PLACEHOLDER_THUMBNAIL

  return thumbnail === PLACEHOLDER_THUMBNAIL ? thumbnail : absoluteUrl(thumbnail, baseUrl)
}

function firstNonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined
}

function firstSrcsetCandidate(srcset: string | undefined): string | undefined {
  const firstCandidate = firstNonEmpty(srcset)?.split(',')[0]?.trim()
  return firstCandidate?.split(/\s+/)[0]
}

function absoluteUrl(value: string, baseUrl: string | undefined): string {
  if (baseUrl === undefined) return value
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}
