# Refresh Recovery Design

**Date:** 2026-06-27
**Status:** Approved for implementation
**Owner:** Huy

## Summary

Prevent the popup from remaining indefinitely on "Refreshing latest posts..." when a source request stalls or the service-worker message rejects. The change remains local to refresh error handling and crawler network deadlines; favorite behavior, digest selection, permissions, and the persisted crawl queue remain unchanged.

## Selected Approach

Apply recovery at both boundaries:

1. The popup wraps the manual `CRAWL_ALL` request in `try/catch/finally`. It surfaces rejected message errors through the existing alert and always clears its local loading state.
2. The crawler gives every `fetch` a 15-second deadline. A timeout follows the existing source-failure path, records the error on that source, advances the persisted queue, and lets `crawlAll` reset `crawlInProgress` in its existing `finally` block.

This is preferred over a UI-only timeout because a hidden crawl would continue and a second refresh could overlap it. It is preferred over changing the queue or MV3 scheduling model because the existing queue already provides resumability and was not the source of this failure.

## Data Flow and Error Handling

- Clicking refresh sets the popup loading state and sends `CRAWL_ALL`.
- Successful crawls retain the current response and status behavior.
- HTTP and parsing failures retain their existing per-source failure behavior.
- A network request that does not settle within 15 seconds is aborted with a user-readable timeout error containing the source URL.
- If `chrome.runtime.sendMessage` rejects, the popup renders the error and clears the loading state.
- The crawl queue is not discarded on interruption; the next crawl resumes from the stored source ID.

## Testing

- Add a popup regression test in which `CRAWL_ALL` rejects; assert the refresh button is re-enabled, the loading message disappears, and the alert displays the rejection.
- Add crawler tests using fake timers and a never-settling `fetch`; assert the source crawl resolves as a failure after 15 seconds and records a timeout message.
- Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Acceptance Criteria

- Manual refresh never remains in the popup loading state after its worker request rejects.
- A single network request cannot block a crawl longer than 15 seconds.
- Timed-out sources are recorded as failures and the remaining crawl queue can continue.
- No new permissions, backend calls, telemetry, selection changes, or favorite behavior are introduced.
