---
goal: Add independently persisted favorite posts and reorganize the popup into Daily Posts, Favorite Posts, and Sources tabs
version: 1.0
date_created: 2026-06-27
last_updated: 2026-06-27
owner: Huy Nguyen
status: 'Planned'
tags: [feature, indexeddb, dexie, react, popup, accessibility, testing]
---

# Favorites and Tabbed Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users persist and remove favorite posts while navigating a three-tab popup that always opens on Daily Posts.

**Architecture:** Add a Dexie version 2 `favoritePosts` snapshot table and pure persistence functions in `src/lib/favorites.ts`. Route writes through new typed service-worker messages; keep the popup read-only with Dexie live queries, focused tab components, shared post cards, and fixed bottom navigation.

**Tech Stack:** TypeScript 6 strict mode, React 19, Dexie 4, dexie-react-hooks, Chrome Manifest V3, Vitest 4, Testing Library, fake-indexeddb, CSS.

---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan implements the approved [favorites and tabbed popup design](../docs/superpowers/specs/2026-06-27-favorites-and-tabbed-popup-design.md). It is one cohesive increment: UI work depends on the favorite schema and typed worker boundary, while the worker behavior depends on the persistence functions. Complete tasks in numeric order. Each task requires its own passing commit and an immediate user-facing completion update before work starts on the next task.

## Execution Rules

- Read `AGENTS.md`, `docs/DEVELOPMENT_PLAN.md`, and both ADRs before implementation.
- Use test-driven development: add a failing behavior test, run it, implement the smallest complete change, and rerun it.
- Do not write directly to IndexedDB from popup components. All add/remove favorite writes go through `WorkerRequest`.
- Do not change `src/lib/selection.ts`, crawl behavior, retention policy, manifest permissions, or network behavior.
- Keep all `src/lib/` modules free of `chrome.*` calls and all message switches exhaustive.
- Run the task-specific command before each task commit. Run the complete validation matrix in TASK-008.
- Never combine multiple tasks in one commit, defer a task commit, or batch multiple task-completion updates.
- A task is complete only after its validation passes, its dedicated commit is created, and the user has been informed. If validation or commit creation fails, leave the task incomplete and inform the user of the blocker.

## Per-Task Completion Protocol

Apply this protocol at the end of every task, including TASK-008:

1. Run every validation command specified by the task and confirm the expected result.
2. Stage only the files listed in that task and create exactly one commit with the task's specified commit subject.
3. Run `git rev-parse --short HEAD` and confirm the resulting commit is the task commit.
4. Immediately inform the user with a progress update containing:
   - the task identifier and title;
   - the short commit hash and commit subject;
   - the validation commands and whether each passed;
   - any scope note, risk, or blocker, using `None` when there is nothing to report.
5. Send the update before starting the next task. The update is informational and does not require a user reply unless it reports a blocker or requests a design decision.

Format every update as five lines labeled `Task`, `Commit`, `Validation`, `Notes`, and `Next`, in that order. The `Task` line must contain the completed task identifier and title. The `Commit` line must contain the short hash and subject. The `Validation` line must name every task command and its result. The `Notes` line must contain either a concrete note or `None`. The `Next` line must name the next task, except TASK-008 must use `Implementation complete`.

## Dependency Graph

```text
TASK-001 schema/type foundation
    └── TASK-002 favorite persistence
            └── TASK-003 worker messages
                    └── TASK-004 shared popup components
                            ├── TASK-005 Daily/Favorite tabs
                            └── TASK-006 Sources tab/App integration
                                    └── TASK-007 styling/docs
                                            └── TASK-008 full validation
```

## 1. Requirements & Constraints

- **REQ-001**: A user can favorite any post displayed in the daily digest.
- **REQ-002**: A user can remove a favorite from Daily Posts or Favorite Posts.
- **REQ-003**: Favorite Posts are stored in a dedicated IndexedDB table named `favoritePosts`.
- **REQ-004**: A favorite stores a complete display snapshot and survives source deletion and post pruning.
- **REQ-005**: `postUrl` uniquely identifies favorite membership; duplicate add and repeated remove operations are idempotent.
- **REQ-006**: Favorite Posts are ordered by `favoritedAt` descending.
- **REQ-007**: The popup exposes Daily Posts, Favorite Posts, and Sources through fixed bottom navigation.
- **REQ-008**: Every popup mount selects Daily Posts; active-tab state is not persisted.
- **REQ-009**: Sources owns subscribe, saved-source, permission-recovery, scheduling, notification, and last-crawl controls.
- **REQ-010**: Favorite controls expose post-specific labels, `aria-pressed`, pending disabled state, and a minimum 44-by-44-pixel target.
- **REQ-011**: Bottom navigation exposes its selected item through `aria-current="page"`.
- **SEC-001**: No backend, remote database, telemetry, synchronization, or new network request is allowed.
- **CON-001**: The MV3 service worker remains the only writer and the only context allowed to crawl.
- **CON-002**: The popup may read IndexedDB through `useLiveQuery`; it must send typed messages for writes.
- **CON-003**: TypeScript remains strict; do not introduce `any`, non-exhaustive request handling, or inline message shapes.
- **CON-004**: Dexie schema version 2 must retain the existing version 1 `sources` and `posts` schemas and data.
- **CON-005**: Do not modify digest selection, including the current `N > 5` branch.
- **CON-006**: Do not modify seven-day post retention; pruning must never access `favoritePosts`.
- **CON-007**: Do not modify `manifest.config.ts` or request new Chrome permissions.
- **GUD-001**: Keep `src/lib/favorites.ts` deterministic except for its injected/default `Date.now()` timestamp.
- **GUD-002**: Keep UI units focused: `App` orchestrates; tabs render; `PostCard` and `BottomNav` remain presentational.
- **PAT-001**: One task produces one passing commit using the commit subject defined in that task.
- **PAT-002**: One task produces one immediate user-facing completion update after its commit and before the next task begins.

## 2. Implementation Steps

### Implementation Phase 1: IndexedDB and Favorite Domain

- GOAL-001: Add a backward-compatible schema and idempotent favorite persistence API.

