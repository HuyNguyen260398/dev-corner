# Pre-publication release report

## Release identity

| Field | Value |
|---|---|
| Date | 2026-06-30 (Asia/Ho_Chi_Minh, UTC+07) |
| OS | macOS 26.5.1 (Build 25F80), arm64 |
| Chrome | 149.0.7827.197 |
| Node.js used for release gate | 24.18.0 |
| pnpm | 11.5.2 |
| Package source commit | `d19ce163601e5f56647c110c32b9ab8e6c159070` |
| Release branch | `codex/chrome-webstore-publication-readiness` |
| Extension version | 0.1.0 |

## Automated release gate

All commands ran against the commit above with the production package built from `dist/`.

| Command | Result | Duration/evidence |
|---|---|---|
| `pnpm verify:release` | Pass | 6.39 seconds total |
| TypeScript strict check | Pass | `tsc --noEmit`, zero errors |
| ESLint | Pass | zero errors |
| Vitest | Pass | 17 files, 163 tests, 1.97 seconds |
| Production build | Pass | 243 modules, 90 milliseconds |
| `pnpm verify:package` | Pass | 512,071 total bytes; MV3, permission, executable-code, and size gates passed |
| `pnpm audit --prod --audit-level high` | Pass | No known vulnerabilities, 0.50 seconds |

### Package measurements

| JavaScript file | Raw bytes | Gzip bytes | 80 KiB gzip budget |
|---|---:|---:|---|
| `assets/index.html-B_-DMQF2.js` | 206,701 | 63,854 | Pass |
| `assets/index.ts-CiQcQa8p.js` | 192,775 | 66,121 | Pass |
| `assets/sources-O4m80wH6.js` | 99,408 | 32,673 | Pass |
| `service-worker-loader.js` | 40 | 60 | Pass |

Total unpacked package size is 512,071 bytes, below the 750 KiB budget. The verifier found no `eval`, `new Function`, remote script tag, remote source map, required host permission, or non-MV3 manifest.

## Popup performance

Measurements used Chrome's DevTools Protocol against the production unpacked extension in a dedicated profile. Each sample invoked `chrome.action.openPopup()` and measured wall time from invocation until the rendered shell and deterministic local-data state were observable. Each popup target was closed before the next sample. Local data was ready at the first shell observation in every sample, so the shell and local-data values are equal upper bounds.

### Zero sources — 20 cold openings

| Run | Shell ms | Local data ms |
|---:|---:|---:|
| 1 | 306.75 | 306.75 |
| 2 | 54.13 | 54.13 |
| 3 | 52.32 | 52.32 |
| 4 | 299.71 | 299.71 |
| 5 | 51.93 | 51.93 |
| 6 | 299.26 | 299.26 |
| 7 | 54.53 | 54.53 |
| 8 | 54.69 | 54.69 |
| 9 | 54.87 | 54.87 |
| 10 | 52.00 | 52.00 |
| 11 | 298.00 | 298.00 |
| 12 | 52.17 | 52.17 |
| 13 | 54.57 | 54.57 |
| 14 | 52.54 | 52.54 |
| 15 | 55.82 | 55.82 |
| 16 | 310.04 | 310.04 |
| 17 | 59.17 | 59.17 |
| 18 | 61.60 | 61.60 |
| 19 | 54.40 | 54.40 |
| 20 | 58.94 | 58.94 |

| Metric | Result | Budget | Status |
|---|---:|---:|---|
| Shell median | 54.78 ms | ≤300 ms | Pass |
| Shell p95 | 306.75 ms | ≤750 ms | Pass |
| Local-data median | 54.78 ms | ≤500 ms | Pass |
| Local-data p95 | 306.75 ms | ≤1,000 ms | Pass |

### Twenty sources and 100 local posts — 20 cold openings

| Run | Shell ms | Local data ms |
|---:|---:|---:|
| 1 | 245.58 | 245.58 |
| 2 | 54.52 | 54.52 |
| 3 | 60.52 | 60.52 |
| 4 | 58.20 | 58.20 |
| 5 | 59.44 | 59.44 |
| 6 | 55.64 | 55.64 |
| 7 | 53.12 | 53.12 |
| 8 | 58.06 | 58.06 |
| 9 | 55.31 | 55.31 |
| 10 | 52.70 | 52.70 |
| 11 | 52.56 | 52.56 |
| 12 | 53.82 | 53.82 |
| 13 | 52.81 | 52.81 |
| 14 | 57.29 | 57.29 |
| 15 | 61.62 | 61.62 |
| 16 | 54.93 | 54.93 |
| 17 | 51.95 | 51.95 |
| 18 | 52.63 | 52.63 |
| 19 | 71.52 | 71.52 |
| 20 | 61.06 | 61.06 |

| Metric | Result | Budget | Status |
|---|---:|---:|---|
| Shell median | 55.47 ms | ≤300 ms | Pass |
| Shell p95 | 71.52 ms | ≤750 ms | Pass |
| Local-data median | 55.47 ms | ≤500 ms | Pass |
| Local-data p95 | 71.52 ms | ≤1,000 ms | Pass |

Refresh feedback appeared in 0.70 ms, below the 100 ms budget.

## Storage and retention

