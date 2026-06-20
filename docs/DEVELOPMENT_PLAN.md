# dev-corner — Development Plan & Specification

A Chrome (MV3) extension that lets a developer save blog/source URLs and, on a
schedule, pulls the latest posts from each so they have a single daily reading
list. Fully local — no backend.

---

## 1. Requirements

### 1.1 Functional

| # | Requirement |
|---|---|
| F1 | Save the URL of the current page as a "source". |
| F2 | Save many sources; manage (list/delete) them. |
| F3 | Persist all data locally (IndexedDB). No backend DB. |
| F4 | Extract the latest blog posts from each saved source. |
| F5 | Each extracted post has: `title`, `thumbnail`, `summary`, `postUrl`, `sourceUrl`. |
| F6 | Auto-crawl on browser startup. |
| F7 | Optionally crawl daily at 07:00 in the browser's local time zone. |
| F8 | Pull the 5 latest posts per source. |
| F9 | On opening the extension, preview the day's list of latest posts. |
| F10 | Each list item shows thumbnail + summary + a link that opens the post's original URL. |
| F11 | The preview shows exactly 5 posts, selected by the rule in §4. |
| F12 | A right-click (context-menu) item saves the current page as a source. |

### 1.2 Non-functional

- **No backend.** All storage and crawling happen in the browser.
- **Resilient to MV3 service-worker eviction.** Schedules and progress persist.
- **Per-site-agnostic.** No bespoke scraper per blog; one strategy covers most.
- **Privacy.** Nothing leaves the machine except the fetches to saved sources.
- **Small scale.** Tens of sources, ≤5 posts each — trivially within IndexedDB.

### 1.3 Constraints

- Solo developer, TypeScript + React comfort, AWS background (not needed here).
- Manifest V3 only.
- CORS: cross-origin `fetch` from the service worker requires `host_permissions`.

---

## 2. Architecture Overview

```
                ┌──────────────────────────────────────────────┐
                │                 Chrome (MV3)                  │
                │                                              │
  right-click ──┤  context menu ──┐                            │
                │                 ▼                            │
   on startup ──┤  ┌─────────────────────────┐   fetch()      │
   alarm 07:00 ─┤  │   Service Worker (SW)    │──────────────▶ saved source sites
                │  │  • scheduler (alarms)    │   (feed/HTML)  │
                │  │  • crawl orchestrator    │                │
                │  │  • feed/HTML parser      │                │
                │  └───────────┬─────────────┘                │
                │              │ write                         │
                │              ▼                               │
                │       ┌──────────────┐                       │
                │       │  IndexedDB    │  (Dexie)             │
                │       │  sources,     │                       │
                │       │  posts        │                       │
                │       └──────┬───────┘                       │
                │              │ useLiveQuery (read)           │
                │              ▼                               │
                │       ┌──────────────┐                       │
                │       │  Popup (React)│  daily 5-post preview │
                │       └──────────────┘                       │
                └──────────────────────────────────────────────┘
```

**Why this shape**

- The **service worker** is the only context that can run on `onStartup` / on an
  alarm and do cross-origin fetches — so all crawling lives there.
- **IndexedDB (Dexie)** is the source of truth. The popup never crawls; it only
  reads, so it opens instantly even if a crawl is mid-flight.
- The popup binds **live** to IndexedDB, so results appear as they're written.

---

## 3. Crawl Strategy (the core decision)

See `docs/adr/ADR-001-extraction-strategy.md`. Summary:

**Feed-first, HTML-fallback.**

1. **Resolve a feed for the source.**
   - Fetch the saved page, look for `<link rel="alternate" type="application/rss+xml|atom+xml">`.
   - If none, probe common paths: `/feed`, `/rss`, `/rss.xml`, `/atom.xml`,
     `/feed.xml`, `/index.xml`.
   - Cache the resolved feed URL on the source record so later crawls skip discovery.
