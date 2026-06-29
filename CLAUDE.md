# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

dev-corner is a Chrome Manifest V3 extension that crawls user-saved blog sources
and shows a daily 5-post digest. It is **fully local** — there is no backend, no
server, and no remote database. All persistence is IndexedDB in the browser.

Read `docs/DEVELOPMENT_PLAN.md` first; it is the source of truth for requirements,
the data model, the scheduling design, and the selection algorithm. The two ADRs
in `docs/adr/` explain the extraction and permissions decisions.

## Architecture (don't violate these boundaries)

- **Service worker (`src/background/`)** is the only place that crawls. It runs on
  `onStartup` and on a `chrome.alarms` schedule, does cross-origin `fetch`, parses
  feeds/HTML with `DOMParser`, and writes to IndexedDB.
- **Popup (`src/popup/`)** never crawls. It only *reads* IndexedDB (live-bound)
  and sends messages to the worker for actions like "refresh now".
- **`src/lib/`** holds shared, side-effect-free logic: types, the Dexie schema,
  the feed parser, and the selection algorithm. Keep this layer testable in
  isolation (no `chrome.*` calls here).

## Hard constraints

- **No backend.** Never introduce a server, hosted API, or remote DB. If a task
  seems to need one, stop and flag it.
- **MV3 service workers are ephemeral.** Never rely on in-memory state surviving
  between events. Persist queues/progress to `chrome.storage.local`; use
  `chrome.alarms`, never `setInterval`/`setTimeout`, for scheduling.
- **No DOM in the worker.** Use `DOMParser`, not `document`.
- **Typed message boundaries.** All messages between contexts use the discriminated
  unions in `src/lib/types.ts`. Add new message types there, don't inline ad-hoc shapes.
- **Idempotent crawls.** `postUrl` is a unique index; upsert so re-crawls don't
  duplicate posts.
- **Privacy.** Page and feed fetches only target user-saved source origins.
  Thumbnails may load from HTTPS URLs explicitly selected by those sources. No
  analytics or telemetry.

## The selection algorithm

Implemented in `src/lib/selection.ts`. It must follow §4 of the development plan
exactly, including date-seeded randomness for stability across popup re-opens.
The `N > 5` branch currently returns a single post per the literal spec — this is
**open question Q1**. Do not "fix" it silently; if asked to change it, confirm the
intended interpretation first.

## Conventions

- TypeScript strict mode; no `any`. Prefer narrow types and exhaustive `switch`.
- React function components + hooks. The popup binds to Dexie via `useLiveQuery`.
- Keep `host_permissions` as narrow as the distribution target allows (ADR-002).
- Sentence-case UI copy; describe actions by what the user controls.

## Testing

- Unit-test `src/lib/` thoroughly: selection (all four N branches + determinism),
  feed parsing (RSS 2.0, Atom, missing fields), thumbnail fallback, next-7 AM math
  across time-zone/DST boundaries.
- Mock `fetch` with fixtures under `tests/fixtures/` for integration tests.
- Don't write tests that depend on live network or a real browser profile.

## Before opening a PR

- `pnpm build` succeeds and the unpacked extension loads in Chrome.
- New shared logic has unit tests.
- No new permissions added without a note in the PR and, if broad, an ADR update.
- No backend, no telemetry, no `setInterval`/`setTimeout` in the worker.

## Things to ask about rather than assume

- Distribution target: personal/unpacked vs. public Web Store (drives permissions).
- Whether to keep post history or only ever the current day.
- The Q1 selection behavior for N > 5.
