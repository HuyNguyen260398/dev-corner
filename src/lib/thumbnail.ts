// Thumbnail resolution (F5). Fallback chain per DEVELOPMENT_PLAN §3:
//   feed media → og:image → first content <img> → placeholder asset.
// Side-effect-free; uses a bundled DOMParser-compatible parser, never `document`
// (CON-004).

import { parseMarkup } from './dom'
import { PLACEHOLDER_THUMBNAIL, renderableThumbnail } from './thumbnail-policy'

export { PLACEHOLDER_THUMBNAIL, renderableThumbnail } from './thumbnail-policy'

/** First `<img>` src found in a fragment of content HTML, if any. */
export function firstImageSrc(html: string | undefined): string | undefined {
  return imageSources(html)[0]
}

function imageSources(html: string | undefined): string[] {
  if (!html) return []
  const doc = parseMarkup(html, 'text/html')
  const sources: string[] = []
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    for (const attr of IMAGE_SRC_ATTRIBUTES) {
      const src = firstNonEmpty(img.getAttribute(attr) ?? undefined)
      if (src !== undefined) sources.push(src)
    }

    const srcset = firstSrcsetCandidate(img.getAttribute('srcset') ?? undefined)
    if (srcset !== undefined) sources.push(srcset)

    const dataSrcset = firstSrcsetCandidate(img.getAttribute('data-srcset') ?? undefined)
    if (dataSrcset !== undefined) sources.push(dataSrcset)
  }
  return sources
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

/** Return the first HTTPS candidate explicitly selected by the saved source. */
export function resolveRenderableThumbnail(
  { feedMedia, ogImage, contentHtml, baseUrl }: ThumbnailCandidates,
): string {
  const candidates = [feedMedia, ogImage, ...imageSources(contentHtml)]

  for (const candidate of candidates) {
    const value = firstNonEmpty(candidate)
    if (value === undefined) continue

    const thumbnail = renderableThumbnail(absoluteUrl(value, baseUrl))
    if (thumbnail !== PLACEHOLDER_THUMBNAIL) return thumbnail
  }

  return PLACEHOLDER_THUMBNAIL
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
