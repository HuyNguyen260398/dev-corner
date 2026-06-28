# Pre-Publication Performance and Compliance Design

**Date:** 2026-06-28
**Status:** Approved for planning
**Owner:** Huy

## Summary

Introduce a release gate that must pass before the existing Chrome Web Store publication plan is executed. The gate measures the extension first, fixes only demonstrated or policy-relevant problems, and verifies that the shipped package, privacy policy, dashboard declarations, permission justifications, and listing copy all describe the same behavior.

This design preserves the extension's fully local architecture, feed-first extraction strategy, current digest-selection behavior, seven-day post retention, and existing user experience. It does not add a backend, telemetry, analytics, content scripts, remotely hosted code, or broad host permissions.

## Why This Work Precedes Publication

The current publication plan assumes the extension is already Web Store-ready. Repository inspection on 2026-06-28 found that this assumption needs a preceding validation and hardening step:

- `pnpm lint`, all 128 tests, and `pnpm build` pass. The tests complete in 1.67 seconds and the production build completes in 241 milliseconds on the current workstation.
- `pnpm typecheck` did not complete after more than 60 seconds and had to be interrupted. A publication gate cannot depend on a command that may hang indefinitely.
- The production `dist/` directory is approximately 540 KiB. The popup JavaScript is 206.54 kB raw/64.49 kB gzip, the service worker is 189.17 kB raw/65.48 kB gzip, the shared source chunk is 99.06 kB raw/32.82 kB gzip, and popup CSS is 9.20 kB raw/2.64 kB gzip.
- Feed and HTML enrichment requests run sequentially. A five-entry feed without thumbnails can wait for five post-page requests one after another on every crawl.
- Post upserts perform a lookup and write for every post instead of using one indexed read and one bulk transaction.
- Startup, alarm, and manual refresh events can call `crawlAll()` concurrently within one service-worker lifetime.
- Each request has a 15-second timeout, but feed probes and enrichment requests can accumulate into a source crawl or full queue that approaches Chrome's service-worker execution limit.
- Response bodies are read without a byte limit.
- Remote thumbnail URLs can cause popup network requests to origins other than the saved source. The hard-coded AWS fallback is one explicit example. This conflicts with the repository constraint and proposed privacy statement that network calls only target user-saved sources.
- The popup reads `tabs.Tab.url` and `tabs.Tab.title`, but `manifest.config.ts` does not declare `activeTab`. Chrome documents `activeTab` as the narrow, warning-free permission for reading those properties after the user invokes the action.
- The proposed publication disclosures say no personal data is collected or used. Chrome's policy uses the broader concept of data the product handles, including locally stored user-provided data and automatically gathered content. Dashboard answers, privacy policy wording, and actual behavior must be reconciled rather than relying on the phrase “fully local.”

## Selected Approach

Use a focused, measurement-driven release gate.

1. Capture deterministic build, test, popup, crawl, network, and storage baselines.
2. Fix release-blocking correctness, resource, security, and disclosure risks.
3. Re-run the same measurements and enforce explicit budgets.
4. Produce one compliance matrix mapping every permission and data flow to implementation evidence, user-facing disclosure, and dashboard input.
5. Mark the existing publication plan as dependent on this gate.

This approach is preferred over a performance-only pass because publication risk includes privacy, permission, remote-resource, and listing consistency. It is preferred over a broad architecture rewrite because v0.1.0 needs a small reviewable delta with low regression risk.

## Scope

### Included

- Popup startup and interaction measurements.
- Production bundle and package-size budgets.
- Crawl request count, concurrency, timeout, queue continuation, and duplicate-trigger behavior.
- IndexedDB read/write efficiency and retained storage growth.
- Safe remote markup and thumbnail handling.
- Manifest permission and content-security-policy review.
- Manifest V3 remotely hosted code and packaged-code inspection.
- Dependency vulnerability and production-dependency review.
- Privacy policy, dashboard privacy fields, single-purpose statement, permission justifications, listing copy, and reviewer test instructions.
- Automated tests and a documented manual unpacked-extension test matrix.

