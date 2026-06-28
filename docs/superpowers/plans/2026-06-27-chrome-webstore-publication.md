# Chrome Web Store Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute this plan task-by-task only after the pre-publication gate passes.

**Goal:** Publish Dev Corner v0.1.0 as a public Chrome Web Store listing using the tested package and approved compliance artifacts.

**Depends on:** `docs/superpowers/plans/2026-06-28-pre-publication-performance-compliance.md`

**Architecture:** Publication consumes the verified Manifest V3 package, privacy policy, compliance matrix, store listing, reviewer instructions, and release report produced by the pre-publication plan. Publication work does not change extension behavior or permissions.

**Tech stack:** Chrome Web Store Developer Dashboard and GitHub Pages for the public privacy-policy URL.

## Global constraints

- Manifest and package version remain `0.1.0` for this submission.
- Do not add permissions, analytics, telemetry, remote code, or production behavior during publication.
- Use the exact ZIP checksum recorded in `docs/PRE_PUBLICATION_RELEASE_REPORT.md`.
- Store descriptions must say “up to five available posts,” matching the implemented selection behavior.
- Dashboard disclosures must include Website content and, conservatively, Web history for explicitly saved URLs.
- Permission justifications must cover `activeTab`, `storage`, `alarms`, `contextMenus`, `notifications`, and optional host permissions.
- The notification-default claim must be verified by the Task 2 integration and popup tests; it is not an assumption.
- Privacy policy, dashboard answers, listing copy, reviewer instructions, manifest, and submitted ZIP must describe the same behavior.

---

### Task 0: Verify the pre-publication performance and compliance gate

**Depends on:** `docs/superpowers/plans/2026-06-28-pre-publication-performance-compliance.md`

- [ ] Run `pnpm verify:release`; stop if any command or budget fails.
- [ ] Confirm `docs/PRE_PUBLICATION_RELEASE_REPORT.md` records Pass for every manual case against the current commit and extension version.
- [ ] Recompute `shasum -a 256` for the submission ZIP and confirm it matches the report.
- [ ] Confirm the privacy policy, store listing, dashboard disclosure mapping, reviewer instructions, manifest, and tested ZIP describe the same behavior.

No later publication task is authorized until all four checks pass.

---

### Task 1: Verify and deploy the privacy policy

**Consumes:** `docs/privacy-policy.html`, `docs/CHROME_WEB_STORE_COMPLIANCE.md`

- [ ] Compare the privacy policy against the compliance matrix and current package behavior.
- [ ] Confirm it discloses local source/post/favorite/settings/crawl data, direct requests to saved origins, HTTP risk, retention/deletion, and Limited Use.
- [ ] Enable GitHub Pages from the repository `main` branch and `/docs` folder if it is not already enabled.
- [ ] Open `https://huyng260398.github.io/dev-corner/privacy-policy.html` in a private window.
- [ ] Confirm the page is public, current, readable, and matches the committed file.

Do not edit policy substance during deployment. Any inconsistency returns to the owning pre-publication task.

---

### Task 2: Verify listing copy and reviewer instructions

**Consumes:** `docs/store-listing.md`, `docs/chrome-web-store-reviewer-instructions.md`

- [ ] Confirm the listing states the single purpose and says “up to five available posts.”
- [ ] Confirm it discloses local storage, direct requests to saved/granted origins, conservative Website content and Web history mapping, and no remote code.
- [ ] Confirm the short description is no more than 132 characters.
- [ ] Confirm every manifest permission has a matching justification, including `activeTab`.
- [ ] Confirm reviewer steps need no credentials and exercise subscribe, grant, refresh, favorite, unsubscribe, and notification-default behavior.
- [ ] Confirm the Task 2 automated tests demonstrate that notifications are off by default.

---

### Task 3: Capture store screenshots

**Produces locally:**

- `~/Desktop/screenshot-1-digest.png`
- `~/Desktop/screenshot-2-sources.png`
- `~/Desktop/screenshot-3-favorites.png`

- [ ] Load the verified `dist/` package as an unpacked extension in a dedicated Chrome profile.
- [ ] Save and grant two or three HTTPS developer-blog sources, then refresh.
- [ ] Capture Daily Posts showing available post cards and the navigation UI.
- [ ] Capture Sources showing saved sources, scheduling, and notification controls.
- [ ] Favorite one available post and capture Favorite Posts.
- [ ] Export every screenshot at 1280×800 px or 640×400 px, PNG or JPEG, no more than 2 MB.
- [ ] Review screenshots for private browsing data, unrelated tabs, debug UI, and misleading content before upload.

---