The dedicated Chrome profile was seeded with 20 sources over eight crawl-day partitions (`2026-06-22` through `2026-06-29`). A completed crawl pruned the oldest partition and retained exactly seven days (`2026-06-23` through `2026-06-29`) containing 140 posts.

Source-deletion validation produced zero remaining source rows and zero normal posts for the removed source. Its independent favorite snapshot remained present. This confirms the seven-day retention, unsubscribe cleanup, and favorite-retention disclosures.

## Unpacked-extension functional matrix

All cases were executed in isolated Chrome profiles against the production `dist/` build. The browser matrix was recorded for package commit `dbf8dee0635bb26026b2cae1255fc60e11d66a3d`; only release documentation and the merge commit changed between that commit and package source commit `d19ce163601e5f56647c110c32b9ab8e6c159070`. A fresh release build at the latter commit produced the same filenames, raw chunk sizes, and total unpacked size.

| Case | Status | Evidence |
|---|---|---|
| Fresh install and initial navigation | Pass | Daily Posts opened first; Daily, Favorite, and Sources tabs rendered |
| Current-schema upgrade | Pass | Native IndexedDB version 10 upgraded to 20; existing source/post survived; `favoritePosts` was added |
| Popup subscription | Pass | User-granted origin was saved and crawled |
| Context-menu subscription | Pass | Kubernetes Blog was saved through “Save to dev-corner” |
| Permission grant, denial, and retry | Pass | Denied source remained with Needs permission; explicit retry recovered |
| Permission revoke and recovery | Pass | Revocation caused Needs permission; re-grant recovered |
| Unused-origin grant removal | Pass | `chrome.permissions.contains` returned false after final source removal |
| Declared RSS | Pass | Local fixture produced five posts |
| Declared Atom | Pass | Local fixture produced five posts |
| Common-path feed | Pass | Undeclared `/feed` fixture produced five posts |
| Feed-less HTML fallback | Pass | HTML/OG fixture produced five posts |
| Cross-origin redirect | Pass | Redirect to an ungranted origin was rejected |
| Oversized response | Pass | Response above 2,097,152 bytes was rejected |
| Slow source | Pass | Request terminated at the 10-second boundary |
| Malformed feed | Pass | Invalid feed fell back to HTML and produced posts |
| HTTP source | Pass | Explicitly granted local HTTP sources crawled |
| HTTPS-to-HTTP redirect | Pass | Downgrade was refused |
| Offline source | Pass | Stopped fixture recorded a terminal source error; refresh did not hang |
| Startup/manual overlap | Pass | Shared crawl completed; queue/run state cleared; no duplicate rows |
| Daily/manual overlap | Pass | Shared crawl completed once; no stale queue/run state |
| Worker termination and continuation | Pass | Persisted checkpoint resumed after worker reload; final state was cleared |
| Notification default and opt-in | Pass | Off on fresh install; explicit UI opt-in persisted |
| Final-batch notification | Pass | Exactly one `daily-digest-*` notification appeared after continuation completion |
| Source deletion and favorites | Pass | Normal posts disappeared; favorite snapshot remained |
| HTTPS thumbnail variants | Pass | Same-host, subdomain, and source-selected third-party HTTPS images rendered |
| Rejected thumbnail variants | Pass | HTTP, `data:`, executable, and malformed URLs used the packaged fallback |
| Console health | Pass | No uncaught popup, service-worker, or extension-page errors |

## Manifest and security snapshot

- Manifest version: 3; minimum Chrome version: 103.
- Required permissions: `activeTab`, `storage`, `alarms`, `contextMenus`, `notifications`.
- Optional host patterns: `http://*/*`, `https://*/*`; no required `host_permissions`.
- Extension-page CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; connect-src https: http:; img-src 'self' data: https:`.
- All executable code is packaged locally. Remote HTML, feeds, and images are treated as data.

## Submission ZIP

| Field | Value |
|---|---|
| Filename | `extension-v0.1.0.zip` |
| Compressed size | 171,209 bytes |
| Uncompressed contents | 512,071 bytes |
| SHA-256 | `4626324c6e67b7f7767cb617fd9cac2b4e90dc4acd41bfbe302819674cee8c8c` |

`manifest.json` is at the ZIP root. Inspection found no tests, source maps, package-manager cache, source TypeScript, dependencies, or development-only files.

## Repository constraints

All seven repository constraints were checked and preserved:

1. No backend or remote service was added.
2. Worker progress is persisted and scheduled through `chrome.alarms`; production background code contains no `setTimeout` or `setInterval`.
3. Worker parsing uses the bundled DOMParser-compatible path and does not access `document`.
4. Cross-context messages remain typed through the discriminated unions with exhaustive request handling.
5. Post persistence remains idempotent through the unique `postUrl` index and batched upserts.
6. Crawls remain limited to user-saved/granted source origins; thumbnails accept only source-selected HTTPS URLs or the packaged fallback; no telemetry was added.
7. TypeScript strict mode passes with no `any` introduced.

## Final gate conclusion

The automated gate, production dependency audit, package budgets, browser performance budgets, storage invariants, manual functional matrix, manifest review, and tested ZIP all pass for package source commit `d19ce163601e5f56647c110c32b9ab8e6c159070` and extension version 0.1.0.
