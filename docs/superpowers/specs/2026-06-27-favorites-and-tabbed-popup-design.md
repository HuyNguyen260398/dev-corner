# Favorites and Tabbed Popup Design

**Date:** 2026-06-27  
**Status:** Approved for implementation planning  
**Owner:** Huy

## Summary

Add persistent favorite posts and reorganize the Chrome extension popup into three primary views: Daily Posts, Favorite Posts, and Sources. Favorites are stored as independent post snapshots in a dedicated IndexedDB table so they remain available after source removal or normal post pruning. The popup uses persistent bottom navigation and always opens on Daily Posts.

## Goals

- Let users add a daily digest post to favorites and remove it later.
- Store favorites in their own Dexie/IndexedDB table.
- Preserve favorites independently from `sources` and `posts` lifecycle operations.
- Split the popup into Daily Posts, Favorite Posts, and Sources tabs.
- Move source management and crawl/notification settings into Sources.
- Preserve the existing local-only, MV3, typed-message, and minimal-permission architecture.

## Non-goals

- Do not change crawling, extraction, scheduling, or network behavior.
- Do not change the date-seeded digest selection algorithm, including the literal `N > 5` behavior.
- Do not add favorite folders, tags, search, sorting controls, bulk actions, or synchronization.
- Do not change general post-history retention.
- Do not add permissions, backend services, telemetry, or remote storage.

## Selected Approach

Store a complete display snapshot for every favorite. A reference-only table was rejected because removing a source or pruning its posts could make a favorite unreadable. A reference plus special retention rules was rejected because it would unnecessarily couple favorite behavior to source deletion and pruning.

All favorite writes cross the existing typed service-worker message boundary. The popup continues to read IndexedDB with live queries and does not write directly or perform crawling.

## Data Model

Add this shared type to `src/lib/types.ts`:

```ts
interface FavoritePost {
  id?: number
  postUrl: string
  title: string
  summary: string
  thumbnail?: string
  sourceUrl: string
  sourceTitle: string
  publishedAt?: number
  crawledAt: number
  favoritedAt: number
}
```

`sourceTitle` is copied when the favorite is created because the source record may later be removed. `sourceId` and `crawlDay` are intentionally omitted because favorite display and retention must not depend on the original records or digest day.

Upgrade `DevCornerDB` in `src/lib/db.ts` from schema version 1 to version 2. Version 2 retains the existing `sources` and `posts` schemas unchanged and adds:

```text
favoritePosts: ++id, &postUrl, favoritedAt, publishedAt, sourceUrl
```

The unique `postUrl` index provides one favorite per original post. Adding version 2 must preserve all version 1 `sources` and `posts` records; no data transformation is required.

## Favorite Operations

Add pure persistence operations in `src/lib/favorites.ts`:

- `addFavorite(postId: number): Promise<number>` loads the post and its source, creates the snapshot, and returns the favorite ID.
- `removeFavorite(postUrl: string): Promise<void>` deletes the matching favorite if present.
- `listFavorites(): Promise<FavoritePost[]>` returns favorites by `favoritedAt` descending.

If `addFavorite` cannot find the post, it throws a user-safe error. If the source was removed before the request is processed, it uses the post's `sourceUrl` host as `sourceTitle`; this handles the existing asynchronous message boundary without making the operation dependent on source lifetime.

Favorite operations are idempotent:

- Adding a `postUrl` that is already favorited returns the existing row and preserves its original `favoritedAt`.
- Removing a `postUrl` that is not favorited succeeds without changing state.
- Source deletion and post pruning never delete from `favoritePosts`.

## Typed Messages and Service Worker

Extend `WorkerRequest` in `src/lib/types.ts` with:

```ts
| { type: 'ADD_FAVORITE'; postId: number }
| { type: 'REMOVE_FAVORITE'; postUrl: string }
```

Extend the successful worker response with optional `favoriteId?: number`. Add exhaustive cases in `src/background/index.ts` that call the shared favorite operations and return the standard `WorkerResponse`. No new Chrome APIs or permissions are required.

## Popup Information Architecture

The popup retains its 400-pixel width and minimum 600-pixel height. A fixed bottom navigation exposes three tabs in this order:

1. **Daily Posts** — selected by default on every popup opening.
2. **Favorite Posts** — persistent saved reading list.
3. **Sources** — source and automation management.

The active tab is React state initialized to `daily`. It is not written to IndexedDB or `chrome.storage`.

### Daily Posts

