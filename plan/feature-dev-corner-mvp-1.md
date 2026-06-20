---
goal: Build the dev-corner MV3 extension MVP (local crawler + daily 5-post digest) with a unit-tested shared library
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, architecture, chrome-extension, mv3, testing]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan implements dev-corner, a fully local Chrome Manifest V3 extension that crawls user-saved blog sources and shows a daily 5-post digest. It is derived from `docs/DEVELOPMENT_PLAN.md` (the source of truth) plus `docs/adr/ADR-001` (extraction) and `docs/adr/ADR-002` (permissions). The plan is organized into atomic phases that mirror milestones M1–M7, with a dedicated, thorough unit-testing track for the side-effect-free `src/lib/` layer using Vitest.

Confirmed decisions for this plan:
- **Package manager:** pnpm.
- **Test runner:** Vitest.
- **Selection Q1 (N > 5):** pick 5 random sources, take the newest post from each (honors F11; supersedes the literal 1-post spec).
- **History (Q3):** keep posts, prune to the last `K = 7` crawl days.
- **Permissions (Q2):** `<all_urls>` for personal/unpacked distribution now; per-origin `optional_host_permissions` flow deferred to an optional phase, with permission logic isolated behind one module.

## 1. Requirements & Constraints

- **REQ-F1**: Save the URL of the current page as a "source".
- **REQ-F2**: Save many sources; list and delete them.
- **REQ-F3**: Persist all data locally in IndexedDB; no backend DB.
- **REQ-F4**: Extract the latest posts from each saved source.
- **REQ-F5**: Each post has `title`, `thumbnail`, `summary`, `postUrl`, `sourceUrl`.
- **REQ-F6**: Auto-crawl on browser startup (`chrome.runtime.onStartup`).
- **REQ-F7**: Optionally crawl daily at 07:00 local time via `chrome.alarms`.
- **REQ-F8**: Pull the 5 latest posts per source.
- **REQ-F9**: On opening the popup, preview the day's list of latest posts.
- **REQ-F10**: Each list item shows thumbnail + summary + a click-through link to the original post URL.
- **REQ-F11**: The preview shows exactly 5 posts, selected by §4 of the development plan.
- **REQ-F12**: A right-click context-menu item saves the current page (or right-clicked link) as a source.
- **SEC-001**: Privacy — the only network calls allowed are fetches to user-saved sources. No analytics, telemetry, or third-party calls.
- **SEC-002**: `host_permissions` kept as narrow as the distribution target allows (ADR-002).
- **CON-001**: No backend, hosted API, or remote DB — ever. If a task seems to need one, stop and flag it.
- **CON-002**: MV3 service workers are ephemeral; never rely on in-memory state surviving between events. Persist queues/progress to `chrome.storage.local`.
- **CON-003**: Use `chrome.alarms` for scheduling; never `setInterval`/`setTimeout` in the worker.
- **CON-004**: No DOM in the worker; use `DOMParser`, not `document`.
- **CON-005**: TypeScript strict mode; no `any`. Prefer narrow types and exhaustive `switch`.
- **CON-006**: `postUrl` is a unique index; crawls must be idempotent (upsert, no duplicates).
- **GUD-001**: `src/lib/` is shared, side-effect-free logic with zero `chrome.*` calls, fully unit-testable in isolation.
- **GUD-002**: The popup never crawls; it only reads IndexedDB live-bound and sends messages to the worker.
- **GUD-003**: All cross-context messages use the discriminated unions in `src/lib/types.ts`; no inline ad-hoc message shapes.
- **GUD-004**: Sentence-case UI copy; describe actions by what the user controls.
- **GUD-005**: One commit per task — every TASK-XXX is committed individually when complete, before starting the next task. See the execution workflow in §2.
- **PAT-001**: Feed-first, HTML-fallback extraction (ADR-001).
- **PAT-002**: Date-seeded randomness in selection so the list is stable across popup re-opens on the same day.

## 2. Implementation Steps

### Execution Workflow (commit-per-task)

Each task below is completed and committed on its own before the next task starts. Per task:

1. Implement only that task's scope.
2. Verify it (relevant tests pass / `pnpm typecheck` clean for the touched code).
3. Mark the task row `Completed` (`✅`) with the date.
4. Create exactly one commit for that task.

