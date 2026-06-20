---
goal: Phase 7 — Polish, verification, and release-readiness for personal/unpacked distribution
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Planned'
tags: [feature, polish, release]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Add icons, run the full verification gates, and document the manual test matrix so the unpacked extension is review-ready (milestone **M7**). Phase 7 of the [master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **CON-005**: TypeScript strict; zero typecheck errors.
- **TEST-010**: `src/lib/` coverage ≥ 90%.
- **GUD-004**: Sentence-case UI copy.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 7

- GOAL-007: Icons, verification, documentation.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-037 | Add extension icons (16/32/48/128) and finalize the placeholder thumbnail asset. | | |
| TASK-038 | Run `pnpm typecheck` (0 errors), `pnpm test` with coverage (lib ≥ 90%), `pnpm build`; load unpacked `dist/` in Chrome and verify F1–F12 manually. | | |
| TASK-039 | Update `README.md` status section; document the manual test matrix (RSS, Atom-only, feed-less, paywalled → graceful `lastError`). | | |

## 3. Dependencies

- All prior phases complete. **DEP-007**: @vitest/coverage-v8.

## 4. Files

- `public/` (icons + thumbnail), `manifest.config.ts` (icon refs), `README.md`.

## 5. Testing

- **TEST-010**: Coverage gate `src/lib/` ≥ 90%.
- Manual matrix: RSS blog, Atom-only, feed-less, paywalled (graceful failure in `source.lastError`).

## 6. Risks & Assumptions

- **RISK-004**: crxjs/Vite build warnings revisited before release.
- **ASSUMPTION-001**: Personal/unpacked target; public listing is Phase 8.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §9 (milestones), §10 (testing)
- `CLAUDE.md` "Before opening a PR"
