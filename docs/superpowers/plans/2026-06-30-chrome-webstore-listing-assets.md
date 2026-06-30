# Chrome Web Store Listing Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and validate the three authentic Chrome Web Store screenshots and the approved 440×280 promotional tile for Dev Corner 0.1.0.

**Architecture:** Run the verified production extension in an isolated Chrome profile, populate it from three live public developer blogs, and capture literal 1280×800 browser-context screenshots. Generate the promotional tile separately from the approved product-preview design, then validate dimensions, file sizes, visual accuracy, and privacy before recording evidence in the publication readiness document.

**Tech Stack:** Chrome 149, Manifest V3 unpacked extension, macOS `screencapture`, `sips`, ImageGen, Node.js 24, pnpm 11.5.2.

---

## Global constraints

- Use the production `dist/` package that passed `pnpm verify:release`.
- Do not modify extension behavior, permissions, manifest data, or popup UI.
- Screenshots must use live public posts, not fixtures or fabricated article data.
- Use a dedicated unsigned Chrome profile with no personal account, bookmarks, extensions, or history.
- Do not expose local paths, private URLs, account information, unrelated tabs, debug UI, or permission prompts.
- Screenshots must be PNG, exactly 1280×800, and no more than 2 MB each.
- The promotional tile must be PNG, exactly 440×280, and no more than 2 MB.
- Keep every intermediate capture under `/tmp`; only final assets belong on `~/Desktop`.

### Task 1: Prepare the verified browser profile and live content

**Files:**
- Reuse: `dist/`
- Create locally: `/tmp/dev-corner-store-profile/`

- [ ] **Step 1: Re-run the exact package gate with pinned tools**

Run:

```bash
PATH=/tmp/dev-corner-corepack:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm verify:release
```

Expected: typecheck, lint, 17 test files with 163 tests, production build, and package verification all pass; total unpacked size is 512,071 bytes.

- [ ] **Step 2: Start a dedicated Chrome profile with only the production extension**

Close any previously launched store-capture Chrome instance. Run:

```bash
open -na "Google Chrome" --args \
  --user-data-dir=/tmp/dev-corner-store-profile \
  --load-extension=/Users/huyng/ws/dev-corner/dist \
  --disable-extensions-except=/Users/huyng/ws/dev-corner/dist \
  --no-first-run \
  --no-default-browser-check \
  --window-size=1280,800 \
  https://kubernetes.io/blog/
```

Expected: a new unsigned Chrome profile opens the public Kubernetes Blog with Dev Corner as its only unpacked extension.

- [ ] **Step 3: Normalize the browser window for capture**

Dismiss first-run notices without signing in. Pin Dev Corner through the Extensions menu. Hide the bookmarks bar and close every tab except the current public developer-blog tab. Run:

```bash
osascript -e 'tell application "Google Chrome" to set bounds of front window to {0, 25, 1280, 825}'
```

Expected: the front Chrome window occupies a consistent 1280×800 capture region beginning below the macOS menu bar.

- [ ] **Step 4: Subscribe to the approved live sources**

Use the popup's Sources tab to subscribe to these HTTPS pages, approving each per-origin Chrome prompt:

```text
https://dev.to/
https://kubernetes.io/blog/
https://devopscube.com/
```

Expected: all three sources appear in Sources without `Needs permission`.

- [ ] **Step 5: Crawl and inspect the live digest**

Click **Refresh digest** and wait for completion. Confirm:

```text
- Daily Posts contains live public posts.
- No source displays a crawl error.
- No card displays a broken image.
- Daily notifications remains disabled.
```

If one approved source cannot crawl, replace only that source with another public HTTPS developer blog, record the substitution in the readiness document, and repeat the permission and refresh steps.

### Task 2: Capture the three browser-context screenshots

**Files:**
- Create: `~/Desktop/screenshot-1-digest.png`
- Create: `~/Desktop/screenshot-2-sources.png`
- Create: `~/Desktop/screenshot-3-favorites.png`

- [ ] **Step 1: Capture Daily Posts**

Open Daily Posts and wait until the popup shows its stable populated state. Ensure the Kubernetes Blog remains the only background tab. Run while the popup is open:

```bash
screencapture -x -R0,25,1280,800 /tmp/screenshot-1-digest-raw.png
sips -z 800 1280 /tmp/screenshot-1-digest-raw.png --out ~/Desktop/screenshot-1-digest.png
```

Expected: the entire popup, browser toolbar, and public background page are visible; no permission prompt, loading state, error, or private data appears.

- [ ] **Step 2: Capture Sources**

Open the popup's Sources tab. Confirm the three public sources are visible and **Daily notifications** is off. Run while the popup is open:

```bash
screencapture -x -R0,25,1280,800 /tmp/screenshot-2-sources-raw.png
sips -z 800 1280 /tmp/screenshot-2-sources-raw.png --out ~/Desktop/screenshot-2-sources.png
```

Expected: saved sources, schedule controls, subscribe action, and bottom navigation are visible without errors or prompts.

- [ ] **Step 3: Create the favorite state**

Return to Daily Posts, favorite one post with a complete title and non-broken thumbnail, then open Favorite Posts.

Expected: the chosen live post appears as an independent favorite card.

- [ ] **Step 4: Capture Favorite Posts**

Run while Favorite Posts is open:

```bash
screencapture -x -R0,25,1280,800 /tmp/screenshot-3-favorites-raw.png
sips -z 800 1280 /tmp/screenshot-3-favorites-raw.png --out ~/Desktop/screenshot-3-favorites.png
```

