# Thumbnail Subdomain Policy Design

**Date:** 2026-06-28  
**Status:** Superseded

This design was superseded on 2026-06-28 by the approved requirement to render
valid HTTPS thumbnail URLs explicitly selected by a saved source, including
third-party image hosts such as `storage.ghost.io`.

## Problem

The current thumbnail policy accepts only HTTPS images whose origin exactly
matches the saved source origin. That boundary rejects legitimate images served
from source-controlled media subdomains. For example, a source saved as
`https://dev.to/` publishes post images from `https://media2.dev.to/`, so the
crawler persists `/placeholder.svg` even when the post has a valid cover image.

Deleting IndexedDB and crawling again reproduces the behavior, which rules out
stale persisted metadata. The affected DEV image endpoint responds successfully
with an image and permits cross-origin loading.

## Decision

Permit a thumbnail only when all of the following are true:

1. The thumbnail uses HTTPS.
2. Its hostname exactly matches the saved source hostname, or is a descendant
   subdomain separated by a dot.
3. The URL is syntactically valid.

For a saved source at `dev.to`, this permits `dev.to` and `media2.dev.to`. It
rejects `evildev.to`, sibling domains, unrelated CDNs such as S3, HTTP URLs,
`data:` URLs, and executable schemes.

This is a generic host-boundary rule, not a DEV-specific allowlist. It requires
no new Chrome permission because the manifest already permits HTTPS images in
extension pages. The rule continues to prevent thumbnails from arbitrary,
unrelated origins.

## Architecture and Data Flow

`src/lib/thumbnail-policy.ts` remains the single policy boundary. Both the
background crawler and popup renderer call `renderableThumbnail`, ensuring that
newly ingested data and previously persisted data receive the same validation.

The crawler continues through the existing fallback chain and stores the first
permitted candidate. Posts currently storing `/placeholder.svg` are not treated
as reusable metadata, so a subsequent crawl re-evaluates them without a schema
migration.

The popup loads the permitted HTTPS URL lazily. If the image request fails, the
existing source-initial fallback remains unchanged.

## Error Handling and Security

Malformed URLs resolve to the packaged placeholder. Host comparison uses an
exact match or a `.`-delimited suffix, preventing lookalike domains from passing.
Protocol checks remain HTTPS-only. No broader host permission, telemetry,
backend, proxy, or remote database is introduced.

## Documentation Impact

Publication-facing privacy and compliance documents will describe thumbnails as
limited to the saved source host and its HTTPS subdomains instead of claiming an
exact-origin boundary. The Chrome Web Store permission justifications remain
unchanged because no manifest permission changes.

## Testing

Implementation will follow TDD and cover:

- exact-host and descendant-subdomain acceptance;
- lookalike, sibling, unrelated, insecure, and executable URL rejection;
- ingestion of a DEV-style `media2.dev.to` thumbnail for a `dev.to` source;
- popup rendering of a permitted subdomain thumbnail;
- the full release verification command.

## Non-goals

- Allowing arbitrary third-party CDN hosts.
- Maintaining per-site thumbnail allowlists.
- Downloading or caching image bodies in IndexedDB.
- Adding manifest permissions or changing the post-selection algorithm.