### Excluded

- Changes to the digest selection algorithm or Q1 interpretation.
- Changes to the seven-day post-retention rule.
- Popup redesign, new product features, or new notification behavior.
- Analytics, telemetry, crash reporting, accounts, synchronization, or a backend.
- Content scripts, an options page, a side panel, or additional browser integration.
- Cross-source crawl concurrency. Sources remain sequential to avoid bursts against unrelated sites and to keep persisted queue semantics simple.

## Architecture

The implementation remains split across the existing boundaries:

- `src/background/` owns permissions, network access, crawl orchestration, continuation alarms, and all writes initiated by crawling.
- `src/lib/` contains pure policies and helpers for response limits, thumbnail eligibility, batching decisions, selection, and data types. New pure logic is unit-tested without live network access.
- `src/popup/` remains read-only against crawl data and does not fetch page or feed content. It may render only thumbnail URLs approved by the shared thumbnail policy.
- `manifest.config.ts` remains the authoritative permission and extension-page security configuration.
- `docs/` contains the compliance matrix, privacy policy, store listing, reviewer instructions, and the dependency relationship between this gate and publication.

No component sends data to a developer-controlled or third-party service. Network access remains a direct interaction between Chrome and an origin deliberately saved by the user.

## Performance Budgets

The release gate records environment details with each measurement. A result is compared with the hard budget and with the pre-change baseline; a faster workstation is not used to hide a regression.

| Area | Measurement | Release budget |
|---|---|---|
| Type checking | `pnpm typecheck` from a clean process | Completes successfully within 30 seconds |
| Lint | `pnpm lint` | Passes within 30 seconds |
| Unit/integration tests | `pnpm test` | All tests pass within 15 seconds |
| Production build | `pnpm build` | Completes within 10 seconds |
| Package size | Total `dist/` size | At most 750 KiB |
| JavaScript chunks | Gzip size of each emitted JavaScript chunk | At most 80 KiB per chunk |
| Popup cold start | Action invocation to rendered shell in a production unpacked build | Median at most 300 ms; p95 at most 750 ms over 20 runs |
| Popup local-data state | Action invocation to daily digest or its deterministic empty/error state | Median at most 500 ms; p95 at most 1,000 ms over 20 runs |
| Refresh feedback | Refresh click to visible busy state | At most 100 ms |
| Duplicate triggers | Concurrent calls in one worker lifetime | One physical crawl; all callers receive the same completion result |
| Cached feed recrawl | Existing source with unchanged five-post feed and usable stored metadata | One feed request, zero post-page enrichment requests, no new rows |
| Enrichment concurrency | Five delayed new-entry enrichments | At most three active requests and completion within three delay windows |
| Markup body | Source page, feed, or post-page response | At most 2 MiB before rejection |
| Request deadline | Any individual request | At most 10 seconds |
| Source deadline | All work for one source | At most 30 seconds |
| Crawl invocation | Work performed by one service-worker event | Stops accepting new sources by 4 minutes and persists the remaining queue |

The size budgets are guardrails, not targets that justify growth. Any increase above the checked-in baseline requires a documented reason even when it remains below the hard budget.

## Crawl Execution Design

### Single-flight orchestration

`crawlAll()` uses a module-local in-flight promise only to deduplicate concurrent events inside one live service worker. The persisted queue remains the durable source of recovery after eviction, so correctness does not depend on the module-local value.

Startup, daily alarm, continuation alarm, and popup requests all call the same single-flight entry point. Concurrent callers observe the same result rather than starting independent loops.

### Bounded work

Sources remain sequential. Within one source, new or incomplete post entries are enriched concurrently with a limit of three. Feed probing remains sequential because firing all probe URLs would create unnecessary traffic.

Each fetch has a 10-second deadline and a 2 MiB markup-body limit. A source receives a 30-second overall deadline so six failed feed probes cannot monopolize the worker. After four minutes, the orchestrator finishes the current atomic source update, leaves unprocessed source IDs in `chrome.storage.local`, schedules a one-shot continuation alarm for one minute later, and returns a result that explicitly indicates whether the queue completed.