- Keep the current brand header, date, refresh action, status, digest selection, loading state, crawl failures, and empty states.
- Remove schedule and notification toggles from this view.
- Render a favorite toggle on each digest post card.
- Use `aria-pressed="true"` and a filled visual state when the post URL exists in `favoritePosts`.
- Disable only the affected post's toggle while its add/remove request is pending.

### Favorite Posts

- Read `favoritePosts` live and display newest-favorited first.
- Reuse the post-card visual structure while displaying the snapshotted `sourceTitle`.
- Open the original `postUrl` in a new tab.
- Provide a remove-favorite toggle on every card.
- Show a dedicated empty state explaining how to add favorites from Daily Posts.

### Sources

- Move the current Subscribe action and saved-source list into this view.
- Keep permission recovery and source removal behavior.
- Move the daily 07:00 crawl and daily-notification toggles into this view.
- Show last-crawl status here.
- Preserve the existing source-empty and error behavior.

### Shared Popup Structure

Refactor `src/popup/App.tsx` so it owns global live queries, worker actions, error state, crawl/settings state, per-post pending state, and active-tab state. Extract focused UI components under `src/popup/`:

- `DailyPostsTab.tsx`
- `FavoritePostsTab.tsx`
- `SourcesTab.tsx`
- `PostCard.tsx`
- `BottomNav.tsx`

`PostCard` accepts display data and callbacks rather than reading IndexedDB or sending worker messages. Each extracted component has one clear responsibility and typed props.

## Data Flow

1. The popup live-queries today's posts, sources, and favorites.
2. Daily digest selection continues to run from today's posts and sources.
3. Favorite membership is determined by `postUrl`.
4. The user toggles favorite state on a post card.
5. `App` marks that `postUrl` pending and sends `ADD_FAVORITE` or `REMOVE_FAVORITE`.
6. The service worker writes the `favoritePosts` table through `src/lib/favorites.ts`.
7. Dexie's live query updates both the Daily toggle state and Favorite Posts list.
8. `App` clears pending state and surfaces any worker failure in the shared alert.

## Error and Accessibility Behavior

- Keep current content visible when a favorite operation fails.
- Report failures through the existing alert region using the worker error string.
- Favorite buttons have post-specific accessible names, `aria-pressed`, keyboard focus styling, and at least a 44-by-44-pixel target.
- Bottom navigation uses a labeled navigation landmark and buttons with selected state exposed through `aria-current="page"`.
- Each tab panel has a stable accessible name and only the active panel is rendered.
- Existing external links retain `target="_blank"` and `rel="noreferrer"`.

## Testing Strategy

### Unit and persistence tests

- Verify a version 1 database upgrades to version 2 without losing source or post rows.
- Verify a favorite snapshot contains all required display fields and the source title.
- Verify source-host fallback when the source row is absent.
- Verify duplicate add preserves the original `favoritedAt` and one-row invariant.
- Verify repeated remove is a successful no-op.
- Verify favorites remain after source removal and post deletion/pruning.
- Verify `listFavorites` orders by `favoritedAt` descending.

### Popup tests

- Verify every fresh render selects Daily Posts.
- Verify bottom navigation switches among all three panels.
- Verify Daily favorite buttons reflect live favorite membership.
- Verify add/remove requests use the typed message shapes and pending buttons are disabled.
- Verify Favorite Posts ordering, external links, removal, and empty state.
- Verify source controls, settings toggles, and last-crawl status render under Sources only.
- Verify favorite-operation failures render the shared alert without removing current cards.
- Verify navigation and favorite controls expose the required accessible state.

### Project validation

- Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- Load `dist/` as an unpacked extension and manually verify tab navigation, favorite persistence across popup reopens, source deletion independence, and the absence of console errors.
- Confirm the manifest permissions are unchanged and all seven repository constraints remain satisfied.

## Acceptance Criteria

- Users can favorite and unfavorite any displayed daily post.
- Favorite Posts displays persisted snapshots newest-favorited first.
- Favorites survive popup closure, browser restart, source removal, and original post pruning.
- IndexedDB contains a dedicated `favoritePosts` table with a unique `postUrl` index.
- The popup always opens on Daily Posts and provides persistent bottom navigation to all three views.
- Sources contains subscription, source management, permission recovery, scheduling, notifications, and last-crawl controls.
- Favorite operations are idempotent and produce no duplicate rows.
- No permission, network, crawl, digest-selection, or history-retention behavior changes.
