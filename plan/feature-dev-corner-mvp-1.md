---
goal: Build the dev-corner MV3 extension MVP (local crawler + daily 5-post digest) with a unit-tested shared library
version: 2.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'In progress'
tags: [feature, architecture, chrome-extension, mv3, testing, index]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

This is the **master index** for the dev-corner MVP — a fully local Chrome Manifest V3 extension that crawls user-saved blog sources and shows a daily 5-post digest. It is derived from `docs/DEVELOPMENT_PLAN.md` (the source of truth) plus `docs/adr/ADR-001` (extraction) and `docs/adr/ADR-002` (permissions).

The work is broken into one plan file per phase (mirroring milestones M1–M7, plus an optional Web Store phase). This file holds the program-level decisions, requirements, and the phase index; each linked phase plan holds its own tasks, files, and tests.

Confirmed decisions:
- **Package manager:** pnpm.
- **Test runner:** Vitest.
- **Selection Q1 (N > 5):** pick 5 random sources, take the newest post from each (honors F11; supersedes the literal 1-post spec).
- **History (Q3):** keep posts, prune to the last `K = 7` crawl days.
- **Permissions (Q2):** `<all_urls>` for personal/unpacked distribution now; per-origin `optional_host_permissions` deferred to optional Phase 8, with permission logic isolated behind one module.

## Phase Index

| Phase | Plan | Milestone | Status |
|-------|------|-----------|--------|
| 1 | [Scaffold & storage](./phase-1-scaffold.md) | M1 | ✅ Completed |
| 2 | [Shared lib + unit tests](./phase-2-shared-lib.md) | M3 (test surface) | Planned |
| 3 | [Save sources](./phase-3-save-sources.md) | M2 | Planned |
| 4 | [Crawl orchestrator](./phase-4-crawl-orchestrator.md) | M3 + M4 | Planned |
| 5 | [Scheduling](./phase-5-scheduling.md) | M5 | Planned |
| 6 | [Digest UI + pruning](./phase-6-digest-ui.md) | M6 | Planned |
| 7 | [Polish & release](./phase-7-polish-release.md) | M7 | Planned |
| 8 | [Web Store permissions](./phase-8-webstore-permissions.md) (optional) | — | On Hold |

## Execution Workflow (commit-per-task)

Each task is completed and committed on its own before the next starts. Per task:
1. Implement only that task's scope.
2. Verify it (relevant tests pass / `pnpm typecheck` clean for touched code).
3. Mark the task row `✅` with the date and commit hash in its phase plan.
4. Create exactly one commit: subject `TASK-XXX: <short description>`, ending with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Do not bundle multiple tasks into one commit; do not commit WIP that fails its verification.

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
- **GUD-001**: `src/lib/` is shared, side-effect-free logic with zero `chrome.*` calls, fully unit-testable.
- **GUD-002**: The popup never crawls; it only reads IndexedDB live-bound and messages the worker.
- **GUD-003**: All cross-context messages use the discriminated unions in `src/lib/types.ts`.
- **GUD-004**: Sentence-case UI copy; describe actions by what the user controls.
- **GUD-005**: One commit per task (see Execution Workflow above).
- **PAT-001**: Feed-first, HTML-fallback extraction (ADR-001).
- **PAT-002**: Date-seeded randomness in selection so the list is stable across popup re-opens.

## 2. Implementation Steps

Tasks live in the per-phase plans linked in the **Phase Index** above. Each phase plan contains its own `Implementation Steps` table (TASK-XXX) with completion status and commit hashes. Phase 1 is complete (TASK-001–008); Phases 2–8 are pending.

## 3. Alternatives

- **ALT-001**: Pure HTML scraping as the primary path (ADR-001 Option B). Rejected — brittle, breaks on redesigns, high per-site upkeep; retained only as fallback.
- **ALT-002**: Third-party extraction API (ADR-001 Option C). Rejected — violates the no-backend / privacy constraint.
- **ALT-003**: Jest as the test runner. Rejected in favor of Vitest for native Vite/ESM integration.
- **ALT-004**: `optional_host_permissions` from day one. Deferred to optional Phase 8 — adds a per-origin prompt + denial UI not needed for personal/unpacked use.
- **ALT-005**: Keep only the current day's posts (Q3 alternative). Rejected in favor of pruning to last 7 days.

## 4. Dependencies

- **DEP-001**: pnpm; **DEP-002**: vite + `@crxjs/vite-plugin`; **DEP-003**: typescript; **DEP-004**: react + react-dom; **DEP-005**: dexie + dexie-react-hooks; **DEP-006**: @types/chrome; **DEP-007**: vitest + @vitest/coverage-v8; **DEP-008**: jsdom; **DEP-009**: fake-indexeddb; **DEP-010**: @testing-library/react.

## 5. Files

High-level layout (per-phase files list specifics):
- `src/lib/` — pure logic (types, db, selection, feed, thumbnail, summary, schedule, sources, prune).
- `src/background/` — service worker (crawl orchestrator, scheduling, messaging, optional permissions).
- `src/popup/` — React popup (save, source list, digest UI, settings).
- `tests/` — `tests/lib/*`, `tests/integration/*`, `tests/fixtures/*`.
- Config: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `manifest.config.ts`.

## 6. Testing

Per-phase tests are listed in each phase plan. Program-level targets:
- All four selection N-branches + determinism; RSS 2.0 / Atom / missing-fields parsing; thumbnail fallback chain; next-07:00 math across DST; source upsert idempotency; mocked-`fetch` crawl integration; pruning.
- **`src/lib/` line coverage ≥ 90%** (`pnpm test`).
- No tests depend on live network or a real browser profile.

## 7. Risks & Assumptions

- **RISK-001**: Feed-less sites give poor data → OG-tag fallback; surface `lastError`.
- **RISK-002**: CORS blocks a fetch → `host_permissions` covers it; record + skip.
- **RISK-003**: SW killed mid-crawl → checkpoint queue in `chrome.storage.local`, resume.
- **RISK-004**: crxjs/Vite version drift (v2.7.0 + Vite 8 emits a benign rolldown warning) → pin versions; verify unpacked load.
- **RISK-005**: `<all_urls>` slows a future Web Store review → optional Phase 8 swaps to per-origin permissions.
- **ASSUMPTION-001**: Distribution is personal/unpacked for the MVP (Q2).
- **ASSUMPTION-002**: Q1 = "5 random sources, newest each".
- **ASSUMPTION-003**: History retention K = 7 days (Q3).
- **ASSUMPTION-004**: Tens of sources × ≤5 posts stays within IndexedDB limits.

## 8. Related Specifications / Further Reading

- `docs/DEVELOPMENT_PLAN.md` — requirements, data model, scheduling, selection (source of truth).
- `docs/adr/ADR-001-extraction-strategy.md` — feed-first, HTML-fallback decision.
- `docs/adr/ADR-002-permissions-model.md` — host-permissions trade-offs (drives Phase 8).
- `CLAUDE.md` / `AGENTS.md` — repository conventions and hard constraints.
