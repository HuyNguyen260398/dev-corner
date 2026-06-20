# ADR-002: Host Permissions Model

**Status:** Proposed
**Date:** 2026-06-20
**Deciders:** Project owner (Huy)

## Context

The crawler fetches arbitrary sites the user chooses to save. Cross-origin
`fetch` from the MV3 service worker requires `host_permissions`. Because the set
of sites is user-defined and open-ended, the broadest grant (`<all_urls>`) is the
simplest, but Chrome Web Store review treats broad host access as a sensitive
permission requiring justification, and users see a scary install warning.

## Decision

For **personal / unpacked** use, ship `<all_urls>` — simplest, no UX friction.

For a **public Web Store listing**, prefer `optional_host_permissions` requested
**per origin at save time**: when the user saves a source, call
`chrome.permissions.request({ origins: ['https://that-site.com/*'] })`. Only
granted origins are crawled.

This is a configuration switch, not an architectural change; the crawler code is
identical either way.

## Options Considered

### Option A: `<all_urls>` up front
**Pros:** zero runtime permission prompts; simplest code.
**Cons:** install-time warning; heavier Web Store review; over-broad.

### Option B: `optional_host_permissions`, requested per source
**Pros:** least-privilege; smaller review surface; user sees exactly what's granted.
**Cons:** a permission prompt on first save of each new origin; must handle denial.

## Trade-off Analysis

The difference is entirely distribution context. Unpacked personal use never hits
review and benefits from `<all_urls>` simplicity. A public listing benefits from
least-privilege both for approval odds and user trust, at the cost of one prompt
per new origin — acceptable since saving a source is already a deliberate action.

## Consequences

- **Easier (B):** review/trust; users control scope.
- **Harder (B):** must handle permission denial gracefully (mark source as
  "needs permission", offer re-request).
- **Revisit:** decide once the distribution target (Q2) is confirmed.

## Action Items
1. [ ] Confirm distribution target (personal vs Web Store).
2. [ ] If Web Store: implement per-origin request flow at save time + denial UI.