| Task | Description | Depends On | Completed | Date |
|------|-------------|------------|-----------|------|
| TASK-001 | Add `FavoritePost`, parameterized test DB construction, Dexie version 2, and a migration test. | None | | |
| TASK-002 | Add tested favorite snapshot, idempotency, ordering, fallback, and retention-independent operations. | TASK-001 | | |

### TASK-001: Favorite Type and Dexie Version 2

**Files:**
- Modify: `src/lib/types.ts` after `Post`
- Modify: `src/lib/db.ts` class fields and constructor
- Create: `tests/lib/db.test.ts`

- [ ] **Step 1: Write the failing database-upgrade test**

Create `tests/lib/db.test.ts` with a unique database name, seed a literal version 1 database, then open it with production `DevCornerDB`:

```ts
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DevCornerDB } from '../../src/lib/db'

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('DevCornerDB schema upgrades', () => {
  it('adds favoritePosts without losing version 1 sources or posts', async () => {
    const name = `dev-corner-upgrade-${crypto.randomUUID()}`
    databaseNames.push(name)

    const legacy = new Dexie(name)
    legacy.version(1).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
    })
    await legacy.table('sources').add({
      id: 1,
      url: 'https://source.test',
      title: 'Source',
      addedAt: 1,
    })
    await legacy.table('posts').add({
      id: 1,
      sourceId: 1,
      sourceUrl: 'https://source.test',
      title: 'Post',
      summary: 'Summary',
      postUrl: 'https://source.test/post',
      crawledAt: 2,
      crawlDay: '2026-06-27',
    })
    legacy.close()

    const upgraded = new DevCornerDB(name)
    await upgraded.open()

    await expect(upgraded.sources.count()).resolves.toBe(1)
    await expect(upgraded.posts.count()).resolves.toBe(1)
    await expect(upgraded.favoritePosts.count()).resolves.toBe(0)
    expect(upgraded.tables.map((table) => table.name).sort()).toEqual([
      'favoritePosts',
      'posts',
      'sources',
    ])
    upgraded.close()
  })
})
```

- [ ] **Step 2: Run the test and verify the missing API failure**

Run: `pnpm test -- tests/lib/db.test.ts`

Expected: FAIL at TypeScript transformation because `DevCornerDB` does not accept a database name and has no `favoritePosts` property.

- [ ] **Step 3: Add the favorite snapshot type and schema**

Add to `src/lib/types.ts` immediately after `Post`:

```ts
/** A favorite retained independently from source and post lifecycle operations. */
export interface FavoritePost {
  id?: number
  /** Original post URL and unique favorite identity. */
  postUrl: string
  title: string
  summary: string
  thumbnail?: string
  sourceUrl: string
  /** Snapshot used after the source record is removed. */
  sourceTitle: string
  publishedAt?: number
  crawledAt: number
  favoritedAt: number
}
```

Replace the import, fields, and constructor in `src/lib/db.ts` with this version while retaining the existing version 1 declaration:

```ts
import Dexie, { type Table } from 'dexie'
import type { FavoritePost, Post, Source } from './types'

export class DevCornerDB extends Dexie {
  sources!: Table<Source, number>
  posts!: Table<Post, number>
  favoritePosts!: Table<FavoritePost, number>

  constructor(name = 'dev-corner') {
    super(name)
    this.version(1).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
    })
    this.version(2).stores({
      sources: '++id, &url, feedUrl, lastCrawledAt',
      posts: '++id, sourceId, &postUrl, crawlDay, publishedAt',
      favoritePosts: '++id, &postUrl, favoritedAt, publishedAt, sourceUrl',
    })
  }
}

export const db = new DevCornerDB()
```

- [ ] **Step 4: Run focused and existing persistence tests**

Run: `pnpm test -- tests/lib/db.test.ts tests/lib/sources.test.ts tests/lib/prune.test.ts`

Expected: all selected tests PASS and the migration test reports one source, one post, and zero favorites.

- [ ] **Step 5: Commit TASK-001 and inform the user**

```bash
git add src/lib/types.ts src/lib/db.ts tests/lib/db.test.ts
git commit -m "feat: add favorite posts schema"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-001 update before starting TASK-002.

### TASK-002: Favorite Persistence API

**Files:**
- Create: `src/lib/favorites.ts`
- Create: `tests/lib/favorites.test.ts`
- Modify: test cleanup in `tests/lib/prune.test.ts`, `tests/lib/sources.test.ts`, and `tests/popup/App.test.tsx`

- [ ] **Step 1: Write failing favorite-domain tests**

Create `tests/lib/favorites.test.ts`. Use `vi.setSystemTime(new Date('2026-06-27T09:00:00Z'))` and reset timers after each test. Cover these exact cases:

```ts
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import { addFavorite, listFavorites, removeFavorite } from '../../src/lib/favorites'
import type { Post, Source } from '../../src/lib/types'