Expected: the favorite card, header, and bottom navigation are visible without errors, prompts, or private data.

- [ ] **Step 5: Inspect all screenshots visually**

Open each final file and reject and recapture any image containing:

```text
- personal account or profile information
- unrelated tabs, bookmarks, downloads, or history
- chrome://, localhost, file://, or private URLs
- DevTools, debug overlays, permission prompts, or notification banners
- loading, crawl-in-progress, empty, or error states
- broken thumbnails or unreadable popup text
```

### Task 3: Generate the approved promotional tile

**Files:**
- Create: `~/Desktop/promo-small-440x280.png`
- Reference: `public/icons/icon-128.png`
- Reference: `docs/superpowers/specs/2026-06-30-chrome-webstore-listing-assets-design.md`

- [ ] **Step 1: Generate the product-preview artwork with ImageGen**

Use the `imagegen` skill and `image_gen` tool with the existing icon as a reference. Use this prompt:

```text
Create a polished 11:7 Chrome Web Store promotional tile for the Dev Corner browser extension. Use a full-bleed dark navy background matching #0b1120, layered surfaces #111827 and #172033, and restrained green accents matching #22c55e. On the left, include the supplied Dev Corner “dc” icon and exactly this headline: “A focused daily digest”. Below it include exactly: “Developer blogs you choose. Local by design.” On the right, show a simplified but accurate dark-mode preview of the Dev Corner Daily Posts popup: compact top bar, three clean article cards, subtle metadata lines, and bottom navigation. Keep the layout uncluttered, professional, high contrast, and readable when downscaled. Do not include Chrome logos, third-party trademarks, rankings, badges, security shields, analytics claims, extra text, or photographic content. The outer canvas must be completely filled with square edges and no transparent padding.
```

Expected: a single raster result that follows the approved product-preview direction and contains no unapproved copy.

- [ ] **Step 2: Inspect and correct the generated artwork**

Inspect the generated image at original resolution. If either approved text string is misspelled, extra text appears, the preview misrepresents the popup, or the composition is illegible, use ImageGen edit mode with the original result and this correction prompt:

```text
Preserve the current composition and colors. Remove every text element except these two exact strings: “A focused daily digest” and “Developer blogs you choose. Local by design.” Correct their spelling exactly. Keep the simplified Dev Corner popup preview on the right and the supplied “dc” brand mark on the left. Do not add any logos, badges, claims, or extra words.
```

Repeat visual inspection until the result satisfies the approved specification.

- [ ] **Step 3: Resize and save the final tile**

After ImageGen provides the final local output path, run:

```bash
sips -z 280 440 /path/to/final-imagegen-output.png --out ~/Desktop/promo-small-440x280.png
```

Expected: a 440×280 PNG exists on the Desktop with no added padding or crop damage.

- [ ] **Step 4: Validate half-size legibility**

Run:

```bash
sips -z 140 220 ~/Desktop/promo-small-440x280.png --out /tmp/promo-small-220x140.png
```

Inspect `/tmp/promo-small-220x140.png` and confirm the headline, brand mark, supporting line, and product-preview silhouette remain understandable.

### Task 4: Validate and record all listing assets

**Files:**
- Modify: `docs/CHROME_WEB_STORE_PUBLICATION_READINESS.md`
- Verify: `~/Desktop/screenshot-1-digest.png`
- Verify: `~/Desktop/screenshot-2-sources.png`
- Verify: `~/Desktop/screenshot-3-favorites.png`
- Verify: `~/Desktop/promo-small-440x280.png`

- [ ] **Step 1: Verify file types, dimensions, and sizes**

Run:

```bash
file ~/Desktop/screenshot-1-digest.png \
  ~/Desktop/screenshot-2-sources.png \
  ~/Desktop/screenshot-3-favorites.png \
  ~/Desktop/promo-small-440x280.png
sips -g pixelWidth -g pixelHeight \
  ~/Desktop/screenshot-1-digest.png \
  ~/Desktop/screenshot-2-sources.png \
  ~/Desktop/screenshot-3-favorites.png \
  ~/Desktop/promo-small-440x280.png
stat -f '%N %z bytes' \
  ~/Desktop/screenshot-1-digest.png \
  ~/Desktop/screenshot-2-sources.png \
  ~/Desktop/screenshot-3-favorites.png \
  ~/Desktop/promo-small-440x280.png
```

Expected:

```text
All four files are PNG images.
Screenshots are exactly 1280x800.
The promotional tile is exactly 440x280.
Every file is 2,097,152 bytes or smaller.
```

- [ ] **Step 2: Record the asset evidence**

In `docs/CHROME_WEB_STORE_PUBLICATION_READINESS.md`, change the Store screenshots and Small promotional image rows to `Resolved`. Add a `## Listing asset evidence` section with a table containing each filename, exact dimensions, byte size, content state, and `Pass` result. Record the actual source URLs used and state that notifications were visibly disabled in the Sources screenshot.

- [ ] **Step 3: Run document and repository checks**

Run:

```bash
git diff --check
git status --short --untracked-files=all
```

Expected: no whitespace errors; only intentional publication documents and local release artifacts are changed or untracked.

- [ ] **Step 4: Commit the documentation evidence**

Do not commit Desktop assets or the submission ZIP. Run:

```bash
git add docs/CHROME_WEB_STORE_PUBLICATION_READINESS.md \
  docs/PRE_PUBLICATION_RELEASE_REPORT.md \
  docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md
git commit -m "docs: resolve Chrome Web Store publication blockers"
```

Expected: the commit contains only publication evidence and plan corrections.

