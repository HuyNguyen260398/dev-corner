---
goal: Phase 8 (Optional) — Switch to least-privilege per-origin permissions for a public Web Store listing
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'On Hold'
tags: [feature, permissions, web-store, optional]
---

# Introduction

![Status: On Hold](https://img.shields.io/badge/status-On%20Hold-orange)

Optional phase: replace `<all_urls>` with per-origin `optional_host_permissions` requested at save time (ADR-002 Option B). **Execute only if the distribution target (Q2) becomes a public Web Store listing.** Phase 8 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **SEC-002**: `host_permissions` as narrow as the distribution target allows.
- **GUD-002**: Popup messages the worker; permission requests happen at save time.
- Must handle permission denial gracefully (mark source "needs permission", offer re-request).

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 8

- GOAL-008: Per-origin permission model for least-privilege distribution.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-040 | Replace `host_permissions: ['<all_urls>']` with `optional_host_permissions`; isolate all permission checks/requests in `src/background/permissions.ts`. | | |
| TASK-041 | On source save, `chrome.permissions.request({ origins: ['https://<host>/*'] })`; on denial mark the source "needs permission" and offer re-request in the UI. | | |
| TASK-042 | Skip crawling sources lacking granted origin permission; surface the state in the source list. | | |

## 3. Dependencies

- Phases 3 (save flow) and 4 (crawl) complete. Chrome `permissions` API.

## 4. Files

- `manifest.config.ts` (optional_host_permissions), `src/background/permissions.ts`, `src/background/crawl.ts` (skip ungranted), `src/popup/App.tsx` (denial UI).

## 5. Testing

- Manual: save a new origin → prompt appears; deny → source marked "needs permission" and is skipped; re-request grants and enables crawl.

## 6. Risks & Assumptions

- **RISK-005**: `<all_urls>` slows Web Store review — this phase resolves it.
- **ASSUMPTION**: Crawler code is otherwise identical (ADR-002); this is a config + permission-flow change, not an architectural one.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/adr/ADR-002-permissions-model.md` (Option B + action items)
- `docs/DEVELOPMENT_PLAN.md` §8 (permissions)