beforeEach(async () => {
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
  vi.setSystemTime(new Date('2026-06-27T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('favorite persistence', () => {
  it('creates an independent display snapshot', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())

    const favoriteId = await addFavorite(postId)

    await expect(db.favoritePosts.get(favoriteId)).resolves.toMatchObject({
      postUrl: 'https://source.test/post',
      title: 'Post',
      summary: 'Summary',
      thumbnail: 'https://source.test/thumb.jpg',
      sourceUrl: 'https://source.test',
      sourceTitle: 'Source title',
      publishedAt: 100,
      crawledAt: 200,
      favoritedAt: Date.parse('2026-06-27T09:00:00Z'),
    })
  })

  it('uses the source host when the source row no longer exists', async () => {
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await expect(db.favoritePosts.toCollection().first()).resolves.toMatchObject({
      sourceTitle: 'source.test',
    })
  })

  it('preserves one row and the original timestamp on duplicate add', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())
    const firstId = await addFavorite(postId)
    vi.setSystemTime(new Date('2026-06-28T09:00:00Z'))

    const secondId = await addFavorite(postId)

    expect(secondId).toBe(firstId)
    await expect(db.favoritePosts.count()).resolves.toBe(1)
    await expect(db.favoritePosts.get(firstId)).resolves.toMatchObject({
      favoritedAt: Date.parse('2026-06-27T09:00:00Z'),
    })
  })

  it('removes by postUrl and treats repeated removal as success', async () => {
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await removeFavorite('https://source.test/post')
    await expect(removeFavorite('https://source.test/post')).resolves.toBeUndefined()
    await expect(db.favoritePosts.count()).resolves.toBe(0)
  })

  it('retains favorites after source and post deletion', async () => {
    await db.sources.add(source())
    const postId = await db.posts.add(post())
    await addFavorite(postId)
    await db.sources.delete(1)
    await db.posts.delete(postId)
    await expect(db.favoritePosts.count()).resolves.toBe(1)
  })

  it('lists favorites newest-favorited first', async () => {
    const firstPostId = await db.posts.add(post())
    await addFavorite(firstPostId)
    vi.setSystemTime(new Date('2026-06-28T09:00:00Z'))
    const secondPostId = await db.posts.add(post({
      postUrl: 'https://source.test/second',
      title: 'Second',
    }))
    await addFavorite(secondPostId)
    expect((await listFavorites()).map((favorite) => favorite.title)).toEqual(['Second', 'Post'])
  })

  it('rejects a missing post with a user-safe message', async () => {
    await expect(addFavorite(999)).rejects.toThrow('Post 999 is no longer available.')
  })
})

function source(): Source {
  return { id: 1, url: 'https://source.test', title: 'Source title', addedAt: 1 }
}

function post(overrides: Partial<Post> = {}): Post {
  return {
    sourceId: 1,
    sourceUrl: 'https://source.test',
    title: 'Post',
    summary: 'Summary',
    thumbnail: 'https://source.test/thumb.jpg',
    postUrl: 'https://source.test/post',
    publishedAt: 100,
    crawledAt: 200,
    crawlDay: '2026-06-27',
    ...overrides,
  }
}
```

- [ ] **Step 2: Run the test and verify the module failure**

Run: `pnpm test -- tests/lib/favorites.test.ts`

Expected: FAIL because `src/lib/favorites.ts` does not exist.

- [ ] **Step 3: Implement transactional idempotent operations**

Create `src/lib/favorites.ts`:

```ts
import { db } from './db'
import type { FavoritePost } from './types'

export async function addFavorite(postId: number): Promise<number> {
  return db.transaction('rw', db.posts, db.sources, db.favoritePosts, async () => {
    const post = await db.posts.get(postId)
    if (post === undefined) throw new Error(`Post ${postId} is no longer available.`)

    const existing = await db.favoritePosts.get({ postUrl: post.postUrl })
    if (existing?.id !== undefined) return existing.id

    const source = await db.sources.get(post.sourceId)
    const favorite: FavoritePost = {
      postUrl: post.postUrl,
      title: post.title,
      summary: post.summary,
      sourceUrl: post.sourceUrl,
      sourceTitle: source?.title ?? sourceHost(post.sourceUrl),
      crawledAt: post.crawledAt,
      favoritedAt: Date.now(),
      ...(post.thumbnail !== undefined ? { thumbnail: post.thumbnail } : {}),
      ...(post.publishedAt !== undefined ? { publishedAt: post.publishedAt } : {}),
    }
    return db.favoritePosts.add(favorite)
  })
}

export async function removeFavorite(postUrl: string): Promise<void> {
  const existing = await db.favoritePosts.get({ postUrl })
  if (existing?.id !== undefined) await db.favoritePosts.delete(existing.id)
}

export function listFavorites(): Promise<FavoritePost[]> {
  return db.favoritePosts.orderBy('favoritedAt').reverse().toArray()
}

function sourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'Saved source'
  }
}
```

- [ ] **Step 4: Isolate all database-backed tests**

Add `await db.favoritePosts.clear()` before clearing posts/sources in the `beforeEach` hooks of `tests/lib/prune.test.ts`, `tests/lib/sources.test.ts`, and `tests/popup/App.test.tsx`. This prevents favorites created in later tests from leaking across files when Vitest reuses the singleton database.

- [ ] **Step 5: Run domain and regression tests**

Run: `pnpm test -- tests/lib/favorites.test.ts tests/lib/db.test.ts tests/lib/prune.test.ts tests/lib/sources.test.ts`

Expected: all selected tests PASS; the duplicate-add test reports one favorite and unchanged `favoritedAt`.

- [ ] **Step 6: Commit TASK-002 and inform the user**

```bash
git add src/lib/favorites.ts tests/lib/favorites.test.ts tests/lib/prune.test.ts tests/lib/sources.test.ts tests/popup/App.test.tsx
git commit -m "feat: add favorite persistence operations"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-002 update before starting TASK-003.

### Implementation Phase 2: Typed Service-Worker Boundary

- GOAL-002: Expose favorite writes through exhaustive typed messages without adding permissions.

| Task | Description | Depends On | Completed | Date |
|------|-------------|------------|-----------|------|
| TASK-003 | Add favorite request/response types, service-worker handlers, and message-level tests. | TASK-002 | | |

### TASK-003: Worker Favorite Messages

**Files:**
- Modify: `src/lib/types.ts` `WorkerRequest` and successful `WorkerResponse`
- Modify: `src/background/index.ts` imports and exhaustive message switch
- Create: `tests/background/favorites-messages.test.ts`

- [ ] **Step 1: Write failing worker-message tests**

Create `tests/background/favorites-messages.test.ts`. Before dynamically importing the worker, stub Chrome registration APIs and capture the runtime listener:

