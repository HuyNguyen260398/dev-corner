/** Bundled placeholder shown when a post yields no usable image. */
export const PLACEHOLDER_THUMBNAIL = '/placeholder.svg'

export function renderableThumbnail(
  thumbnail: string | undefined,
): string {
  if (thumbnail === undefined || thumbnail === PLACEHOLDER_THUMBNAIL) {
    return PLACEHOLDER_THUMBNAIL
  }

  try {
    const candidate = new URL(thumbnail)
    return candidate.protocol === 'https:' ? candidate.href : PLACEHOLDER_THUMBNAIL
  } catch {
    return PLACEHOLDER_THUMBNAIL
  }
}