**Commit message format:** `TASK-XXX: <short description>` as the subject. End every commit message with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Example: `TASK-009: implement seeded selection algorithm with 4 N-branches`. Do not bundle multiple tasks into one commit; do not commit work-in-progress for a task that does not yet pass its verification.

### Implementation Phase 1

- GOAL-001: Scaffold the MV3 + Vite + crxjs + TypeScript project, configure pnpm and Vitest, and define the shared types and Dexie schema (milestone M1).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Initialize the project with pnpm: create `package.json` with `"packageManager": "pnpm@<version>"`, scripts `dev`, `build`, `test`, `test:watch`, `typecheck`, `lint`. Add `pnpm-lock.yaml` via `pnpm install`. | ✅ | 2026-06-20 |
| TASK-002 | Add toolchain deps: `vite`, `@crxjs/vite-plugin`, `typescript`, `react`, `react-dom`, `dexie`, `dexie-react-hooks`, `@types/chrome`, `vitest`, `@testing-library/react`, `jsdom` (or `happy-dom`). Also added required peers: `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@vitest/coverage-v8`, `fake-indexeddb`, `eslint`, `@eslint/js`, `typescript-eslint`. | ✅ | 2026-06-20 |
| TASK-003 | Create `tsconfig.json` (strict: true, noImplicitAny, exactOptionalPropertyTypes) and `vite.config.ts` wiring `@crxjs/vite-plugin` to `manifest.config.ts`. | ✅ | 2026-06-20 |
| TASK-004 | Create `vitest.config.ts` with `environment: 'node'` for lib tests and `jsdom` for popup tests, `globals: true`, coverage via `@vitest/coverage-v8`. Deviation: jsdom used project-wide because lib parsers depend on `DOMParser` (absent in Node). | ✅ | 2026-06-20 |
| TASK-005 | Author `manifest.config.ts`: MV3, `permissions: [storage, alarms, contextMenus, notifications]`, `host_permissions: ['<all_urls>']`, background service worker (`type: module`), popup `action`. | ✅ | 2026-06-20 |
| TASK-006 | Create `src/lib/types.ts`: `Source`, `Post`, `Settings` interfaces (per §5) and the discriminated-union `Message` type covering `CRAWL_ALL`, `CRAWL_SOURCE`, `SAVE_SOURCE`, `DELETE_SOURCE` request/response shapes. | ✅ | 2026-06-20 |
| TASK-007 | Create `src/lib/db.ts`: Dexie subclass `DevCornerDB` with stores `sources: '++id, &url, feedUrl, lastCrawledAt'` and `posts: '++id, sourceId, &postUrl, crawlDay, publishedAt'`; export a singleton `db`. | ✅ | 2026-06-20 |
| TASK-008 | Add placeholder entry points `src/background/index.ts`, `src/popup/main.tsx`, `src/popup/App.tsx`, and a placeholder thumbnail asset under `public/`. | | |

### Implementation Phase 2

