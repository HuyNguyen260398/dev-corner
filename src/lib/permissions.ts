const SUPPORTED_PERMISSION_PROTOCOLS = new Set(['http:', 'https:'])

export function originPatternForUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl)
  if (!SUPPORTED_PERMISSION_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Source URL must use http or https: ${sourceUrl}`)
  }
  return `${url.protocol}//${url.host}/*`
}
