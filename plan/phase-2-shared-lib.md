---
goal: Phase 2 — Implement and exhaustively unit-test the side-effect-free src/lib logic
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, library, testing]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Implement the pure logic in `src/lib/` — selection algorithm, feed parser, thumbnail/summary helpers, and scheduling math — with thorough Vitest coverage. This is the project's primary test surface. Phase 2 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F5**: Posts have `title`, `thumbnail`, `summary`, `postUrl`, `sourceUrl`.
- **REQ-F8**: Pull the 5 latest posts per source.
- **REQ-F11**: The preview shows exactly 5 posts (selection §4).
- **PAT-001**: Feed-first extraction (RSS 2.0 + Atom).
- **PAT-002**: Date-seeded randomness so the list is stable across popup re-opens.
- **GUD-001**: No `chrome.*` in `src/lib/`.
- **CON-004**: Parsing uses `DOMParser`, never `document`.
- Q1 resolution: `N > 5` → pick 5 random sources, newest post from each (honors F11).

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 2

- GOAL-002: Implement and unit-test selection, feed parsing, thumbnail/summary, and scheduling math.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-009 | Implement `src/lib/selection.ts`: seeded RNG (mulberry32 seeded from `YYYY-MM-DD`); four N-branches; `N > 5` picks 5 random sources, newest each (isolated in one named function); order by `publishedAt` desc then source name. | | |
| TASK-010 | Implement `src/lib/feed.ts`: `discoverFeedUrl(html, baseUrl)` (`<link rel="alternate">` then probe `/feed`, `/rss`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`) and `parseFeed(xml)` returning up to 5 normalized RSS/Atom entries. | | |
| TASK-011 | Implement `src/lib/thumbnail.ts`: fallback chain `feed media` → `og:image` → first content `<img>` → placeholder. | | |
| TASK-012 | Implement `src/lib/summary.ts`: strip HTML, clamp to ~200 chars. | | |
| TASK-013 | Implement `src/lib/schedule.ts`: `msUntilNext0700(now)` correct across day rollover, time zone, and DST. | | |
| TASK-014 | `tests/lib/selection.test.ts`: cover N==0, N<5, N==5, N>5; determinism; ordering. | | |
| TASK-015 | `tests/lib/feed.test.ts`: RSS 2.0, Atom, missing-fields fixtures; mapping + 5-entry cap. | | |
| TASK-016 | `tests/lib/thumbnail.test.ts`: each rung of the chain incl. placeholder. | | |
| TASK-017 | `tests/lib/schedule.test.ts`: before/after/exactly 07:00 and DST spring-forward / fall-back. | | |
| TASK-018 | Add fixtures under `tests/fixtures/`: `rss-2.0.xml`, `atom.xml`, `feed-missing-fields.xml`, `page-with-feed-link.html`, `page-no-feed.html`. | | |

## 3. Dependencies

- **DEP-007**: vitest + @vitest/coverage-v8; **DEP-008**: jsdom (DOMParser). Depends on Phase 1 (`src/lib/types.ts`).

## 4. Files

- `src/lib/selection.ts`, `src/lib/feed.ts`, `src/lib/thumbnail.ts`, `src/lib/summary.ts`, `src/lib/schedule.ts`.
- `tests/lib/*.test.ts`, `tests/fixtures/*`.

## 5. Testing

- **TEST-001**: Selection — all four N-branches, determinism, ordering.
- **TEST-002**: Feed parsing — RSS 2.0, Atom, missing fields; 5-entry cap.
- **TEST-003**: Thumbnail fallback chain incl. placeholder.
- **TEST-004**: Summary — stripped + clamped to ~200 chars.
- **TEST-005**: Schedule — next-07:00 incl. DST edges.
- **TEST-010**: `src/lib/` line coverage ≥ 90%.

## 6. Risks & Assumptions

- **RISK-001**: Feed-less sites give poor data — surfaced later via fallback.
- **ASSUMPTION-002**: Q1 = "5 random sources, newest each"; reverting changes only the isolated N>5 function.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §3 (crawl strategy), §4 (selection), §10 (testing)
- `docs/adr/ADR-001-extraction-strategy.md`
