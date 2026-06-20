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
- **N > 5** — one post from one randomly chosen source.
- **N = 0** — an empty state.

Randomness is seeded by the date, so the list is stable if you open the popup
several times in a day. (The N > 5 rule currently yields a single post; this is
flagged as an open question — see the development plan.)

## Tech stack

| Layer | Choice |
|---|---|
| Platform | Chrome Manifest V3 |
| Build | Vite + `@crxjs/vite-plugin` |
| Language | TypeScript |
| UI | React 18 |
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

Planning complete. See [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) for
the milestone breakdown (M1–M7) and open questions to resolve before building.

## License

MIT — see [LICENSE.md](LICENSE.md).
