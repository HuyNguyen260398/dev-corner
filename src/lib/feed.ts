// Feed discovery + parsing (PAT-001, DEVELOPMENT_PLAN §3). Side-effect-free:
// parsing uses a bundled DOMParser-compatible parser, never `document` (CON-004),
// and there is NO network here — the service worker owns fetching.
// `discoverFeedUrl` reads the declared feed from already-fetched HTML;
// `feedProbeUrls` returns the common-path candidates the worker fetches in order
// when no feed is declared.

import { parseMarkup } from './dom'
import { summarize } from './summary'
import { resolveThumbnail } from './thumbnail'

/** A normalized feed entry, mapped to the F5 post fields. */
export interface FeedEntry {
  title: string
  postUrl: string
  summary: string
  thumbnail: string
  publishedAt?: number
}

const MAX_ENTRIES = 5

/** Common feed locations probed when a page declares no `<link rel="alternate">`. */
const PROBE_PATHS = ['/feed', '/rss', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml']

/** The declared RSS/Atom feed URL from a page's `<head>`, resolved absolute. */
export function discoverFeedUrl(html: string, baseUrl: string): string | undefined {
  const doc = parseMarkup(html, 'text/html')
  const links = Array.from(doc.querySelectorAll('link[rel="alternate"]'))
  const feedLink = links.find((l) => {
    const type = l.getAttribute('type') ?? ''
    return type.includes('rss+xml') || type.includes('atom+xml')
  })
  const href = feedLink?.getAttribute('href')
  return href ? new URL(href, baseUrl).href : undefined
}

/** Candidate feed URLs for the worker to try when discovery finds nothing. */
export function feedProbeUrls(baseUrl: string): string[] {
  return PROBE_PATHS.map((path) => new URL(path, baseUrl).href)
}

/** Parse RSS 2.0 or Atom XML into up to 5 entries, newest-first. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parseMarkup(xml, 'application/xml')
  const root = doc.documentElement?.nodeName.toLowerCase()

  const nodes =
    root === 'feed'
      ? Array.from(doc.getElementsByTagName('entry')).map(parseAtomEntry)
      : Array.from(doc.getElementsByTagName('item')).map(parseRssItem)

  const entries = nodes.filter((e): e is FeedEntry => e !== null)
  entries.sort((a, b) => (b.publishedAt ?? -Infinity) - (a.publishedAt ?? -Infinity))
  return entries.slice(0, MAX_ENTRIES)
}

function parseRssItem(item: Element): FeedEntry | null {
  const postUrl = childText(item, 'link')
  if (!postUrl) return null

  const descriptionHtml = childText(item, 'description')
  const contentHtml = childText(item, 'content:encoded')
  const feedMedia =
    attrOf(item, 'media:thumbnail', 'url') ??
    attrOf(item, 'media:content', 'url') ??
    attrOf(item, 'enclosure', 'url')

  return makeEntry({
    title: childText(item, 'title'),
    postUrl,
    html: descriptionHtml || contentHtml,
    thumbnailHtml: contentHtml || descriptionHtml,
    feedMedia,
    dateText: childText(item, 'pubDate'),
  })
}

function parseAtomEntry(entry: Element): FeedEntry | null {
  const postUrl = atomLink(entry)
  if (!postUrl) return null

  const html = childText(entry, 'content') || childText(entry, 'summary')
  const feedMedia = attrOf(entry, 'media:thumbnail', 'url') ?? attrOf(entry, 'media:content', 'url')

  return makeEntry({
    title: childText(entry, 'title'),
    postUrl,
    html,
    thumbnailHtml: html,
    feedMedia,
    dateText: childText(entry, 'published') || childText(entry, 'updated'),
  })
}

function makeEntry(opts: {
  title: string
  postUrl: string
  html: string
  thumbnailHtml: string
  feedMedia: string | undefined
  dateText: string
}): FeedEntry {
  const publishedAt = parseDate(opts.dateText)
  const candidates =
    opts.feedMedia !== undefined
      ? { feedMedia: opts.feedMedia, contentHtml: opts.thumbnailHtml, baseUrl: opts.postUrl }
      : { contentHtml: opts.thumbnailHtml, baseUrl: opts.postUrl }

  return {
    title: opts.title.trim() || 'Untitled',
    postUrl: opts.postUrl,
    summary: summarize(opts.html),
    thumbnail: resolveThumbnail(candidates),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}

function atomLink(entry: Element): string | undefined {
  const links = Array.from(entry.getElementsByTagName('link'))
  const chosen =
    links.find((l) => l.getAttribute('rel') === 'alternate') ??
    links.find((l) => !l.getAttribute('rel')) ??
    links[0]
  return chosen?.getAttribute('href') ?? undefined
}

function childText(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

function attrOf(parent: Element, tag: string, attr: string): string | undefined {
  return parent.getElementsByTagName(tag)[0]?.getAttribute(attr) ?? undefined
}

function parseDate(text: string): number | undefined {
  if (!text) return undefined
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? undefined : ms
}
