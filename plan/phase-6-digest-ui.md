---
goal: Phase 6 — Daily 5-post digest preview UI and post pruning
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, ui, selection]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Render the day's 5-post digest (thumbnail + summary + click-through) using the §4 selection algorithm, with empty/loading/error states and history pruning (milestone **M6**; REQ-F9, F10, F11; Q3). Phase 6 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F9**: On open, preview the day's latest posts.
- **REQ-F10**: Each item shows thumbnail + summary + a link to the original `postUrl`.
- **REQ-F11**: Show exactly 5 posts (selection §4).
- **PAT-002**: Date-seeded selection, stable across re-opens.
- **GUD-004**: Sentence-case UI copy.
- Q3 resolution: keep posts, prune to the last `K = 7` crawl days.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 6

- GOAL-006: Digest preview UI, states, and pruning.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-033 | Popup: live-query today's posts (`crawlDay` == local today), run `src/lib/selection.ts`, render exactly 5 items (thumbnail + summary + link opening `postUrl` in a new tab). | | |
| TASK-034 | Empty / loading / error states (no sources, crawl in progress, all-failed surfacing `lastError`). | | |
| TASK-035 | `src/lib/prune.ts`: delete posts older than `K = 7` crawl days; call after each `crawlAll()`. | | |
| TASK-036 | `tests/lib/prune.test.ts` (fake-indexeddb): old posts removed, recent retained. | | |

## 3. Dependencies

- Phase 2 (`selection.ts`), Phase 4 (posts populated), Phase 1 (`db.ts`). **DEP-010**: @testing-library/react (optional popup test).

## 4. Files

- `src/popup/App.tsx` (+ list/item components), `src/lib/prune.ts`, `tests/lib/prune.test.ts`.

## 5. Testing

- **TEST-008**: Prune — posts older than K=7 days removed, recent retained.
- **TEST-009** (optional): Popup renders exactly 5 items and the empty state.

## 6. Risks & Assumptions

- **RISK-005 / Q1**: `N > 5` resolved to "5 random sources, newest each" — honors F11.
- **ASSUMPTION-004**: K = 7 days retention; a single constant change adjusts it.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §4 (selection), §5 (pruning)