2. **If a feed is found**, parse RSS/Atom and take the newest 5 entries. Map:
   - `title` ← entry title
   - `postUrl` ← entry link
   - `summary` ← entry description/summary (strip HTML, clamp ~200 chars)
   - `thumbnail` ← media:thumbnail / media:content / enclosure / first `<img>` in content
   - `publishedAt` ← pubDate / updated
3. **If no feed**, fall back to HTML:
   - Parse the page with `DOMParser` (available in the worker).
   - Pull article links heuristically (`<article> a`, `h2 a`, `h3 a`), de-dupe,
     take the first 5 in document order.
   - For thumbnail/summary, prefer the page's Open Graph tags
     (`og:image`, `og:description`) when fetching each post; otherwise best-effort.

> Feeds make title/summary/link/thumbnail reliable across most blogs without
> per-site code. HTML fallback is best-effort and may yield thinner data.

### Thumbnail fallback chain
`feed media` → `og:image` → first content `<img>` → placeholder asset.

---

## 4. Selection Algorithm (preview list = 5 posts)

Input: `sources` (each with up to 5 freshly-crawled posts for today).
Output: exactly 5 posts, newest-biased, with source diversity.

```
N = number of sources that produced ≥1 post today

if N == 0:
    return []                      # show empty state

if N < 5:
    picks = [ newest post from each source ]      # N picks, one per source
    remaining = 5 - N
    pool = all today's posts not already picked
    picks += random sample of `remaining` from pool   # may repeat a source
    return newest-first ordering of picks

if N == 5:
    return [ newest post from each of the 5 sources ]   # exactly one each

if N > 5:
    pick 1 random source, return its newest post   # per spec: 1 random post
    # NOTE: spec says "randomly get 1 post from 1 random link" for >5 sources.
    # See open question Q1 — this yields a 1-item list, which conflicts with
    # F11 (show 5). Plan implements the literal spec but flags it.
```

**Determinism:** seed the randomness with the current date so the list is stable
across multiple popup opens on the same day (re-rolling on every open is jarring).

**Ordering:** within the final set, sort by `publishedAt` desc, then by source name.

> ⚠️ Open question **Q1**: the `N > 5` rule produces a single post, which
> contradicts "always show 5 latest" (F11). Two sensible resolutions:
> (a) interpret it as "1 post from each of 5 randomly-chosen sources", or
> (b) keep literal 1-post behavior. The plan ships (b) behind a clearly-marked
> function so it's a one-line change. **Confirm before build.**

---

## 5. Data Model (IndexedDB via Dexie)

```ts
interface Source {
  id?: number
  url: string            // the page the user saved
  title: string          // best-effort site title
  feedUrl?: string       // resolved RSS/Atom, cached after discovery
  faviconUrl?: string
  addedAt: number
  lastCrawledAt?: number
  lastError?: string
}

interface Post {
  id?: number
  sourceId: number
  sourceUrl: string      // F5: source original link
  title: string          // F5
  summary: string        // F5
  thumbnail?: string      // F5
  postUrl: string         // F5: post original link (unique per source)
  publishedAt?: number
  crawledAt: number
  crawlDay: string        // 'YYYY-MM-DD' local — used to scope "today's" list
}
```

Dexie schema:

```
sources: '++id, &url, feedUrl, lastCrawledAt'
posts:   '++id, sourceId, &postUrl, crawlDay, publishedAt'
```

`&postUrl` (unique) makes re-crawls idempotent: `put` upserts, so the same post
isn't duplicated day to day. Old posts can be pruned (keep last K days).

---

## 6. Scheduling

| Trigger | Mechanism |
|---|---|
| Browser startup (F6) | `chrome.runtime.onStartup` → enqueue crawl-all |
| Daily 07:00 local (F7) | `chrome.alarms` — compute ms until next local 07:00, set a one-shot alarm; on fire, crawl + reschedule next 07:00 |
| Manual | popup "Refresh now" button → message SW |

