# Chrome Web Store publication readiness cross-check

**Audit date:** 2026-06-30

**Repository HEAD:** `d19ce163601e5f56647c110c32b9ab8e6c159070` (`main`)

**Target version:** `0.1.0`

## Purpose

This document records the cross-check between:

- `docs/superpowers/plans/2026-06-28-pre-publication-performance-compliance.md`
- `docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md`

The pre-publication implementation is materially complete, but publication Task 0 cannot yet pass. Do not upload or submit the extension until the blockers below are resolved.

## Readiness summary

| Check | Status | Evidence |
|---|---|---|
| TypeScript strict check | Pass | Direct `tsc --noEmit` completed with zero errors |
| ESLint | Pass | Direct ESLint invocation completed with zero errors |
| Tests | Pass | 17 test files and 163 tests passed |
| Production build | Pass | Vite built 243 modules successfully |
| Package verification | Pass | 512,071 bytes total; all JavaScript chunks remained below the 80 KiB gzip budget |
| Manifest | Pass | MV3, version 0.1.0, Chrome 103 minimum, approved required permissions, optional host patterns, and explicit CSP |
| Compliance artifact consistency | Pass | Privacy policy, listing, reviewer instructions, compliance matrix, manifest, and implementation describe the same behavior |
| Store short description | Pass | 129 characters, below the 132-character limit |
| Notification default | Pass | Implementation and automated tests confirm notifications are disabled by default |
| Exact `pnpm verify:release` command | Resolved | Passed under Node.js 24.18.0 and pnpm 11.5.2 on 2026-06-30 |
| Submission ZIP | Resolved | `extension-v0.1.0.zip` created and inspected; SHA-256 recorded in the release report |
| Release identity | Resolved | Release report identifies package source commit `d19ce16` and distinguishes the release-document branch |
| Public privacy policy | Resolved | GitHub Pages serves the committed policy at the corrected URL; remote and local SHA-256 hashes match |
| Store screenshots | Blocked | The three planned screenshots are not present on the Desktop |
| Small promotional image | Blocked | The required 440x280 promotional tile is absent and was omitted from the publication plan |
| Publisher account | Not verified | Registration, publisher details, contact email, and two-step verification require dashboard access |

## Verified package details

The freshly generated `dist/manifest.json` contains:

- `manifest_version`: 3
- `version`: `0.1.0`
- `minimum_chrome_version`: `103`
- Required permissions: `activeTab`, `storage`, `alarms`, `contextMenus`, `notifications`
- Optional host permissions: `http://*/*`, `https://*/*`
- No required `host_permissions`
- An explicit extension-page content security policy

Fresh package measurements:

| JavaScript file | Raw bytes | Gzip bytes |
|---|---:|---:|
| `assets/index.html-B_-DMQF2.js` | 206,701 | 63,854 |
| `assets/index.ts-CiQcQa8p.js` | 192,775 | 66,121 |
| `assets/sources-O4m80wH6.js` | 99,408 | 32,673 |
| `service-worker-loader.js` | 40 | 60 |

Total unpacked package size: **512,071 bytes**.

## Compliance consistency findings

The committed privacy policy, listing, compliance matrix, reviewer instructions, manifest, and implementation consistently state that:

- Dev Corner has one purpose: building a local digest from sources explicitly saved by the user.
- Data remains local except for direct requests to saved/granted source origins and source-selected HTTPS thumbnail hosts.
- Website content and, conservatively, Web history are disclosed in the Web Store dashboard.
- Notifications are optional and disabled by default.
- Normal posts are retained for seven crawl days; favorites remain until explicitly removed.
- The extension has no backend, account, analytics, advertising, telemetry, or remote executable code.
- The digest contains up to five available posts, preserving the documented `N > 5` behavior.
- Every manifest permission has a matching justification.

## Blocking findings

### 1. Release command environment mismatch — resolved

The exact `pnpm verify:release` command initially could not complete because global pnpm 11.9.0 hung under Node.js 26.4.0.

Node.js 24.18.0 was installed as a keg-only Homebrew runtime, and Corepack provided the repository-declared pnpm 11.5.2 without replacing the system-default Node.js. The exact release gate then passed: 17 test files, 163 tests, production build, and package verification.

### 2. Missing submission ZIP — resolved

The new release artifact is:

- Filename: `extension-v0.1.0.zip`
- Compressed size: 171,209 bytes
- Uncompressed contents: 512,071 bytes
- SHA-256: `4626324c6e67b7f7767cb617fd9cac2b4e90dc4acd41bfbe302819674cee8c8c`

Archive inspection confirms that `manifest.json` is at the ZIP root and that no source TypeScript, tests, fixtures, dependencies, caches, or source maps are included. The release report now records the same filename and checksum.

### 3. Privacy policy is not public — resolved

The plan specifies:

`https://huyng260398.github.io/dev-corner/privacy-policy.html`

This URL returned HTTP 404 and misspelled the repository owner. The corrected URL is:

`https://huynguyen260398.github.io/dev-corner/privacy-policy.html`

GitHub Pages is now enabled from `main` and `/docs` with HTTPS enforcement. The corrected URL returns HTTP 200, and the deployed response has the same SHA-256 as `docs/privacy-policy.html`: `c53fe9275d7db8794e2005b4e0e2c27ab37fb7ac2a7654d46a90bdda8fe23adb`.

### 4. Listing images are incomplete

The planned screenshots are absent:

- `~/Desktop/screenshot-1-digest.png`
- `~/Desktop/screenshot-2-sources.png`
- `~/Desktop/screenshot-3-favorites.png`

Current Chrome Web Store guidance also requires a small **440x280 promotional image**. The publication plan currently mentions the icon and screenshots but omits this asset.

Official references:

- [Supplying Images](https://developer.chrome.com/docs/webstore/images)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)

### 5. Publisher account prerequisites are unverified

Dashboard access is required to verify:

- Developer registration
- Publisher name
- Verified contact email
- Support contact
- Two-step verification

Two-step verification is required before publishing or updating a Chrome Web Store extension.

Official references:

- [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account/)
- [Chrome Web Store two-step verification policy](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)

## Resume sequence

Complete these steps in order:

1. Capture the three store screenshots at 1280x800 or 640x400.
2. Create a 440x280 small promotional image consistent with the extension branding.
3. Verify the Chrome Web Store developer account, contact email, publisher identity, and two-step verification.
4. Re-run publication Task 0 in full.
5. Only after Task 0 passes, create the Web Store item, upload the verified ZIP, populate the listing/privacy/test-instruction fields, and save the draft for final review.

## Stop conditions

Do not proceed to upload or submission if any of these conditions occur:

- `pnpm verify:release` fails or does not complete.
- The ZIP checksum differs from the release report.
- The privacy-policy URL is not publicly reachable.
- Dashboard disclosures differ from the committed policy or package behavior.
- Required listing images are missing or rejected by the dashboard.
- The dashboard reports package errors, warnings, or incomplete required fields.