```ts
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../../src/lib/types'

type RuntimeListener = (
  message: WorkerRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: WorkerResponse) => void,
) => boolean | undefined

let listener: RuntimeListener

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('chrome', chromeStub())
  await import('../../src/background/index')
  const addListener = chrome.runtime.onMessage.addListener as unknown as ReturnType<typeof vi.fn>
  listener = addListener.mock.calls[0]?.[0] as RuntimeListener
  const { db } = await import('../../src/lib/db')
  await db.favoritePosts.clear()
  await db.posts.clear()
  await db.sources.clear()
  await db.sources.add({ id: 1, url: 'https://source.test', title: 'Source', addedAt: 1 })
  await db.posts.add({
    id: 1,
    sourceId: 1,
    sourceUrl: 'https://source.test',
    title: 'Post',
    summary: 'Summary',
    postUrl: 'https://source.test/post',
    crawledAt: 1,
    crawlDay: '2026-06-27',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('favorite worker messages', () => {
  it('adds and removes a favorite through the runtime listener', async () => {
    const addResponse = vi.fn<(response: WorkerResponse) => void>()
    expect(listener({ type: 'ADD_FAVORITE', postId: 1 }, {}, addResponse)).toBe(true)
    await vi.waitFor(() =>
      expect(addResponse).toHaveBeenCalledWith({
        ok: true,
        favoriteId: expect.any(Number),
      }),
    )

    const removeResponse = vi.fn<(response: WorkerResponse) => void>()
    expect(
      listener({ type: 'REMOVE_FAVORITE', postUrl: 'https://source.test/post' }, {}, removeResponse),
    ).toBe(true)
    await vi.waitFor(() => expect(removeResponse).toHaveBeenCalledWith({ ok: true }))
  })

  it('returns a standard error response when the post is missing', async () => {
    const sendResponse = vi.fn<(response: WorkerResponse) => void>()
    listener({ type: 'ADD_FAVORITE', postId: 999 }, {}, sendResponse)
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: 'Post 999 is no longer available.',
      }),
    )
  })
})

function chromeStub(): typeof chrome {
  const event = { addListener: vi.fn() }
  return {
    runtime: {
      onInstalled: event,
      onStartup: event,
      onMessage: { addListener: vi.fn() },
    },
    contextMenus: { create: vi.fn(), onClicked: event },
    alarms: { onAlarm: event },
    notifications: { onClicked: event },
  } as unknown as typeof chrome
}
```

- [ ] **Step 2: Run the test and verify the union failure**

Run: `pnpm test -- tests/background/favorites-messages.test.ts`

Expected: FAIL because `ADD_FAVORITE` and `REMOVE_FAVORITE` are not members of `WorkerRequest` and the worker has no cases for them.

- [ ] **Step 3: Extend the message contract**

Add these variants to `WorkerRequest` in `src/lib/types.ts`:

```ts
  | { type: 'ADD_FAVORITE'; postId: number }
  | { type: 'REMOVE_FAVORITE'; postUrl: string }
```

Add `favoriteId?: number` to the `ok: true` branch of `WorkerResponse`.

- [ ] **Step 4: Add exhaustive worker handlers**

Import the domain operations in `src/background/index.ts`:

```ts
import { addFavorite, removeFavorite } from '../lib/favorites'
```

Add these cases before `GET_SETTINGS`:

```ts
      case 'ADD_FAVORITE':
        addFavorite(message.postId)
          .then((favoriteId) => sendResponse({ ok: true, favoriteId }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'REMOVE_FAVORITE':
        removeFavorite(message.postUrl)
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
```

Keep the existing `assertNever(message)` after the switch unchanged.

- [ ] **Step 5: Run focused tests and strict type checking**

Run: `pnpm test -- tests/background/favorites-messages.test.ts tests/lib/favorites.test.ts`

Expected: both files PASS.

Run: `pnpm typecheck`

Expected: exit code 0; every request switch remains exhaustive.

- [ ] **Step 6: Commit TASK-003 and inform the user**

```bash
git add src/lib/types.ts src/background/index.ts tests/background/favorites-messages.test.ts
git commit -m "feat: handle favorite worker messages"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-003 update before starting TASK-004.

### Implementation Phase 3: Tabbed Popup

- GOAL-003: Build accessible shared controls and integrate all three live popup views.

| Task | Description | Depends On | Completed | Date |
|------|-------------|------------|-----------|------|
| TASK-004 | Add tested presentational `BottomNav` and `PostCard` components. | TASK-003 | | |
| TASK-005 | Add tested Daily Posts and Favorite Posts tab panels. | TASK-004 | | |
| TASK-006 | Add Sources tab and refactor `App` into the three-tab orchestrator. | TASK-005 | | |

### TASK-004: Shared Bottom Navigation and Post Card

**Files:**
- Create: `src/popup/BottomNav.tsx`
- Create: `src/popup/PostCard.tsx`
- Create: `tests/popup/components.test.tsx`

- [ ] **Step 1: Write failing component-contract tests**

Create `tests/popup/components.test.tsx` with tests that:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from '../../src/popup/BottomNav'
import { PostCard } from '../../src/popup/PostCard'

describe('BottomNav', () => {
  it('renders three destinations and reports selection', () => {
    const onSelect = vi.fn()
    render(<BottomNav activeTab="daily" onSelect={onSelect} />)
    expect(screen.getByRole('navigation', { name: 'Main views' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Daily Posts' }).getAttribute('aria-current')).toBe(
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Posts' }))
    expect(onSelect).toHaveBeenCalledWith('favorites')
    expect(screen.getByRole('button', { name: 'Sources' })).toBeTruthy()
  })
})

describe('PostCard', () => {
  it('opens the post and exposes favorite and pending state', () => {
    const onToggleFavorite = vi.fn()
    render(
      <PostCard
        post={{
          postUrl: 'https://source.test/post',
          title: 'Post title',
          summary: 'Summary',
          thumbnail: 'https://source.test/thumb.jpg',
          sourceTitle: 'Source',
          timestamp: 1,
        }}
        favorite
        pending
        onToggleFavorite={onToggleFavorite}
      />,
    )
    expect(screen.getByRole('link', { name: 'Post title' }).getAttribute('target')).toBe('_blank')
    const button = screen.getByRole('button', { name: 'Remove Post title from favorites' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button).toHaveProperty('disabled', true)
  })
})
```

- [ ] **Step 2: Run the tests and verify missing component failures**

Run: `pnpm test -- tests/popup/components.test.tsx`

Expected: FAIL because both component modules are missing.

- [ ] **Step 3: Implement `BottomNav` as a presentational component**

