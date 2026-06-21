# dev-corner

A Chrome (Manifest V3) extension that turns the blogs you read into a single
daily reading list. Save any page as a *source*, and dev-corner pulls the latest
posts from all your sources — on browser startup or every morning at 7 AM — then
shows you a curated 5-post digest. **No backend, no account, all data stays in
your browser.**

## Features

- **Save the current page** as a source from the popup or the right-click menu.
- **Many sources**, managed in a simple list (add / remove).
- **Local-only storage** via IndexedDB — nothing leaves your machine except the
  fetches to the sites you saved.
- **Automatic crawling** on browser startup, plus an optional daily 7 AM run in
  your browser's local time zone.
- **5 latest posts per source**, each with title, thumbnail, summary, the post's
  original link, and the source's link.
- **A daily 5-post digest** chosen for source diversity (see *Selection* below).
- **Click through** any post to its original page.

## How it extracts posts

dev-corner is feed-first: for each source it discovers an RSS/Atom feed (via the
page's `<link rel="alternate">` or common feed paths) and parses the newest
entries. If a site has no feed, it falls back to Open Graph tags and a few HTML
heuristics — best-effort, but still useful. See
[`docs/adr/ADR-001-extraction-strategy.md`](docs/adr/ADR-001-extraction-strategy.md).

## The daily 5-post selection

Given the sources that produced posts today (call that count **N**):

- **N < 5** — one newest post from each source, then fill the remaining slots
  with random posts from the pool.
- **N = 5** — exactly one newest post from each source.
- **N > 5** — five random sources, with the newest post from each.
- **N = 0** — an empty state.

Randomness is seeded by the date, so the list is stable if you open the popup
several times in a day.

## Tech stack

| Layer | Choice |
|---|---|
| Platform | Chrome Manifest V3 |
| Build | Vite + `@crxjs/vite-plugin` |
| Language | TypeScript |
| UI | React 19 |
| Storage | IndexedDB via Dexie |
| Scheduling | `chrome.alarms` + `chrome.runtime.onStartup` |
| Parsing | Native `DOMParser` (RSS/Atom + HTML) |

## Project structure

```
dev-corner/
├── docs/
│   ├── DEVELOPMENT_PLAN.md         full spec, milestones, risks
│   ├── LOCAL_TESTING.md            local run / load / inspect guide
│   └── adr/
│       ├── ADR-001-extraction-strategy.md
│       └── ADR-002-permissions-model.md
├── src/
│   ├── background/                 service worker: scheduler + crawler
│   ├── content/                    (optional) page-side helpers
│   ├── popup/                      React digest UI
│   └── lib/                        types, db, feed parser, selection
├── manifest.config.ts
├── README.md
├── CLAUDE.md                       guidance for Claude Code
├── AGENTS.md                       guidance for Codex / coding agents
└── LICENSE.md
```

## Getting started

```bash
pnpm install
pnpm dev             # development build with HMR
pnpm build           # production build → dist/
```

Load it in Chrome: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the `dist/` folder.

For the full local workflow — dev vs. production builds, where to inspect the
service worker and IndexedDB, MV3 gotchas, and console snippets — see
[`docs/LOCAL_TESTING.md`](docs/LOCAL_TESTING.md).

## Status

MVP implementation is in Phase 7 polish for personal/unpacked distribution.
Automated release gates are:

```bash
pnpm typecheck
pnpm exec vitest run --coverage
pnpm build
```

`src/lib/` coverage must stay at or above 90%. The production build writes the
loadable extension to `dist/`.

See [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for the full
milestone breakdown and open product questions.

## Manual test matrix

Before treating an unpacked build as release-ready, load `dist/` from
`chrome://extensions` and verify the core F1–F12 behavior across these source
types:

| Case | Example source type | Expected result |
|---|---|---|
| RSS blog | A blog with an RSS 2.0 feed | Save succeeds; crawl records up to 5 posts with title, thumbnail, summary, post URL, and source URL. |
| Atom-only blog | A source exposing Atom but no RSS feed | Feed discovery resolves Atom; posts appear in today's digest without `lastError`. |
| Feed-less page | A page with no RSS/Atom feed | HTML fallback extracts best-effort posts; missing thumbnails use `/placeholder.svg`. |
| Paywalled or blocked page | A page that denies fetches or returns an error | Crawl skips the source gracefully and records the failure in `source.lastError`. |

Also confirm popup save, right-click save, source deletion, refresh now, optional
daily 07:00 crawl, browser-startup crawl, digest click-through, and empty/error
states.

## License

MIT — see [LICENSE.md](LICENSE.md).
