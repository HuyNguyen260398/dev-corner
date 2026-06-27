# Chrome Web Store Publication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish dev-corner v0.1.0 to the Chrome Web Store as a public listing.

**Architecture:** The extension is already Web Store-ready: Manifest V3, `optional_host_permissions` with per-origin request flow implemented, permission denial UI in place, and all 128 tests passing. The remaining work is a hosted privacy policy, store assets (screenshots), and completing the Developer Dashboard submission form.

**Tech Stack:** Chrome Web Store Developer Dashboard, GitHub Pages (for hosting the privacy policy at no cost).

## Global Constraints

- Extension name in manifest: `dev-corner`. Store display name may be set to "Dev Corner" (check uniqueness in the dashboard).
- Version: `0.1.0` (already set in `manifest.config.ts` and `package.json`).
- Privacy policy must be publicly accessible before submitting.
- No code changes that add permissions, analytics, or telemetry.
- GitHub Pages URL will be `https://huyng260398.github.io/dev-corner/` — verify exact casing of your username in the GitHub Pages settings UI.
- Store screenshots must be exactly 1280×800 px or 640×400 px (PNG or JPEG, ≤ 2 MB each).
- Store icon 128×128 already exists at `public/icons/icon-128.png`.

---

### Task 1: Write and host the privacy policy on GitHub Pages

**Files:**
- Create: `docs/privacy-policy.html`
- No test file (manual verification: visit the live URL after push)

**Interfaces:**
- Produces: a publicly accessible URL, e.g. `https://huyng260398.github.io/dev-corner/privacy-policy.html`, needed by Tasks 6 and 7.

- [ ] **Step 1: Enable GitHub Pages on the repository**

  In your browser:
  1. Go to `https://github.com/HuyNguyen260398/dev-corner/settings/pages`
  2. Under **Source**, select **Deploy from a branch**.
  3. Branch: `main`, Folder: `/docs`.
  4. Click **Save**.
  5. Wait ~2 minutes; GitHub will show the live URL (typically `https://huyng260398.github.io/dev-corner/`).

- [ ] **Step 2: Write the privacy policy file**

  Create `docs/privacy-policy.html` with this content:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dev Corner — Privacy Policy</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.1rem; margin-top: 2rem; }
    </style>
  </head>
  <body>
    <h1>Dev Corner — Privacy Policy</h1>
    <p><strong>Effective date:</strong> 2026-06-27</p>

    <h2>Summary</h2>
    <p>Dev Corner does not collect, transmit, or share any personal data. All data stays in your browser.</p>

    <h2>What data is stored</h2>
    <p>Dev Corner stores the following data exclusively in your browser's local IndexedDB and <code>chrome.storage.local</code>:</p>
    <ul>
      <li>The URLs and titles of blog sources you choose to subscribe to.</li>
      <li>Posts (title, summary, thumbnail URL, post URL) fetched from those sources.</li>
      <li>Posts you mark as favorites.</li>
      <li>Your settings (whether to enable the daily crawl and daily notifications).</li>
    </ul>
    <p>This data never leaves your device. No server ever receives it.</p>

    <h2>Network requests</h2>
    <p>The only outbound network requests Dev Corner makes are fetches to the specific blog URLs you have subscribed to. These requests are made directly from your browser to the source website — no proxy, no intermediary service, and no data is recorded by us. Chrome grants per-origin permission for each source only when you explicitly subscribe to it.</p>

    <h2>Permissions and why they are needed</h2>
    <ul>
      <li><strong>storage</strong> — persists your settings (daily crawl on/off, notifications on/off) across browser restarts.</li>
      <li><strong>alarms</strong> — schedules the optional daily crawl at 07:00 in your local time zone.</li>
      <li><strong>contextMenus</strong> — adds a "Save to Dev Corner" entry to the right-click context menu on pages and links.</li>
      <li><strong>notifications</strong> — sends an optional desktop notification after the morning crawl when new posts are found.</li>
      <li><strong>optional host permissions (per origin)</strong> — when you subscribe to a source, Chrome asks you to grant access to that specific site. Dev Corner only accesses sites you have explicitly subscribed to.</li>
    </ul>

    <h2>Third parties</h2>
    <p>Dev Corner does not use any third-party analytics, tracking, or advertising services. No data is sold or shared with anyone.</p>

    <h2>Data deletion</h2>
    <p>To delete all locally stored data, uninstall the extension. You can also remove individual sources and their posts from within the extension's Sources tab.</p>

    <h2>Contact</h2>
    <p>Questions? Email <a href="mailto:huynguyen260398@gmail.com">huynguyen260398@gmail.com</a>.</p>
  </body>
  </html>
  ```

- [ ] **Step 3: Commit and push**

  ```bash
  git add docs/privacy-policy.html
  git commit -m "docs: add privacy policy for Chrome Web Store submission"
  git push
  ```

- [ ] **Step 4: Verify the live URL**

  Wait ~2 minutes after pushing, then open:
  `https://huyng260398.github.io/dev-corner/privacy-policy.html`

  Expected: the privacy policy page renders with the correct content.
  If it 404s, double-check the GitHub Pages source folder is set to `/docs` (not `/ (root)`).

