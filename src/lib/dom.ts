import { DOMParser as LinkedomParser } from 'linkedom'

type ParseMimeType = 'text/html' | 'application/xml'

export function parseMarkup(markup: string, mimeType: ParseMimeType): Document {
  const parserMimeType = mimeType === 'application/xml' ? 'text/xml' : mimeType
  return new LinkedomParser().parseFromString(
    normalizeMarkup(markup, mimeType),
    parserMimeType,
  ) as unknown as Document
}

function normalizeMarkup(markup: string, mimeType: ParseMimeType): string {
  if (mimeType !== 'text/html') return markup

  const trimmed = markup.trim()
  if (/^(<!doctype\s+html|<html[\s>])/i.test(trimmed)) return markup

  return `<!doctype html><html><head></head><body>${markup}</body></html>`
}