### Task 4: Verify and package the submission artifact

- [ ] Run `pnpm verify:release` from a clean process.
- [ ] Confirm `dist/manifest.json` is at the package root and contains Manifest V3, Chrome 103 minimum, the approved permissions, optional host patterns, and explicit CSP.
- [ ] Create the ZIP from inside `dist/` so `manifest.json` is at the ZIP root:

  ```bash
  cd dist
  zip -r ../extension-v0.1.0.zip .
  cd ..
  ```

- [ ] Inspect `unzip -l extension-v0.1.0.zip` for accidental source, fixture, cache, or dependency files.
- [ ] Run `shasum -a 256 extension-v0.1.0.zip` and confirm it matches `docs/PRE_PUBLICATION_RELEASE_REPORT.md`.
- [ ] Stop if the checksum, manifest, package budgets, or report do not match.

---

### Task 5: Prepare the Chrome Web Store developer account

- [ ] Open the Chrome Web Store Developer Dashboard with the intended publisher account.
- [ ] Complete the one-time registration flow if required.
- [ ] Confirm two-step verification is enabled for the publisher account.
- [ ] Verify the public publisher name, contact email, and support contact before creating the item.

---

### Task 6: Create the listing and upload the verified ZIP

**Consumes:** the verified ZIP, screenshots, privacy-policy URL, `docs/store-listing.md`, `docs/CHROME_WEB_STORE_COMPLIANCE.md`, and `docs/chrome-web-store-reviewer-instructions.md`.

- [ ] Create a new public item and upload `extension-v0.1.0.zip`.
- [ ] Confirm the dashboard reads version `0.1.0` and reports no package errors.
- [ ] Copy the name, short description, detailed description, and single-purpose statement from `docs/store-listing.md`.
- [ ] Upload `public/icons/icon-128.png` and the reviewed screenshots.
- [ ] Enter the verified public privacy-policy URL.
- [ ] Enter the reviewer instructions from `docs/chrome-web-store-reviewer-instructions.md`.

#### Privacy practices

- [ ] Declare Website content because the extension extracts post titles, summaries, links, timestamps, and permitted thumbnails.
- [ ] Declare Web history conservatively because explicitly saved source URLs are stored; state that general browsing is not monitored.
- [ ] Do not select personally identifiable, health, financial, authentication, personal communications, location, or general user-activity categories because the package does not handle them.
- [ ] Certify that data is used only for the stated single purpose, remains local except for direct requests to selected source operators, is not sold or used for advertising or creditworthiness, and is not read by humans.
- [ ] Certify Limited Use.
- [ ] Select “No” for remote code; remote markup and images are data and all executable logic is packaged.

#### Permission justifications

- [ ] `activeTab`: temporarily reads the current page URL/title after toolbar invocation so the user can subscribe; it does not monitor browsing.
- [ ] `storage`: persists settings and resumable crawl state across restart and MV3 eviction.
- [ ] `alarms`: schedules the optional daily crawl and one-shot continuation without worker timers.
- [ ] `contextMenus`: saves a page or link explicitly selected by the user.
- [ ] `notifications`: sends an optional completed-digest alert; Task 2 tests verify it is off by default.
- [ ] Optional host permissions: fetch RSS, Atom, HTML, and permitted same-origin thumbnails only for origins explicitly saved and granted by the user.

- [ ] Set visibility to Public and choose the intended regions.
- [ ] Save the draft and compare the listing preview against every committed artifact.

---

### Task 7: Submit for review and record the submission

- [ ] Open the privacy policy in a private window.
- [ ] Confirm the uploaded ZIP checksum still matches the release report.
- [ ] Confirm screenshots, icon, descriptions, data disclosures, permission justifications, and reviewer instructions render correctly.
- [ ] Confirm the dashboard has no warnings or incomplete fields.
- [ ] Submit for review and verify the status changes to Pending review.
- [ ] Record the submission date, item ID, submitted version, checksum, and dashboard status in the release record or release issue.
- [ ] If review is rejected, capture the exact policy finding and create a separately scoped remediation plan before changing code or disclosures.

---

## Self-review

| Requirement | Covered by |
|---|---|
| Pre-publication performance/compliance gate | Task 0 |
| Public privacy policy | Task 1 |
| Accurate listing and reviewer copy | Task 2 |
| Store screenshots | Task 3 |
| Verified ZIP and checksum | Task 4 |
| Developer account and two-step verification | Task 5 |
| Privacy practices and permission justifications | Task 6 |
| Submission and traceability | Task 7 |

Publication remains blocked until Task 0 and every later prerequisite are complete.