---

### Task 2: Prepare store listing copy

**Files:**
- Create: `docs/store-listing.md` (reference document; not published, just for copy-pasting into the dashboard)

**Interfaces:**
- Produces: all text fields needed in Task 6 (name, descriptions, justifications).

- [ ] **Step 1: Write the store listing reference document**

  Create `docs/store-listing.md` with this content:

  ```markdown
  # Dev Corner — Chrome Web Store Listing Copy

  ## Store name (max 75 chars)
  Dev Corner

  ## Short description (max 132 chars)
  Your personal developer reading digest. Subscribe to any blog, get a curated daily 5-post feed. Fully local — no accounts, no backend.

  ## Full description (pasted into the dashboard; plain text or basic markdown)

  Dev Corner turns the developer blogs you follow into a single daily reading digest — right in your browser toolbar. No sign-up, no backend, no data leaves your machine.

  ─────────────────────────
  HOW IT WORKS
  ─────────────────────────

  1. Click the toolbar icon and open the Sources tab.
  2. Subscribe to any blog or feed URL — or right-click any page and choose "Save to Dev Corner".
  3. Dev Corner discovers and crawls the RSS/Atom feed automatically (or falls back to HTML parsing for feed-less sites).
  4. Open the popup to see today's curated 5-post digest with titles, summaries, and thumbnails.

  ─────────────────────────
  FEATURES
  ─────────────────────────

  • Feed-first extraction — auto-discovers RSS 2.0 and Atom feeds; falls back to HTML heuristics when no feed exists.
  • Daily digest — date-seeded selection picks 5 posts across your sources for variety; stable if you re-open the popup.
  • Favorites tab — star any post to keep it permanently, independent of crawl cycles.
  • Daily crawl options — crawl on browser startup, plus an optional 07:00 AM alarm; optional desktop notification when new posts arrive.
  • Fully local — all data lives in your browser's IndexedDB. No server, no account, no analytics.
  • Per-origin permissions — Chrome asks for access only to the specific sites you subscribe to; nothing else is ever fetched.

  ─────────────────────────
  PERMISSIONS EXPLAINED
  ─────────────────────────

  • Storage — saves your settings (crawl schedule, notifications) across sessions.
  • Alarms — runs the optional daily crawl at 07:00 AM in your local time zone.
  • Context menus — adds "Save to Dev Corner" to the right-click menu on pages and links.
  • Notifications — sends an optional morning alert when new posts are found (off by default).
  • Host permissions (optional, per-origin) — when you subscribe to a source, Chrome asks for access to that specific site. Only sites you subscribe to are ever accessed.

  ## Category
  Productivity

  ## Language
  English (United States)

  ## Permission justifications (entered one-by-one in the dashboard)

  ### storage
  Stores your settings (daily crawl on/off, notifications on/off) so they persist across browser sessions. No personal data is stored.

  ### alarms
  Schedules the optional daily crawl at 07:00 AM in your local time zone using chrome.alarms (MV3 service workers cannot use setInterval).

  ### contextMenus
  Adds a "Save to Dev Corner" item to the right-click context menu so you can subscribe to the current page or a right-clicked link without opening the popup.

  ### notifications
  Sends a desktop notification after the morning crawl when new posts are found. Off by default; the user opts in from the Sources tab.

  ### optional host permissions (http://*/* and https://*/*)
  The extension needs to fetch the RSS/Atom feed and page content from each blog the user subscribes to. Permissions are requested per-origin at subscribe time so Chrome only grants access to the specific sites the user has chosen — no other sites are ever accessed.
  ```

- [ ] **Step 2: Commit the reference document**

  ```bash
  git add docs/store-listing.md
  git commit -m "docs: add Chrome Web Store listing copy reference"
  git push
  ```

---

### Task 3: Take extension screenshots

**Files:**
- Produce: 3 PNG screenshot files saved locally (not committed; upload directly to the dashboard)
  - `~/Desktop/screenshot-1-digest.png` (1280×800)
  - `~/Desktop/screenshot-2-sources.png` (1280×800)
  - `~/Desktop/screenshot-3-favorites.png` (1280×800)

**Interfaces:**
- Consumes: a running production build from Task 4.
- Produces: screenshot files used in Task 6.