Create `src/popup/BottomNav.tsx` with exported `PopupTab = 'daily' | 'favorites' | 'sources'`, an `activeTab` prop, and an `onSelect` callback. Render a `<nav aria-label="Main views" className="bottom-nav">` containing three buttons in the specified order. Each button must set `aria-current={activeTab === item.id ? 'page' : undefined}` and call `onSelect(item.id)`.

Use these exact labels and IDs:

```ts
const items = [
  { id: 'daily', label: 'Daily Posts' },
  { id: 'favorites', label: 'Favorite Posts' },
  { id: 'sources', label: 'Sources' },
] as const
```

Render inline SVG icons with `aria-hidden="true"`; use a sun/list icon for Daily Posts, a star/bookmark icon for Favorite Posts, and a stacked-list icon for Sources. Do not add an icon dependency.

- [ ] **Step 4: Implement `PostCard` with one display contract**

Create `src/popup/PostCard.tsx` with this public contract:

```ts
export interface PostCardData {
  postUrl: string
  title: string
  summary: string
  thumbnail?: string
  sourceTitle: string
  timestamp: number
}

interface PostCardProps {
  post: PostCardData
  favorite: boolean
  pending: boolean
  featured?: boolean
  onToggleFavorite: (postUrl: string) => void
}
```

Render the existing thumbnail/fallback, source, relative-time, title link, and summary markup. Add a button with:

```tsx
<button
  type="button"
  className={favorite ? 'favorite-button is-favorite' : 'favorite-button'}
  aria-label={
    favorite ? `Remove ${post.title} from favorites` : `Add ${post.title} to favorites`
  }
  aria-pressed={favorite}
  disabled={pending}
  onClick={() => onToggleFavorite(post.postUrl)}
>
  <FavoriteIcon filled={favorite} />
</button>
```

Keep `relativeTime`, host fallback, and initial fallback private to `PostCard.tsx`. The component must not import `db`, `useLiveQuery`, or call `chrome.runtime.sendMessage`.

- [ ] **Step 5: Run component tests and lint the new files**

Run: `pnpm test -- tests/popup/components.test.tsx`

Expected: all component tests PASS.

Run: `pnpm lint -- src/popup/BottomNav.tsx src/popup/PostCard.tsx tests/popup/components.test.tsx`

Expected: exit code 0.

- [ ] **Step 6: Commit TASK-004 and inform the user**

```bash
git add src/popup/BottomNav.tsx src/popup/PostCard.tsx tests/popup/components.test.tsx
git commit -m "feat: add popup navigation and post card"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-004 update before starting TASK-005.

### TASK-005: Daily Posts and Favorite Posts Panels

**Files:**
- Create: `src/popup/DailyPostsTab.tsx`
- Create: `src/popup/FavoritePostsTab.tsx`
- Modify: `tests/popup/App.test.tsx`

- [ ] **Step 1: Add failing popup behavior tests**

Extend `tests/popup/App.test.tsx` with these scenarios before changing production components:

1. Seed one source, one post with an explicit `id`, and one favorite; assert Daily Posts renders first and its post favorite button has `aria-pressed="true"`.
2. Click Favorite Posts; assert the favorite title/link is visible and the empty-state copy is absent.
3. Clear favorites, render, click Favorite Posts, and assert `No favorite posts yet.` plus `Add favorites from Daily Posts to keep them here.`.
4. Mock `ADD_FAVORITE` and `REMOVE_FAVORITE` success responses; assert the exact typed request payloads.
5. Hold an `ADD_FAVORITE` promise unresolved; assert only that post's button is disabled until the promise resolves.
6. Mock a failed favorite response and assert the post remains visible with the returned message in `role="alert"`.

Use this seeded favorite shape:

```ts
await db.favoritePosts.add({
  postUrl: 'https://post-1.test/',
  title: 'Post 1',
  summary: 'Summary 1',
  thumbnail: 'https://post-1.test/thumb.jpg',
  sourceUrl: 'https://source-1.test',
  sourceTitle: 'Source 1',
  publishedAt: Date.parse('2026-06-20T01:00:00Z'),
  crawledAt: Date.parse('2026-06-20T09:00:00Z'),
  favoritedAt: Date.parse('2026-06-20T10:00:00Z'),
})
```

- [ ] **Step 2: Run focused popup tests and verify failures**

Run: `pnpm test -- tests/popup/App.test.tsx`

Expected: new tests FAIL because there is no bottom navigation, favorite panel, or favorite toggle.

- [ ] **Step 3: Implement the Daily Posts panel**

Create `src/popup/DailyPostsTab.tsx` with props for `crawlInProgress`, `posts`, `sources`, `today`, `favoriteUrls: ReadonlySet<string>`, `pendingUrls: ReadonlySet<string>`, and `onToggleFavorite(post: Post)`. Move the existing digest hero, status pills, loading, source-empty, all-failed, no-post, and `selectDigest` branches from `App.tsx` into this component.

Map every selected post to `PostCard` using:

```tsx
<PostCard
  post={{
    postUrl: post.postUrl,
    title: post.title,
    summary: post.summary,
    ...(post.thumbnail !== undefined ? { thumbnail: post.thumbnail } : {}),
    sourceTitle: source?.title ?? hostLabel(post.sourceUrl),
    timestamp: post.publishedAt ?? post.crawledAt,
  }}
  favorite={favoriteUrls.has(post.postUrl)}
  pending={pendingUrls.has(post.postUrl)}
  featured={index === 0}
  onToggleFavorite={() => onToggleFavorite(post)}
