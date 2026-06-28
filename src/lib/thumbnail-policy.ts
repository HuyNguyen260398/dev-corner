/** Bundled placeholder shown when a post yields no usable image. */
export const PLACEHOLDER_THUMBNAIL = '/placeholder.svg'

export function renderableThumbnail(
  thumbnail: string | undefined,
  sourceUrl: string,
): string {
  if (thumbnail === undefined || thumbnail === PLACEHOLDER_THUMBNAIL) {
    return PLACEHOLDER_THUMBNAIL
  }

  try {
    const candidate = new URL(thumbnail)
    const source = new URL(sourceUrl)
    return candidate.protocol === 'https:' && candidate.origin === source.origin
      ? candidate.href
      : PLACEHOLDER_THUMBNAIL
  } catch {
    return PLACEHOLDER_THUMBNAIL
  }
}