Daily notifications are emitted only when the complete daily queue finishes. Partial continuation batches accumulate their new-post count in persisted crawl-run state so users receive at most one correct notification.

### Reuse and batching

After parsing candidate entries, the crawler performs one indexed query for all candidate `postUrl` values. Existing complete post metadata is reused, which avoids repeated post-page enrichment on unchanged feeds and HTML listings. Only new entries or entries that still lack useful summary/thumbnail metadata are enriched.

The resulting posts are written in one Dexie transaction with `bulkPut`. The transaction preserves existing IDs and the unique `postUrl` invariant. `newPostsWritten` is calculated from the preloaded URL set, not from five serial lookups.

Source success metadata is committed after the post transaction. Source failures retain the last good posts and update `lastError`. Queue checkpoint advancement happens only after the source operation reaches a terminal success, permission-skip, or recorded failure state.

## Remote Content and Thumbnail Boundary

Fetched markup is treated as untrusted data. It is parsed without `innerHTML`, `eval`, `new Function`, remote scripts, or remote styles. Redirect handling must not silently expand access beyond an origin that Chrome has granted; redirects are accepted only when the final origin is covered by an existing optional host permission.

A thumbnail is renderable only when it is:

- a packaged extension asset; or
- an HTTPS URL on the saved source hostname or a descendant subdomain.

Feed media, Open Graph images, and content images on a sibling or unrelated hostname are normalized to `undefined`; the popup renders the packaged fallback and never requests the remote URL. Existing persisted disallowed thumbnail URLs are rejected by the same render-time policy, so no data migration is required. The hard-coded AWS image fallback is removed. Post cards use `loading="lazy"`, `decoding="async"`, fixed dimensions, and a local visual fallback when an allowed image fails. The descendant-subdomain refinement is specified in `2026-06-28-thumbnail-subdomain-policy-design.md`.

This boundary keeps popup requests within the host deliberately saved by the user and its controlled subdomains, prevents sibling or unrelated CDN contacts, avoids mixed-content thumbnail loads, and makes the privacy statement testable. It does not interpret image or markup bytes as executable logic.

## Manifest and Permission Design

The target manifest uses the minimum permissions required by implemented behavior:

- `storage`: persisted settings and resumable crawl state.
- `alarms`: daily scheduling and bounded continuation.
- `contextMenus`: explicit save-source action.
- `notifications`: optional daily notification behavior already implemented.
- `activeTab`: temporary access to the current tab URL/title after the user invokes the extension action; it does not create an install warning.
- `optional_host_permissions`: `https://*/*` and `http://*/*`, requested per saved origin. HTTP compatibility is retained for user-selected legacy feeds and disclosed as direct, unencrypted access to that selected origin.

The audit must verify every declared permission has a reachable production use and that no production use relies on an undeclared permission. HTTP is never used as a fallback for an HTTPS source, and HTTPS-to-HTTP redirects are rejected.

The manifest declares an explicit extension-page content security policy that allows packaged scripts only and blocks object embedding. No remotely hosted code, dynamic code evaluation, or remotely supplied logic is allowed. The built ZIP is scanned rather than trusting source-only inspection.

## Data Inventory and Disclosure Design

The compliance matrix uses “handled locally” rather than treating “not transmitted to the developer” as equivalent to “not handled.” It inventories:

- User-saved source URLs and titles.
- Extracted post URLs, titles, summaries, publication timestamps, and permitted thumbnail URLs.
- Favorite snapshots.
- Crawl errors and timestamps.
- Daily schedule and notification preferences.
- Persisted crawl queue and notification date.

For each item, the matrix records collection trigger, purpose, storage location, retention/deletion behavior, network recipient, and whether the developer or any third party receives it.

The privacy policy must state that data is stored locally; direct requests go only to user-selected source origins; source operators can observe ordinary request metadata; no data is sent to the developer; no analytics, ads, sale, or human review occurs; and uninstalling removes extension storage. It must contain an affirmative Limited Use statement.

