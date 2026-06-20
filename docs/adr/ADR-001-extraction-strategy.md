# ADR-001: Post Extraction Strategy

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Project owner (Huy)

## Context

dev-corner must extract the 5 latest posts (title, thumbnail, summary, post
link, source link) from arbitrary user-saved blog URLs, with **no backend** and
no per-site scrapers. Blog HTML structures vary enormously, but two near-universal
conventions exist: syndication **feeds** (RSS 2.0 / Atom) and **Open Graph** meta
tags. The crawler runs inside the MV3 service worker, which has `fetch` and
`DOMParser` but no live `document`.

## Decision

Adopt a **feed-first, HTML-fallback** strategy.

1. Discover a feed via `<link rel="alternate">` then common path probes
   (`/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/index.xml`); cache the result on
   the source.
2. Parse RSS/Atom for the newest 5 entries; map fields directly.
3. If no feed exists, fall back to HTML heuristics + Open Graph tags (best-effort).

## Options Considered

### Option A: Feed-first, HTML-fallback (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None (client-side) |
| Reliability | High for feed sites, best-effort otherwise |
| Team familiarity | High |

**Pros:** One code path covers the majority of dev blogs; clean structured data;
no maintenance per site. **Cons:** Feed-less sites yield thinner data.

### Option B: Pure HTML scraping (per-site or heuristic)
| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Reliability | Brittle; breaks on redesigns |

**Pros:** Works even without feeds. **Cons:** Fragile, high upkeep, poor thumbnails/summaries.

### Option C: Third-party extraction API
Rejected: violates the no-backend / privacy constraint and adds cost + a dependency.

## Trade-off Analysis

Feeds give the exact five fields needed with near-zero parsing risk, which is why
they anchor the design. HTML scraping is retained only as a graceful fallback so
feed-less sources still produce *something*, rather than being the primary path
(Option B) where brittleness would dominate maintenance.

## Consequences

- **Easier:** reliable structured posts; no per-site code; cheap to run.
- **Harder:** feed-less sites need heuristic tuning; thumbnails not guaranteed.
- **Revisit:** allow users to paste an explicit feed URL for feed-less sources
  (plan Q4); consider a readability-style content parser if fallback quality is poor.