/>
```

The Daily panel must not render scheduling or notification checkboxes.

- [ ] **Step 4: Implement the Favorite Posts panel**

Create `src/popup/FavoritePostsTab.tsx` with `favorites`, `pendingUrls`, and `onRemoveFavorite` props. Render loading when `favorites === undefined`, the approved empty copy when `favorites.length === 0`, and a list ordered exactly as supplied otherwise.

Map each `FavoritePost` to `PostCard` with `favorite={true}`, `timestamp={favorite.publishedAt ?? favorite.crawledAt}`, and `onToggleFavorite={onRemoveFavorite}`. Do not join favorites back to `sources` or `posts`.

- [ ] **Step 5: Wire both panels and favorite actions in `App`**

Add `const [activeTab, setActiveTab] = useState<PopupTab>('daily')`, `const [pendingFavoriteUrls, setPendingFavoriteUrls] = useState<ReadonlySet<string>>(new Set())`, and a `useLiveQuery(() => listFavorites(), [])`. Render Daily or Favorite Posts based on `activeTab`, followed by `BottomNav`. Keep the existing Sources content reachable in its old location until TASK-006 moves it.

Implement the mutation boundary before running the new behavior tests:

```ts
async function toggleDailyFavorite(post: Post) {
  const isFavorite = favorites?.some((favorite) => favorite.postUrl === post.postUrl) ?? false
  if (isFavorite) {
    await updateFavorite(post.postUrl, { type: 'REMOVE_FAVORITE', postUrl: post.postUrl })
    return
  }
  if (post.id === undefined) {
    setError(`Post ${post.postUrl} has no persisted id.`)
    return
  }
  await updateFavorite(post.postUrl, { type: 'ADD_FAVORITE', postId: post.id })
}

async function updateFavorite(postUrl: string, request: WorkerRequest) {
  setError(null)
  setPendingFavoriteUrls((current) => new Set(current).add(postUrl))
  try {
    const response = await send(request)
    if (!response.ok) setError(response.error)
  } catch (error) {
    setError(errorMessage(error))
  } finally {
    setPendingFavoriteUrls((current) => {
      const next = new Set(current)
      next.delete(postUrl)
      return next
    })
  }
}
```

Call `updateFavorite(postUrl, { type: 'REMOVE_FAVORITE', postUrl })` from Favorite Posts and pass `new Set(favorites?.map((favorite) => favorite.postUrl) ?? [])` to Daily Posts.

- [ ] **Step 6: Run popup tests**

Run: `pnpm test -- tests/popup/App.test.tsx tests/popup/components.test.tsx`

Expected: Daily/Favorite tab, empty-state, request-shape, pending-state, and failure tests PASS.

- [ ] **Step 7: Commit TASK-005 and inform the user**

```bash
git add src/popup/DailyPostsTab.tsx src/popup/FavoritePostsTab.tsx src/popup/App.tsx tests/popup/App.test.tsx
git commit -m "feat: add daily and favorite post tabs"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-005 update before starting TASK-006.

### TASK-006: Sources Panel and App Orchestration

**Files:**
- Create: `src/popup/SourcesTab.tsx`
- Modify: `src/popup/App.tsx`
- Modify: `tests/popup/App.test.tsx`

- [ ] **Step 1: Add failing navigation and Sources ownership tests**

Update `tests/popup/App.test.tsx` to assert:

- Daily Posts has `aria-current="page"` on a fresh render, including after unmount and a second render.
- The checkboxes `Daily 07:00 crawl` and `Daily notifications`, Subscribe button, saved source URL, permission recovery, and last-crawl text are absent from Daily Posts.
- After clicking Sources, all those controls are visible.
- After clicking Favorite Posts and then remounting `App`, Daily Posts is selected again.
- Existing refresh behavior remains available on Daily Posts.

- [ ] **Step 2: Run the popup test and verify Sources placement failures**

Run: `pnpm test -- tests/popup/App.test.tsx`

Expected: new ownership assertions FAIL while controls remain outside the Sources panel.

- [ ] **Step 3: Create a focused Sources panel**

Create `src/popup/SourcesTab.tsx` with typed props for sources, settings, last-crawl label, and the existing action callbacks:

```ts
interface SourcesTabProps {
  sources: Source[] | undefined
  settings: Settings | null
  lastCrawl: string
  onSaveCurrentPage: () => void
  onRemoveSource: (id: number) => void
  onRequestPermission: (source: Source & { id: number }) => void
  onSetDailyCron: (enabled: boolean) => void
  onSetDailyNotifications: (enabled: boolean) => void
}
```

Move the existing schedule labels, Subscribe action, source list, permission chip/button, unsubscribe button, and crawl note into a `<section aria-labelledby="sources-heading" className="tab-panel sources-panel">`. Render a source-specific empty state when `sources` is an empty array; render a loading state while it is `undefined`.

- [ ] **Step 4: Refactor `App` into orchestration only**

Remove `SourceList`, `DigestPreview`, their presentation-only icon functions, and `focusSources` from `App.tsx`. Keep these responsibilities in `App`:

- Live queries for sources, today's posts, and `listFavorites()`.
- Settings/status loading and the existing save, remove-source, permission, refresh, and settings callbacks.
- `activeTab`, initialized with `useState<PopupTab>('daily')`.
- The existing `pendingFavoriteUrls` and favorite mutation callbacks from TASK-005.
- Shared alert rendering and header refresh button.
- Conditional rendering of exactly one tab panel and one `BottomNav`.

Keep favorite orchestration explicit and do not replace it with direct database writes. The final add path must retain this guard from TASK-005:

```ts
if (post.id === undefined) {
  setError(`Post ${post.postUrl} has no persisted id.`)
  return
}
```

Convert favorite rows to `favoriteUrls` once per render with `new Set(favorites?.map((favorite) => favorite.postUrl) ?? [])`.

- [ ] **Step 5: Run popup regressions and type checking**

Run: `pnpm test -- tests/popup/App.test.tsx tests/popup/components.test.tsx`

Expected: all popup tests PASS, including default-tab reset and Sources-only control ownership.

Run: `pnpm typecheck`

Expected: exit code 0 with no optional-property or unused-symbol errors.

- [ ] **Step 6: Commit TASK-006 and inform the user**

