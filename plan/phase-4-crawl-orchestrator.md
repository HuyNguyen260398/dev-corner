---
goal: Phase 4 — Crawl orchestrator with feed-first / HTML-fallback extraction and idempotent upserts
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, crawler, background]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Implement the service-worker crawl orchestrator: feed-first with HTML fallback, mapping to `Post` rows with idempotent upserts (milestones **M3 + M4**; REQ-F4, F5, F8). Phase 4 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F4**: Extract latest posts from each source.
- **REQ-F5**: Each post has the five required fields.
- **REQ-F8**: Newest 5 posts per source.
- **PAT-001**: Feed-first, HTML-fallback (ADR-001).
- **CON-002**: SW is ephemeral — checkpoint crawl progress in `chrome.storage.local`.
- **CON-004**: `DOMParser` only; **CON-006**: upsert on `&postUrl`.
- **SEC-001**: Only fetch user-saved sources; no third-party calls.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 4

- GOAL-004: Implement and integration-test the crawl orchestrator.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-024 | `src/background/crawl.ts`: `crawlSource(source)` — fetch page, resolve feed (cache `feedUrl`), parse newest 5; on no feed, HTML heuristic (`<article> a`, `h2 a`, `h3 a`, de-dupe, first 5) + OG tags. | | |
| TASK-025 | Map entries to `Post` (`crawlDay` local `YYYY-MM-DD`, `crawledAt`, `sourceId`, `sourceUrl`); `put` (upsert on `&postUrl`); set `lastCrawledAt`; capture failures to `lastError`. | | |
| TASK-026 | `crawlAll()` iterating sources with a checkpoint queue in `chrome.storage.local` so an evicted SW resumes. | | |
| TASK-027 | Wire `CRAWL_SOURCE` / `CRAWL_ALL` messages; one-source crawl right after a context-menu save. | | |
| TASK-028 | `tests/integration/crawl.test.ts`: mock `global.fetch` with Phase-2 fixtures; assert `posts` rows, re-crawl idempotency, and `lastError` on failure. | | |

## 3. Dependencies

- Phase 2 (`feed.ts`, `thumbnail.ts`, `summary.ts`) and Phase 1 (`db.ts`, `types.ts`). **DEP-009**: fake-indexeddb; mocked `fetch`.

## 4. Files

- `src/background/crawl.ts`, `src/background/index.ts` (message wiring); `tests/integration/crawl.test.ts`.

## 5. Testing

- **TEST-007**: Mocked-`fetch` crawl — correct `posts` rows, idempotency on re-crawl (`&postUrl`), `lastError` capture on failure.

## 6. Risks & Assumptions

- **RISK-001**: Feed-less sites yield thinner data — OG fallback; surface `lastError`.
- **RISK-002**: CORS — covered by `host_permissions`; record + skip on failure.
- **RISK-003**: SW killed mid-crawl — checkpoint to `chrome.storage.local`, resume.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §3 (crawl strategy), §11 (risks)
- `docs/adr/ADR-001-extraction-strategy.md`