Time zone: use the browser's local time (the `Date` the SW sees is already in the
host TZ) to compute the next 07:00. Store an `enableDailyCron` boolean in settings.

**SW eviction safety:** the alarm survives eviction (Chrome wakes the SW when it
fires). Crawl progress is checkpointed in `chrome.storage.local` so a kill
mid-batch resumes rather than restarting.

---

## 7. Context Menu (F12)

- Register `chrome.contextMenus` item "Save to dev-corner" on install
  (`contexts: ['page', 'link']`).
- On click: resolve the target URL (page URL, or the link URL if right-clicked
  on a link), add a `Source`, kick off a one-source crawl, and badge/notify
  success.

---

## 8. Permissions (manifest)

```
permissions:      storage, alarms, contextMenus, notifications
host_permissions: <all_urls>   ← required: users save arbitrary blogs
```

> `<all_urls>` is unavoidable here because the user chooses which sites to crawl.
> This will draw Web Store review scrutiny; the listing must explain why. An
> alternative is `optional_host_permissions` requested at save-time per origin —
> see ADR-002. Recommended for a public listing; `<all_urls>` is fine for
> personal/unpacked use.

---

## 9. Milestones

**M1 — Scaffold & storage.** MV3 + Vite + crxjs + TS, Dexie schema, settings
store. *Done when: extension loads, DB opens.*

**M2 — Save sources.** Popup "save current page" + context-menu save + source
list with delete. *Done when: F1, F2, F12 work and persist (F3).*

**M3 — Feed discovery + parser.** Resolve feed URL, parse RSS/Atom, map 5 posts.
*Done when: a feed-having source yields 5 posts with all F5 fields.*

**M4 — HTML fallback.** OG-tag + heuristic link extraction for feed-less sites.
*Done when: a feed-less source yields best-effort posts.*

**M5 — Scheduling.** `onStartup` crawl + 07:00 alarm + manual refresh + resume.
*Done when: F6, F7 fire and survive SW eviction.*

**M6 — Selection + preview UI.** Implement §4 algorithm, popup list with
thumbnail/summary/click-through. *Done when: F8–F11 satisfied.*

**M7 — Polish.** Empty/error/loading states, post pruning, icons, options page,
Web Store assets. *Done when: review-ready.*

---

## 10. Testing Strategy

- **Unit:** selection algorithm (all four N-branches, determinism), feed parser
  (RSS 2.0, Atom, missing fields), thumbnail fallback chain, next-07:00 math
  across TZ/DST edges.
- **Integration:** mock `fetch` with sample feeds/HTML → assert DB rows.
- **Manual matrix:** a blog with RSS, one Atom-only, one feed-less, one paywalled
  (expect graceful failure recorded in `source.lastError`).
- **Fixtures:** store sample feeds under `tests/fixtures/`.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Feed-less sites give poor data | OG-tag fallback; surface `lastError`; let user supply a feed URL manually |
| CORS blocks a fetch | `host_permissions` covers it; record + skip on failure |
| `<all_urls>` slows Web Store review | Per-origin `optional_host_permissions` (ADR-002) |
| Random list re-rolls each open | Date-seeded RNG (§4) |
| SW killed mid-crawl | Checkpoint to `chrome.storage.local`, resume |
| Q1 (>5 sources → 1 post) contradicts F11 | Flagged; confirm interpretation before M6 |

---

## 12. Open Questions

- **Q1.** `N > 5` selection yields 1 post vs. F11's "show 5". Confirm intended behavior.
- **Q2.** Public Web Store listing, or personal/unpacked only? (Decides `<all_urls>` vs optional perms.)
- **Q3.** Keep history (browse past days) or only ever "today"? Schema supports history cheaply.
- **Q4.** Should manual "save" allow pasting a feed URL directly for feed-less sites?