> **Note:** Screenshots require a loaded, working extension. Complete **Task 4** (build) first, then come back to this task to take screenshots.

- [ ] **Step 1: Load the production build in Chrome**

  Run:
  ```bash
  pnpm build
  ```
  Then in Chrome:
  1. Open `chrome://extensions`
  2. Enable **Developer mode** (top-right toggle)
  3. Click **Load unpacked**, select the `dist/` folder
  4. Add 2–3 real blog sources so the digest is populated (e.g. `https://css-tricks.com`, `https://overreacted.io`, `https://kentcdodds.com`)
  5. Click the toolbar icon, then click "Refresh" to trigger a crawl

- [ ] **Step 2: Take screenshot 1 — Daily digest tab**

  1. Click the Dev Corner toolbar icon; the Daily tab should show 5 posts with titles, thumbnails, and summaries.
  2. Resize the popup to be visible (or use a pinned window approach).
  3. Use macOS Screenshot (`Cmd+Shift+4`) or Chrome DevTools device toolbar set to 1280×800 to capture.
  4. Save as `~/Desktop/screenshot-1-digest.png`.
  
  **What it should show:** The daily reading list with post cards (title, summary, thumbnail, source label), a "Refresh" button in the header, and the tab bar at the bottom.

- [ ] **Step 3: Take screenshot 2 — Sources tab**

  1. Click the Sources tab (bottom nav).
  2. The list should show 2–3 subscribed sources with their titles.
  3. Capture at 1280×800.
  4. Save as `~/Desktop/screenshot-2-sources.png`.

  **What it should show:** The source list with the "Subscribe" button, schedule toggle, and at least one source card showing title and URL.

- [ ] **Step 4: Take screenshot 3 — Favorites tab**

  1. Go back to the Daily tab and click the bookmark/star icon on one or two posts to add favorites.
  2. Click the Favorites tab (bottom nav).
  3. Capture at 1280×800.
  4. Save as `~/Desktop/screenshot-3-favorites.png`.

  **What it should show:** At least one favorited post card in the Favorites tab.

---

### Task 4: Build and package the extension

**Files:**
- Produces: `extension-v0.1.0.zip` (saved to the project root; not committed)

**Interfaces:**
- Produces: the ZIP file uploaded in Task 6.

- [ ] **Step 1: Run the full quality gate**

  ```bash
  cd /Users/huyng/ws/dev-corner
  pnpm typecheck && pnpm test && pnpm build
  ```

  Expected output (all must pass):
  ```
  # typecheck: no errors
  # test: 128 passed (128)
  # build: ✓ built in Xs
  ```

  If any step fails, fix the issue before continuing.

- [ ] **Step 2: Verify the dist/ structure**

  ```bash
  ls dist/
  ```

  Expected: `manifest.json` is present at the root of `dist/` (not inside a subfolder). If `manifest.json` is missing from `dist/`, the crxjs build failed — re-run `pnpm build` and check for errors.

- [ ] **Step 3: Create the ZIP**

  ```bash
  cd dist && zip -r ../extension-v0.1.0.zip . && cd ..
  ```

  Then verify:
  ```bash
  unzip -l extension-v0.1.0.zip | head -20
  ```

  Expected: `manifest.json` appears at the root (path `manifest.json`, not `dist/manifest.json`).

- [ ] **Step 4: Check ZIP size**

  ```bash
  du -sh extension-v0.1.0.zip
  ```

  Expected: well under 10 MB (the limit is 500 MB, but reviewers prefer small packages). If the ZIP is unexpectedly large, check for accidentally bundled `node_modules` or large fixtures.

---

### Task 5: Register the Chrome Web Store developer account

> **Note:** This is a one-time $5 USD registration per Google account. If you already have a registered developer account, skip this task.

**Interfaces:**
- Produces: an active developer account needed for Task 6.

