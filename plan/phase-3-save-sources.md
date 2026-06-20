---
goal: Phase 3 — Save sources via popup and context menu with a deletable, persisted list
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, ui, storage]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Let the user save the current page (or a right-clicked link) as a source and manage a deletable list persisted in IndexedDB (milestone **M2**; REQ-F1, F2, F3, F12). Phase 3 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F1**: Save the current page URL as a source.
- **REQ-F2**: List and delete sources.
- **REQ-F3**: Persist locally in IndexedDB.
- **REQ-F12**: Context-menu item saves the current page or right-clicked link.
- **GUD-002**: The popup never crawls; it reads live and messages the worker.
- **GUD-003**: Use the `WorkerRequest`/`WorkerResponse` unions; no ad-hoc shapes.
- **CON-006**: Upsert by unique `url`; idempotent.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 3

- GOAL-003: Source save (popup + context menu) and a deletable live-bound list.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-019 | Implement `src/lib/sources.ts`: `addSource(url, title?)` (upsert by unique `url`), `deleteSource(id)`, `listSources()` — pure DB ops, no `chrome.*`. | | |
| TASK-020 | Register `chrome.contextMenus` "Save to dev-corner" (`contexts: ['page','link']`) on install; on click resolve target URL and call `addSource`. | | |
| TASK-021 | Implement worker `SAVE_SOURCE` / `DELETE_SOURCE` handlers using the typed unions; respond with typed results. | | |
| TASK-022 | Popup "Save current page" (`chrome.tabs.query` → `SAVE_SOURCE`); source list via `useLiveQuery` with a delete control. | | |
| TASK-023 | `tests/lib/sources.test.ts` (fake-indexeddb): upsert-by-url idempotency and delete. | | |

## 3. Dependencies

- Phase 1 (`db.ts`, `types.ts`) and Phase 2 (lib conventions). **DEP-009**: fake-indexeddb (tests).

## 4. Files

- `src/lib/sources.ts`; `src/background/index.ts` (context menu + handlers); `src/popup/App.tsx` (save + list); `tests/lib/sources.test.ts`.

## 5. Testing

- **TEST-006**: Source upsert-by-url idempotency and delete (fake-indexeddb).

## 6. Risks & Assumptions

- **ASSUMPTION-001**: `<all_urls>` granted, so saved origins are crawlable without a per-origin prompt (Phase 8 changes this).

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §7 (context menu), §5 (data model)
