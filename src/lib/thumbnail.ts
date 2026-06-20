// Thumbnail resolution (F5). Fallback chain per DEVELOPMENT_PLAN §3:
//   feed media → og:image → first content <img> → placeholder asset.
// Side-effect-free; uses DOMParser, never `document` (CON-004).

/** Bundled placeholder shown when a post yields no usable image. */
export const PLACEHOLDER_THUMBNAIL = '/placeholder.svg'

/** First `<img>` src found in a fragment of content HTML, if any. */
export function firstImageSrc(html: string | undefined): string | undefined {
  if (!html) return undefined
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const src = doc.querySelector('img')?.getAttribute('src')
  return src ?? undefined
}

export interface ThumbnailCandidates {
  /** media:thumbnail / media:content / enclosure from a feed entry. */
  feedMedia?: string
  /** og:image scraped from the post page (HTML fallback). */
  ogImage?: string
  /** Entry content/description HTML to scan for an inline image. */
  contentHtml?: string
}

/** Walk the fallback chain and return the best available thumbnail URL. */
export function resolveThumbnail({
  feedMedia,
  ogImage,
  contentHtml,
}: ThumbnailCandidates): string {
  return (
    firstNonEmpty(feedMedia) ??
    firstNonEmpty(ogImage) ??
    firstImageSrc(contentHtml) ??
    PLACEHOLDER_THUMBNAIL
  )
}

function firstNonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined
}