- GOAL-002: Implement and exhaustively unit-test the side-effect-free `src/lib/` logic — selection algorithm, feed parser, thumbnail fallback, and scheduling math (covers REQ-F5, REQ-F8, REQ-F11, PAT-001, PAT-002 at the unit level; this is the project's primary test surface).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | Implement `src/lib/selection.ts` with a seeded RNG (e.g. mulberry32 seeded from `YYYY-MM-DD`). Implement the four N-branches; the `N > 5` branch picks 5 random sources and returns the newest post from each (Q1 resolution). Final ordering: `publishedAt` desc, then source name. Isolate the N>5 rule in a single named function. | | |
| TASK-010 | Implement `src/lib/feed.ts`: `discoverFeedUrl(html, baseUrl)` (parse `<link rel="alternate">`, then probe `/feed`, `/rss`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`) and `parseFeed(xml)` returning up to 5 normalized entries mapped per §3 (RSS 2.0 + Atom). | | |
| TASK-011 | Implement `src/lib/thumbnail.ts`: fallback chain `feed media` → `og:image` → first content `<img>` → placeholder asset. Pure function over parsed inputs. | | |
| TASK-012 | Implement `src/lib/summary.ts`: strip HTML and clamp to ~200 chars. | | |
| TASK-013 | Implement `src/lib/schedule.ts`: `msUntilNext0700(now: Date)` computing ms to the next local 07:00, correct across day rollover, time-zone, and DST boundaries. | | |
| TASK-014 | Write `tests/lib/selection.test.ts`: cover N==0, N<5, N==5, N>5 branches; assert determinism (same date → identical output across repeated calls) and ordering. | | |
| TASK-015 | Write `tests/lib/feed.test.ts`: RSS 2.0 fixture, Atom fixture, and a missing-fields fixture; assert field mapping and the 5-entry cap. | | |
| TASK-016 | Write `tests/lib/thumbnail.test.ts`: assert each rung of the fallback chain, including the placeholder when all sources are absent. | | |
| TASK-017 | Write `tests/lib/schedule.test.ts`: assert next-07:00 math for before-07:00, after-07:00, exactly-07:00, and a DST spring-forward / fall-back date. | | |
| TASK-018 | Add fixtures under `tests/fixtures/`: `rss-2.0.xml`, `atom.xml`, `feed-missing-fields.xml`, `page-with-feed-link.html`, `page-no-feed.html`. | | |

### Implementation Phase 3

- GOAL-003: Build source-saving via popup and context menu, with a deletable source list persisted in IndexedDB (milestones M2; covers REQ-F1, REQ-F2, REQ-F3, REQ-F12).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Implement `src/lib/sources.ts`: `addSource(url, title?)` (upsert by unique `url`), `deleteSource(id)`, `listSources()` — pure DB operations, no `chrome.*`. | | |
| TASK-020 | In `src/background/index.ts`, register the `chrome.contextMenus` item "Save to dev-corner" (`contexts: ['page', 'link']`) on install; on click resolve target URL and call `addSource`. | | |
| TASK-021 | Implement the worker message handler for `SAVE_SOURCE` / `DELETE_SOURCE` using the `src/lib/types.ts` unions; respond with typed results. | | |
| TASK-022 | Build popup "Save current page" using `chrome.tabs.query({active:true})` → send `SAVE_SOURCE`; build the source list (live-bound via `useLiveQuery`) with a delete control. | | |
| TASK-023 | Write `tests/lib/sources.test.ts` against a fake-indexeddb instance: assert upsert-by-url idempotency and delete. | | |

### Implementation Phase 4

- GOAL-004: Implement the crawl orchestrator with feed-first / HTML-fallback extraction and idempotent upserts (milestones M3 + M4; covers REQ-F4, REQ-F5, REQ-F8, PAT-001, CON-006).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-024 | Implement `src/background/crawl.ts`: `crawlSource(source)` — fetch page, resolve feed (cache `feedUrl` on the source), parse feed and take newest 5; on no feed, run HTML heuristic (`<article> a`, `h2 a`, `h3 a`, de-dupe, first 5) + OG tags. | | |
| TASK-025 | Map each entry to a `Post` with `crawlDay` = local `YYYY-MM-DD`, `crawledAt`, `sourceId`, `sourceUrl`; `put` into `posts` (upsert on `&postUrl`). Record `source.lastCrawledAt`; capture failures into `source.lastError`. | | |
| TASK-026 | Implement `crawlAll()` iterating sources with a checkpoint queue in `chrome.storage.local` so an evicted SW resumes rather than restarts (CON-002). | | |
| TASK-027 | Wire `CRAWL_SOURCE` / `CRAWL_ALL` messages to the orchestrator; trigger a one-source crawl immediately after a context-menu save. | | |
| TASK-028 | Write `tests/integration/crawl.test.ts`: mock `global.fetch` with the Phase-2 fixtures; assert correct `posts` rows, idempotency on re-crawl, and `lastError` on fetch failure. | | |

### Implementation Phase 5

- GOAL-005: Implement scheduling and manual refresh that survive service-worker eviction (milestone M5; covers REQ-F6, REQ-F7, CON-002, CON-003).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-029 | On `chrome.runtime.onStartup`, enqueue `crawlAll()`. | | |
| TASK-030 | Implement the daily 07:00 alarm: on install/enable compute `msUntilNext0700` (from `src/lib/schedule.ts`), set a one-shot `chrome.alarms` alarm; on fire, crawl then reschedule the next 07:00. Gate on a `Settings.enableDailyCron` boolean in `chrome.storage.local`. | | |
| TASK-031 | Add a popup "Refresh now" button sending `CRAWL_ALL`; reflect in-progress state from a checkpoint flag. | | |
| TASK-032 | Add an options/settings surface to toggle `enableDailyCron`; persist to `chrome.storage.local`. | | |

### Implementation Phase 6

- GOAL-006: Implement the daily digest preview UI and post pruning (milestone M6 + part of M7; covers REQ-F9, REQ-F10, REQ-F11, Q3 pruning).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-033 | In the popup, live-query today's posts (`crawlDay` == local today), run `src/lib/selection.ts`, render exactly 5 items with thumbnail + summary + click-through link opening `postUrl` in a new tab. | | |
| TASK-034 | Implement empty / loading / error states (no sources, crawl in progress, all-sources-failed surfacing `lastError`). | | |
| TASK-035 | Implement `src/lib/prune.ts`: delete posts whose `crawlDay` is older than `K = 7` days; call it after each `crawlAll()`. | | |
| TASK-036 | Write `tests/lib/prune.test.ts`: assert posts older than K days are removed and recent ones retained (fake-indexeddb). | | |

### Implementation Phase 7

- GOAL-007: Polish, verification, and release-readiness for personal/unpacked distribution (milestone M7).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-037 | Add extension icons (16/32/48/128) and finalize the placeholder thumbnail asset. | | |
| TASK-038 | Run `pnpm typecheck` (zero errors), `pnpm test` with coverage (lib coverage ≥ 90%), and `pnpm build`; load the unpacked `dist/` in Chrome and verify F1–F12 manually. | | |
| TASK-039 | Update `README.md` status section and document the manual test matrix (RSS blog, Atom-only, feed-less, paywalled → graceful `lastError`). | | |

### Implementation Phase 8 (Optional — Web Store distribution)

- GOAL-008: Switch the permissions model to least-privilege per-origin for a public Web Store listing (ADR-002 Option B). Execute only if Q2 resolves to public distribution.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-040 | Replace `host_permissions: ['<all_urls>']` with `optional_host_permissions`; isolate all permission checks/requests in `src/background/permissions.ts`. | | |
| TASK-041 | On source save, call `chrome.permissions.request({ origins: ['https://<host>/*'] })`; on denial mark the source "needs permission" and offer re-request in the UI. | | |
| TASK-042 | Skip crawling sources lacking granted origin permission; surface the state in the source list. | | |

## 3. Alternatives

- **ALT-001**: Pure HTML scraping as the primary path (ADR-001 Option B). Rejected — brittle, breaks on redesigns, high per-site upkeep; retained only as fallback.
- **ALT-002**: Third-party extraction API (ADR-001 Option C). Rejected — violates the no-backend / privacy constraint and adds cost + dependency.
- **ALT-003**: Jest as the test runner. Rejected in favor of Vitest for native Vite/ESM integration and lower config overhead.
- **ALT-004**: `optional_host_permissions` from day one. Deferred — adds a per-origin prompt + denial UI not needed for personal/unpacked use; kept as optional Phase 8.
- **ALT-005**: Keep only the current day's posts (Q3 alternative). Rejected in favor of pruning to last 7 days, which costs little and enables future history browsing.

## 4. Dependencies

- **DEP-001**: pnpm (package manager).
- **DEP-002**: vite + `@crxjs/vite-plugin` (MV3 bundling).
- **DEP-003**: typescript (strict mode).
- **DEP-004**: react + react-dom (popup UI).
- **DEP-005**: dexie + dexie-react-hooks (IndexedDB + `useLiveQuery`).
- **DEP-006**: @types/chrome (extension API types).
- **DEP-007**: vitest + @vitest/coverage-v8 (unit/integration tests + coverage).
- **DEP-008**: jsdom or happy-dom (DOM environment for popup tests; `DOMParser` for parser tests).
- **DEP-009**: fake-indexeddb (in-memory IndexedDB for db/sources/prune tests).
- **DEP-010**: @testing-library/react (popup component tests).

## 5. Files

- **FILE-001**: `package.json` — pnpm scripts and `packageManager` field.
- **FILE-002**: `vite.config.ts`, `manifest.config.ts`, `tsconfig.json`, `vitest.config.ts` — build/test config.
- **FILE-003**: `src/lib/types.ts` — shared types and the message discriminated unions.
- **FILE-004**: `src/lib/db.ts` — Dexie schema/singleton.
- **FILE-005**: `src/lib/selection.ts` — §4 selection algorithm with seeded RNG and the isolated N>5 rule.
- **FILE-006**: `src/lib/feed.ts` — feed discovery + RSS/Atom parsing.
- **FILE-007**: `src/lib/thumbnail.ts`, `src/lib/summary.ts` — extraction helpers.
- **FILE-008**: `src/lib/schedule.ts` — next-07:00 math.
- **FILE-009**: `src/lib/sources.ts`, `src/lib/prune.ts` — DB operations.
- **FILE-010**: `src/background/index.ts`, `src/background/crawl.ts`, `src/background/permissions.ts` (Phase 8) — service worker.
- **FILE-011**: `src/popup/main.tsx`, `src/popup/App.tsx` — popup UI.
- **FILE-012**: `tests/lib/*.test.ts`, `tests/integration/crawl.test.ts`, `tests/fixtures/*` — test suite and fixtures.
- **FILE-013**: `public/` — icons and placeholder thumbnail.

## 6. Testing

- **TEST-001**: Selection — all four N-branches (N==0, N<5, N==5, N>5) plus determinism (same date seed → identical output) and final ordering (`publishedAt` desc, then source name).
- **TEST-002**: Feed parsing — RSS 2.0, Atom, and missing-fields fixtures; correct field mapping and 5-entry cap.
- **TEST-003**: Thumbnail fallback chain — each rung exercised, placeholder when all absent.
- **TEST-004**: Summary — HTML stripped and clamped to ~200 chars.
- **TEST-005**: Schedule — next-07:00 across before/after/exactly 07:00 and DST spring-forward / fall-back.
- **TEST-006**: Sources — upsert-by-url idempotency and delete (fake-indexeddb).
- **TEST-007**: Crawl integration — mocked `fetch` over fixtures asserts `posts` rows, re-crawl idempotency (`&postUrl`), and `lastError` capture on failure.
- **TEST-008**: Prune — posts older than K=7 days removed, recent retained.
- **TEST-009**: Popup (optional, Testing Library) — renders exactly 5 items and the empty state.
- **TEST-010**: Coverage gate — `src/lib/` line coverage ≥ 90% in `pnpm test`.

## 7. Risks & Assumptions

- **RISK-001**: Feed-less sites give poor data. Mitigation — OG-tag fallback; surface `lastError`; future Q4 allows pasting a feed URL.
- **RISK-002**: CORS blocks a fetch. Mitigation — `host_permissions` covers it; record + skip on failure.
- **RISK-003**: SW killed mid-crawl. Mitigation — checkpoint queue in `chrome.storage.local`, resume on next event.
- **RISK-004**: `@crxjs/vite-plugin` version drift / MV3 quirks. Mitigation — pin versions; verify unpacked load in Phase 7.
- **RISK-005**: `<all_urls>` slows a future Web Store review. Mitigation — Phase 8 swaps to per-origin `optional_host_permissions`; permission logic pre-isolated.
- **ASSUMPTION-001**: Distribution is personal/unpacked for the MVP (Q2); public listing deferred to Phase 8.
- **ASSUMPTION-002**: Q1 resolved to "5 random sources, newest each"; if reverted to literal 1-post, only the isolated N>5 function changes.
- **ASSUMPTION-003**: History retention K = 7 days is acceptable (Q3); a single constant change adjusts it.
- **ASSUMPTION-004**: Tens of sources × ≤5 posts stays trivially within IndexedDB limits.

## 8. Related Specifications / Further Reading

- `docs/DEVELOPMENT_PLAN.md` — requirements, data model, scheduling, selection algorithm (source of truth).
- `docs/adr/ADR-001-extraction-strategy.md` — feed-first, HTML-fallback decision.
- `docs/adr/ADR-002-permissions-model.md` — host-permissions trade-offs (drives Phase 8).
- `CLAUDE.md` / `AGENTS.md` — repository conventions and hard constraints.