The Developer Dashboard answers must be chosen from the actual categories shown at submission time and must match this inventory. The plan must not prescribe blanket “No” answers where the dashboard defines locally handled source URLs, website content, or browsing-related data as a selectable category. Store copy must accurately describe best-effort thumbnails and the current digest-selection behavior, without claiming every configuration always produces exactly five posts.

## Error Handling

- Oversized, timed-out, malformed, unsupported, or unauthorized responses become sanitized per-source errors; response content is never included in the UI error.
- Permission denial is not reported as crawl success. The source remains visible with `needsPermission`, and retry remains an explicit user gesture.
- A continuation-scheduled crawl reports partial progress without clearing durable run totals or emitting a notification.
- A failed continuation alarm leaves the queue intact for the next startup, daily alarm, or manual refresh.
- Popup benchmark instrumentation is development/test-only and is excluded from the production package.
- If a performance budget fails, publication stops. The implementation may optimize or document a justified budget revision in this design, but it may not silently weaken the gate.

## Testing Strategy

### Automated

- Unit tests for response byte limits, source/run deadlines, concurrency limiting, thumbnail eligibility, redirect permission checks, and persisted run-state transitions.
- Integration tests proving cached recrawls skip enrichment, new-entry enrichment is bounded, batch writes remain idempotent, concurrent triggers share one crawl, and continuation batches produce one final notification.
- Manifest tests for exact required permissions, optional host patterns, CSP, MV3, and absence of broad required host permissions.
- Popup tests for allowed/disallowed thumbnail origins, lazy decoding attributes, failure fallback, refresh feedback, and unchanged navigation/accessibility behavior.
- Static package checks for remote scripts, `eval`, `new Function`, unexpected executable files, source maps if excluded by packaging policy, and undeclared network constants.
- A dependency audit that fails on unresolved production high/critical advisories and records reviewed lower-severity advisories.

### Manual unpacked-extension matrix

- Fresh install and upgrade from the current schema.
- Save through the popup and context menu on HTTPS sources.
- Permission grant, denial, retry, and revoked-permission recovery.
- Declared RSS, Atom, common-path feed, feed-less HTML, redirect, oversized response, slow source, malformed feed, and offline behavior.
- Concurrent startup/manual refresh and manual/daily-alarm simulations.
- Popup cold/warm measurements with zero, five, and at least twenty sources.
- Daily notification opt-in/off behavior.
- Service-worker termination between queue checkpoints followed by recovery.
- Built ZIP inspection and loading with no extension, popup, or service-worker console errors.

No manual test uses live network inside automated tests. Live sites are confined to the documented manual compatibility matrix.

## Documentation and Publication Dependency

The implementation produces:

- A checked-in performance baseline and release-budget report.
- A Chrome Web Store compliance matrix with implementation evidence.
- Updated privacy policy and store-listing reference copy.
- Reviewer test instructions that explain the permission grant and core digest workflow.
- An amended `docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md` whose first prerequisite is successful completion of the optimization/compliance gate.

Publication may begin only when all automated gates pass, manual testing has no unresolved release-blocking findings, disclosure artifacts match the final ZIP, and the plan's completion checklist is signed with the tested extension version and ZIP checksum.

## Acceptance Criteria

- Every performance budget in this design passes and has reproducible evidence.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all complete successfully.
- Concurrent crawl triggers do not duplicate physical work.
- Unchanged cached feeds do not repeatedly fetch post pages for enrichment.
- Crawls respect request, source, response-size, concurrency, and invocation bounds and recover through the persisted queue.
- Popup network requests cannot target a thumbnail origin unrelated to the saved source.
- The manifest requests only permissions exercised by production features, including `activeTab` for current-tab metadata.
- The built ZIP contains no remote or dynamically evaluated code.
- The privacy policy, dashboard responses, listing copy, manifest, reviewer instructions, and runtime behavior agree.
- None of the seven repository constraints is violated.
- The existing Chrome Web Store publication plan cannot be executed until this gate is recorded as complete.

## Policy References

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines/)
- [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [`activeTab` permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
