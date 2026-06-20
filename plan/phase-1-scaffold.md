---
goal: Phase 1 — Scaffold the MV3 + Vite + crxjs + TypeScript project with pnpm, Vitest, shared types, and the Dexie schema
version: 1.0
date_created: 2026-06-20
last_updated: 2026-06-20
owner: Huy Nguyen
status: 'Completed'
tags: [feature, scaffold, mv3, tooling]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Establish the project skeleton so the unpacked extension loads and IndexedDB opens (milestone **M1**). This is Phase 1 of the [dev-corner MVP master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **CON-001**: No backend, hosted API, or remote DB.
- **CON-005**: TypeScript strict mode; no `any`.
- **GUD-001**: `src/lib/` is side-effect-free; zero `chrome.*` calls.
- **GUD-003**: Cross-context messages use discriminated unions in `src/lib/types.ts`.
- **GUD-005**: One commit per task (see master plan execution workflow).
- **PKG-001**: pnpm is the package manager; **TEST-RUN-001**: Vitest is the test runner.

## 2. Implementation Steps

> One commit per task: `TASK-XXX: <description>` with the `Co-Authored-By` trailer.

### Implementation Phase 1

- GOAL-001: Scaffold tooling, shared types, and the Dexie schema; verify the extension builds and loads.

| Task | Description | Completed | Commit |
|------|-------------|-----------|--------|
| TASK-001 | Initialize the project with pnpm: `package.json` with `"packageManager": "pnpm@11.5.2"`, scripts `dev`, `build`, `test`, `test:watch`, `typecheck`, `lint`; `.gitignore`; lockfile via `pnpm install`. | ✅ 2026-06-20 | `924df13` |
| TASK-002 | Add toolchain deps: `vite`, `@crxjs/vite-plugin`, `typescript`, `react`, `react-dom`, `dexie`, `dexie-react-hooks`, `@types/chrome`, `vitest`, `@testing-library/react`, `jsdom`. Added required peers: `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@vitest/coverage-v8`, `fake-indexeddb`, `eslint`, `@eslint/js`, `typescript-eslint`. | ✅ 2026-06-20 | `8e8ed8e` |
| TASK-003 | Create strict `tsconfig.json` and `vite.config.ts` wiring `@crxjs/vite-plugin` to `manifest.config.ts`. | ✅ 2026-06-20 | `6346231` |
| TASK-004 | Create `vitest.config.ts`, `globals: true`, coverage via `@vitest/coverage-v8`. Deviation: jsdom used project-wide because lib parsers depend on `DOMParser` (absent in Node). | ✅ 2026-06-20 | `0007dc4` |
| TASK-005 | Author `manifest.config.ts`: MV3, `permissions: [storage, alarms, contextMenus, notifications]`, `host_permissions: ['<all_urls>']`, background SW (`type: module`), popup `action`. | ✅ 2026-06-20 | `2c918a9` |
| TASK-006 | Create `src/lib/types.ts`: `Source`, `Post`, `Settings` interfaces (§5) and the `WorkerRequest`/`WorkerResponse` discriminated unions. | ✅ 2026-06-20 | `3abf83f` |
| TASK-007 | Create `src/lib/db.ts`: Dexie subclass `DevCornerDB` with `sources` and `posts` stores; export singleton `db`. | ✅ 2026-06-20 | `1f40087` |
| TASK-008 | Add placeholder entry points `src/background/index.ts`, `src/popup/main.tsx`, `src/popup/App.tsx`, `src/popup/index.html`, and `public/placeholder.svg`. | ✅ 2026-06-20 | `dd4cde2` |

## 3. Dependencies

- **DEP-001**: pnpm; **DEP-002**: vite + `@crxjs/vite-plugin`; **DEP-003**: typescript; **DEP-004**: react + react-dom; **DEP-005**: dexie + dexie-react-hooks; **DEP-006**: @types/chrome; **DEP-007**: vitest + @vitest/coverage-v8; **DEP-008**: jsdom; **DEP-009**: fake-indexeddb; **DEP-010**: @testing-library/react.

## 4. Files

- `package.json`, `.gitignore`, `pnpm-lock.yaml` — project + deps.
- `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `manifest.config.ts` — config.
- `src/lib/types.ts`, `src/lib/db.ts` — shared types + Dexie schema.
- `src/background/index.ts`, `src/popup/{index.html,main.tsx,App.tsx}`, `public/placeholder.svg` — entry points.

## 5. Testing

- **TEST-P1-001**: `pnpm typecheck` is clean. ✅
- **TEST-P1-002**: `pnpm build` emits a valid `dist/manifest.json`, popup, and service worker. ✅

## 6. Risks & Assumptions

- **RISK-004**: `@crxjs/vite-plugin` (v2.7.0) emits a benign `rollupOptions` vs `rolldownOptions` warning under Vite 8 — monitored, not an error.
- **ASSUMPTION-001**: Personal/unpacked distribution; `<all_urls>` is acceptable.
- Resolved versions are newer than originally assumed (React 19, Vite 8, TypeScript 6, ESLint 10); all build and typecheck cleanly.

## 7. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- `docs/DEVELOPMENT_PLAN.md` §5 (data model), §2 (architecture)
- `docs/adr/ADR-002-permissions-model.md`