- [ ] **Step 1: Open the Chrome Web Store Developer Dashboard**

  In your browser: `https://chrome.google.com/webstore/devconsole`

  Sign in with the Google account you want to publish under (the account does not need to match your extension's email).

- [ ] **Step 2: Pay the one-time registration fee**

  Follow the on-screen prompts:
  1. Accept the Chrome Web Store Developer Agreement.
  2. Pay the one-time $5 USD registration fee (via Google Pay or credit card).
  3. Verify your developer email when prompted.

  The dashboard becomes usable immediately after payment.

---

### Task 6: Create the store listing and upload the extension

**Interfaces:**
- Consumes: `extension-v0.1.0.zip` (Task 4), screenshots (Task 3), privacy policy URL (Task 1), store copy (Task 2).
- Produces: a draft listing ready to submit.

- [ ] **Step 1: Create a new item**

  In the Developer Dashboard (`https://chrome.google.com/webstore/devconsole`):
  1. Click **New item**.
  2. Upload `extension-v0.1.0.zip`.
  3. The dashboard will auto-fill the name (`dev-corner`) and version (`0.1.0`) from `manifest.json`.

- [ ] **Step 2: Fill in the Store listing tab**

  Use the copy from `docs/store-listing.md`:

  | Field | Value |
  |---|---|
  | Name | `Dev Corner` |
  | Short description | *(copy from store-listing.md, max 132 chars)* |
  | Detailed description | *(copy the full description block from store-listing.md)* |
  | Category | Productivity |
  | Language | English (United States) |
  | Store icon | Upload `public/icons/icon-128.png` |
  | Screenshots | Upload the 3 PNG files from Task 3 |
  | Privacy policy URL | `https://huyng260398.github.io/dev-corner/privacy-policy.html` |

  > Check the actual GitHub Pages URL matches before pasting. Open it in a browser first.

- [ ] **Step 3: Fill in the Privacy practices tab**

  The dashboard will ask about each data type. For dev-corner, all answers are **No** / **Not collected**:

  | Question | Answer |
  |---|---|
  | Does the extension collect or use personal data? | No |
  | Is user data sold to third parties? | No |
  | Is user data used or transferred for purposes unrelated to the item's core functionality? | No |
  | Is user data used or transferred to determine creditworthiness or for lending purposes? | No |

  Under the **Certifications** section, check "I certify that the following permissions are required for my extension's core functionality":
  - Check all four permissions (`storage`, `alarms`, `contextMenus`, `notifications`)

- [ ] **Step 4: Fill in permission justifications**

  For each permission the dashboard asks about, paste from `docs/store-listing.md` (the "Permission justifications" section):

  - **storage**: *Stores your settings (daily crawl on/off, notifications on/off) so they persist across browser sessions. No personal data is stored.*
  - **alarms**: *Schedules the optional daily crawl at 07:00 AM in your local time zone using chrome.alarms (MV3 service workers cannot use setInterval).*
  - **contextMenus**: *Adds a "Save to Dev Corner" item to the right-click context menu so you can subscribe to the current page or a right-clicked link without opening the popup.*
  - **notifications**: *Sends a desktop notification after the morning crawl when new posts are found. Off by default; the user opts in from the Sources tab.*
  - **optional host permissions**: *The extension needs to fetch the RSS/Atom feed and page content from each blog the user subscribes to. Permissions are requested per-origin at subscribe time so Chrome only grants access to the specific sites the user has chosen — no other sites are ever accessed.*

- [ ] **Step 5: Set distribution**

  - **Visibility**: Public
  - **Regions**: All regions (or restrict if desired)
  - **Distribution**: Public (not unlisted)

- [ ] **Step 6: Save the draft**

  Click **Save draft**. Review the listing preview — check that name, description, icon, and screenshots all look correct.

---

### Task 7: Submit for review

**Interfaces:**
- Consumes: completed draft from Task 6.
- Produces: a submitted listing under review.

- [ ] **Step 1: Final pre-submission check**

  Before hitting Submit, verify:
  - [ ] Privacy policy URL opens correctly in a private browsing window.
  - [ ] All 3 screenshots display at the correct resolution (1280×800).
  - [ ] The store icon (128×128) is visible in the listing preview.
  - [ ] The short description is ≤ 132 characters (count it).
  - [ ] No broken links in the full description.

- [ ] **Step 2: Submit**

  Click **Submit for review** in the Developer Dashboard.

  Expected: status changes to **"Pending review"**. You will receive an email at `huynguyen260398@gmail.com` when the review is complete.

- [ ] **Step 3: Record submission**

  Note the submission date and expected review window:

  ```
  Submitted: 2026-06-27
  Expected review: 1–3 business days (90% of extensions reviewed within 3 days)
  Extensions with optional_host_permissions covering all URLs may take slightly longer.
  ```

  If the review is rejected, the dashboard will show specific policy violations to address. Common rejections:
  - Privacy policy URL not live → re-check GitHub Pages is deployed.
  - Permission justification too vague → be more specific about user benefit.
  - Screenshot quality too low → retake at exactly 1280×800.

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Developer account registration | Task 5 |
| Privacy policy hosted publicly | Task 1 |
| Store name, short/full description | Task 2, Task 6 |
| Permission justifications | Task 2, Task 6 |
| Privacy practices disclosure | Task 6 Step 3 |
| 128×128 icon upload | Task 6 Step 2 (already exists) |
| Screenshots (≥1 at 1280×800) | Task 3, Task 6 |
| Production ZIP with manifest.json at root | Task 4 |
| Submission | Task 7 |

**No gaps found.** Phase 8 (per-origin permissions) is already fully implemented in the codebase — no code changes are needed before submission.