```bash
git add src/popup/SourcesTab.tsx src/popup/App.tsx tests/popup/App.test.tsx
git commit -m "refactor: organize popup into three tabs"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-006 update before starting TASK-007.

### Implementation Phase 4: Styling, Documentation, and Release Validation

- GOAL-004: Apply the selected bottom-navigation design, document the model, and verify the extension as a complete MV3 build.

| Task | Description | Depends On | Completed | Date |
|------|-------------|------------|-----------|------|
| TASK-007 | Update popup CSS and authoritative development documentation. | TASK-006 | | |
| TASK-008 | Run automated/manual validation and record completion evidence. | TASK-007 | | |

### TASK-007: Popup Styling and Documentation

**Files:**
- Modify: `src/popup/App.css`
- Modify: `docs/DEVELOPMENT_PLAN.md`
- Modify: `tests/popup/App.test.tsx` only if class-independent accessibility assertions need completion

- [ ] **Step 1: Add class-independent accessibility assertions**

Ensure popup tests assert behavior rather than CSS names:

```ts
const navigation = screen.getByRole('navigation', { name: 'Main views' })
expect(within(navigation).getAllByRole('button')).toHaveLength(3)
expect(screen.getByRole('button', { name: 'Daily Posts' }).getAttribute('aria-current')).toBe(
  'page',
)
expect(screen.getByRole('button', { name: 'Add Post 1 to favorites' }).getAttribute('aria-pressed')).toBe(
  'false',
)
```

- [ ] **Step 2: Implement the selected bottom-navigation layout**

Update `src/popup/App.css` with these layout rules and adapt existing card/source selectors to the extracted components:

```css
.popup-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 600px;
  padding: 0;
  gap: 0;
}

.topbar {
  padding: 16px;
  border-bottom: 1px solid #263244;
}

.tab-panel {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.bottom-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #263244;
  background: #111827;
}

