---
goal: Phase 5 — Scheduling and manual refresh that survive service-worker eviction
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, scheduling, background]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Crawl on startup and on a daily 07:00 local alarm, plus a manual refresh — all resilient to SW eviction (milestone **M5**; REQ-F6, F7). Phase 5 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F6**: Auto-crawl on browser startup.
- **REQ-F7**: Optional daily crawl at 07:00 local time.
- **CON-002**: No reliance on in-memory state; persist to `chrome.storage.local`.
- **CON-003**: Use `chrome.alarms`, never `setInterval`/`setTimeout`.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 5

- GOAL-005: Startup crawl, 07:00 alarm, manual refresh, eviction-safe resume.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-029 | On `chrome.runtime.onStartup`, enqueue `crawlAll()`. | | |
| TASK-030 | Daily 07:00 alarm: compute `msUntilNext0700` (`src/lib/schedule.ts`), set a one-shot `chrome.alarms`; on fire, crawl then reschedule. Gate on `Settings.enableDailyCron`. | | |
| TASK-031 | Popup "Refresh now" button → `CRAWL_ALL`; reflect in-progress state from the checkpoint flag. | | |
| TASK-032 | Options/settings surface to toggle `enableDailyCron`; persist to `chrome.storage.local`. | | |

## 3. Dependencies

- Phase 2 (`schedule.ts`) and Phase 4 (`crawlAll`). Chrome `alarms` + `storage` permissions (Phase 1 manifest).

## 4. Files

- `src/background/index.ts` (startup + alarm + message wiring), `src/popup/App.tsx` (refresh + settings toggle).

## 5. Testing

- **TEST-005**: `msUntilNext0700` is covered in Phase 2 (DST/TZ edges). Alarm wiring verified manually (TASK-038, Phase 7).

## 6. Risks & Assumptions

- **RISK-003**: SW killed mid-crawl — resume via checkpoint queue.
- **ASSUMPTION-003**: Browser local time (the `Date` the SW sees) is the basis for 07:00.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §6 (scheduling)
