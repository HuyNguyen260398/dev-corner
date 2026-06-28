# AGENTS.md

Instructions for coding agents (Codex and similar) working in this repository.
If you also support `CLAUDE.md`, the two are kept in sync; this file is the
canonical agent guide.

## Project summary

dev-corner — a Chrome Manifest V3 extension. Users save blog pages as *sources*;
the extension crawls each source's latest posts and shows a daily 5-post digest.
**Fully client-side: no backend, no remote database, no account.**

Authoritative docs:
- `docs/DEVELOPMENT_PLAN.md` — requirements, data model, scheduling, selection algorithm, milestones.
- `docs/adr/ADR-001-extraction-strategy.md` — feed-first, HTML-fallback extraction.
- `docs/adr/ADR-002-permissions-model.md` — host-permission options.

Read these before making changes.

## Setup commands

```bash
pnpm install         # install dependencies
pnpm dev             # dev build with HMR
pnpm build           # production build → dist/
pnpm test            # unit tests (once a test runner is added)
```

Load the unpacked extension from `dist/` via chrome://extensions (Developer mode).

## Code layout

| Path | Responsibility | Rules |
|---|---|---|
| `src/background/` | Service worker: scheduler + crawler | Only context allowed to fetch/crawl |
| `src/popup/` | React digest UI | Read-only against IndexedDB; never crawls |
| `src/lib/` | types, Dexie schema, feed parser, selection | Pure logic; no `chrome.*` calls; unit-tested |
| `src/content/` | Optional page-side helpers | Message the worker; don't touch the DB |
| `manifest.config.ts` | MV3 manifest | Keep permissions minimal |

## Non-negotiable constraints

1. **No backend or remote services.** No server, hosted API, or remote DB, ever.
2. **MV3 ephemerality.** The service worker can be killed anytime. Persist state to
   `chrome.storage.local`; schedule with `chrome.alarms` — never `setInterval` or
   `setTimeout` in the worker.
3. **No `document` in the worker.** Parse HTML/feeds with `DOMParser`.
4. **Typed messages.** Use the discriminated unions in `src/lib/types.ts` for all
   cross-context messaging; extend them there rather than inlining shapes.
5. **Idempotent crawling.** `postUrl` has a unique index; upsert to avoid dupes.
6. **Privacy.** Page and feed fetches only target user-saved source origins.
   Thumbnails may load from HTTPS URLs explicitly selected by those sources. No telemetry.
7. **TypeScript strict.** No `any`; exhaustive `switch` on message/union types.

## Selection algorithm

`src/lib/selection.ts` implements the digest rule from plan §4:
- N < 5 → one per source, fill remainder randomly.
- N = 5 → one per source.
- N > 5 → one post from one random source.
- N = 0 → empty.

Randomness is **date-seeded** so the list is stable across popup re-opens. The
N > 5 branch returns a single post per the literal spec; this conflicts with
"always show 5" and is tracked as **open question Q1**. Do not change this
behavior without explicit confirmation of the intended interpretation.

## Validation before finishing a task

- `pnpm build` passes and the extension loads unpacked without console errors.
- Added/changed pure logic in `src/lib/` has unit tests (mock `fetch`; use
  `tests/fixtures/`; no live network).
- No new permissions without calling it out; broad grants require an ADR-002 update.
- Confirm none of the seven constraints above were violated.

## When unsure, stop and ask

- Distribution target (personal/unpacked vs. Web Store) — affects permissions.
- History retention (keep past days vs. current day only).
- Q1 behavior for N > 5.

Surface these as questions rather than guessing; they change the design.