.bottom-nav button {
  display: grid;
  min-height: 58px;
  place-items: center;
  gap: 3px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.bottom-nav button[aria-current='page'] {
  background: #172033;
  color: #86efac;
}

.favorite-button {
  display: inline-grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #111827;
  color: #94a3b8;
}

.favorite-button.is-favorite {
  border-color: rgba(34, 197, 94, 0.68);
  background: rgba(34, 197, 94, 0.14);
  color: #22c55e;
}
```

Retain the current 400-pixel `html`, `body`, and `#root` width and 600-pixel minimum height. Remove obsolete `.action-bar` and focus-source rules after confirming no component references them. Keep all `:focus-visible` states and include `.favorite-button` and `.bottom-nav button` in the green outline rule.

- [ ] **Step 3: Update the authoritative development plan**

Modify `docs/DEVELOPMENT_PLAN.md` to add:

- Functional requirements for add/remove favorite, independent favorite retention, and three popup tabs.
- `favoritePosts` to the architecture diagram and data-model section using the approved schema.
- Typed worker-message flow for favorite writes.
- A milestone for favorites and tabbed popup UI.
- Favorite-domain, migration, worker-message, popup-navigation, and accessibility tests.

State explicitly that this update does not resolve or modify open question Q1, distribution target, or history retention.

- [ ] **Step 4: Run popup tests, lint, and type checking**

Run: `pnpm test -- tests/popup/App.test.tsx tests/popup/components.test.tsx`

Expected: all selected tests PASS.

Run: `pnpm lint && pnpm typecheck`

Expected: both commands exit 0.

- [ ] **Step 5: Commit TASK-007 and inform the user**

```bash
git add src/popup/App.css docs/DEVELOPMENT_PLAN.md tests/popup/App.test.tsx
git commit -m "feat: style and document tabbed favorites UI"
```

After the commit, execute the Per-Task Completion Protocol and send the TASK-007 update before starting TASK-008.

### TASK-008: Complete Validation and Plan Closure

**Files:**
- Modify: `plan/feature-favorites-tabbed-popup-1.md` completion cells only
- Do not modify: `manifest.config.ts`

- [ ] **Step 1: Run the full automated matrix**

Run each command independently:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected:

- `pnpm test`: every test file passes; no live-network calls occur.
- `pnpm typecheck`: exit code 0 under strict mode.
- `pnpm lint`: exit code 0.
- `pnpm build`: exit code 0 and writes the production extension to `dist/`.

- [ ] **Step 2: Confirm schema and manifest invariants**

Run:

```bash
rg -n "favoritePosts|version\(2\)" src/lib/db.ts src/lib/types.ts src/lib/favorites.ts
git diff e384a9d -- manifest.config.ts
```

Expected: the first command shows the version 2 table and favorite type/operations; the second command prints no manifest diff.

- [ ] **Step 3: Load and manually verify the unpacked extension**

Load `dist/` from `chrome://extensions` in Developer mode and verify this matrix:

| Check | Expected result |
|------|-----------------|
| Open popup | Daily Posts is selected. |
| Switch tabs | Bottom navigation reaches all three panels. |
| Favorite a daily post | Button fills; Favorite Posts gains the snapshot without reopening. |
| Close/reopen popup | Daily Posts is selected and favorite remains. |
| Remove favorite | Daily button clears and Favorite Posts removes the row. |
| Delete source after favoriting | Favorite remains readable with source title and original link. |
| Trigger pruning or delete original post in DevTools | Favorite remains readable. |
| Open Sources | Subscribe, permissions, toggles, source list, and last crawl are present. |
| Inspect service worker/popup consoles | No uncaught error or warning caused by this feature. |

- [ ] **Step 4: Audit repository constraints**

Confirm all seven `AGENTS.md` non-negotiable constraints remain satisfied. Specifically verify no direct popup writes, no `chrome.*` call under `src/lib/`, no new network code, no new permission, and exhaustive message handling.

- [ ] **Step 5: Mark plan tasks complete, commit closure, and inform the user**

Set each completed table row to `✅` with date `2026-06-27` or the actual completion date, update front matter status to `'Completed'`, and update `last_updated`. Then commit only the plan status update:

```bash
git add plan/feature-favorites-tabbed-popup-1.md
git commit -m "docs: complete favorites implementation plan"
```

After the commit, execute the Per-Task Completion Protocol and send the final TASK-008 update with `Next: Implementation complete`.

## 3. Alternatives

- **ALT-001**: Store only `postId` in favorites. Rejected because post pruning or deletion would break the saved item.
- **ALT-002**: Prevent deletion of favorited rows from `posts`. Rejected because it couples retention and source lifecycle to favorites.
- **ALT-003**: Write favorites directly from the popup. Rejected because it violates the repository's read-only popup boundary.
- **ALT-004**: Persist the selected tab. Rejected because the approved behavior always opens Daily Posts.
- **ALT-005**: Use top tabs or a hybrid footer. Rejected after visual review selected persistent bottom navigation.
- **ALT-006**: Add a UI/icon library. Rejected because existing inline SVG and CSS patterns cover the required controls without a dependency.

## 4. Dependencies

- **DEP-001**: TASK-001 must complete before all other tasks because it defines `FavoritePost` and the table.
- **DEP-002**: TASK-002 supplies the persistence functions used by TASK-003.
- **DEP-003**: TASK-003 supplies the typed mutation contract used by popup tasks.
- **DEP-004**: TASK-004 supplies shared components used by TASK-005 and TASK-006.
- **DEP-005**: TASK-005 must establish both post panels before TASK-006 removes the monolithic rendering from `App.tsx`.
- **DEP-006**: Existing packages only: Dexie, React, dexie-react-hooks, Vitest, Testing Library, and fake-indexeddb.
- **DEP-007**: No package installation, external service, live network, or manifest change is required.

## 5. Files

- **FILE-001**: `src/lib/types.ts` — add `FavoritePost`, favorite requests, and `favoriteId` response.
- **FILE-002**: `src/lib/db.ts` — retain version 1 and add version 2 `favoritePosts` schema.
- **FILE-003**: `src/lib/favorites.ts` — transactional add, remove, list, and source-host fallback.
- **FILE-004**: `src/background/index.ts` — exhaustive favorite message handlers.
- **FILE-005**: `src/popup/App.tsx` — live-query/state/action orchestration and active-panel selection.
- **FILE-006**: `src/popup/BottomNav.tsx` — fixed three-destination navigation.
- **FILE-007**: `src/popup/PostCard.tsx` — shared post display and favorite control.
- **FILE-008**: `src/popup/DailyPostsTab.tsx` — daily digest panel and states.
- **FILE-009**: `src/popup/FavoritePostsTab.tsx` — favorite snapshot panel and empty state.
- **FILE-010**: `src/popup/SourcesTab.tsx` — source and automation management panel.
- **FILE-011**: `src/popup/App.css` — selected bottom-navigation and favorite-control styles.
- **FILE-012**: `tests/lib/db.test.ts` — v1-to-v2 migration preservation.
- **FILE-013**: `tests/lib/favorites.test.ts` — favorite domain behaviors.
- **FILE-014**: `tests/background/favorites-messages.test.ts` — service-worker routing.
- **FILE-015**: `tests/popup/components.test.tsx` — presentational control contracts.
- **FILE-016**: `tests/popup/App.test.tsx` — integrated tabs, actions, states, and accessibility.
- **FILE-017**: `docs/DEVELOPMENT_PLAN.md` — authoritative feature, architecture, model, milestone, and tests.
- **FILE-018**: `plan/feature-favorites-tabbed-popup-1.md` — task tracking and validation evidence.

## 6. Testing

- **TEST-001**: Dexie version 1 data survives opening with production version 2.
- **TEST-002**: Favorite snapshot copies all display fields and source title.
- **TEST-003**: Missing source uses the hostname fallback.
- **TEST-004**: Duplicate add returns one row and preserves `favoritedAt`.
- **TEST-005**: Repeated remove succeeds without a row.
- **TEST-006**: Source/post deletion does not remove a favorite.
- **TEST-007**: Favorite list is newest-favorited first.
- **TEST-008**: Worker listener handles add/remove success and missing-post failure.
- **TEST-009**: Bottom navigation renders all destinations and exposes selection.
- **TEST-010**: Post card exposes external link, pressed state, accessible label, and pending state.
- **TEST-011**: Daily Posts is selected on every fresh popup render.
- **TEST-012**: Favorite membership updates Daily and Favorite Posts through the live query.
- **TEST-013**: Favorite empty/loading/error states preserve readable content.
- **TEST-014**: Source and settings controls render under Sources only.
- **TEST-015**: Full test/type/lint/build matrix passes without live network.
- **TEST-016**: Manual unpacked-extension matrix passes without console errors.

## 7. Risks & Assumptions

- **RISK-001**: A source can be deleted between click and worker processing. Mitigation: snapshot from the post and fall back to the source URL hostname.
- **RISK-002**: Repeated rapid clicks can create duplicate writes. Mitigation: disable the affected control while pending, use a transaction, and enforce unique `postUrl`.
- **RISK-003**: A version bump can accidentally omit old schemas and lose indexes. Mitigation: retain both version declarations and test a real v1-to-v2 open.
- **RISK-004**: Splitting `App.tsx` can regress existing save, permissions, scheduling, notifications, and crawl feedback. Mitigation: move behavior unchanged and retain integrated popup tests.
- **RISK-005**: Fixed bottom navigation reduces vertical reading space. Mitigation: keep the selected 58-pixel navigation height and make only the active panel scroll.
- **RISK-006**: Background-entry tests may expose missing Chrome event stubs. Mitigation: use a single explicit stub factory and dynamic import after stubbing.
- **ASSUMPTION-001**: `postUrl` is the stable identity shared by daily posts and favorite snapshots.
- **ASSUMPTION-002**: Favorites remain until explicit user removal; source deletion and pruning do not cascade.
- **ASSUMPTION-003**: Favorite sorting is fixed to newest-favorited first; no user-controlled sort is required.
- **ASSUMPTION-004**: The popup remains 400 by at least 600 pixels and always starts on Daily Posts.
- **ASSUMPTION-005**: Existing source distribution, history retention, and digest selection decisions remain outside this feature.

## 8. Related Specifications / Further Reading

- [Approved favorites and tabbed popup design](../docs/superpowers/specs/2026-06-27-favorites-and-tabbed-popup-design.md)
- [Development plan](../docs/DEVELOPMENT_PLAN.md)
- [ADR-001: extraction strategy](../docs/adr/ADR-001-extraction-strategy.md)
- [ADR-002: permissions model](../docs/adr/ADR-002-permissions-model.md)
- `AGENTS.md` — canonical repository constraints and validation rules.
