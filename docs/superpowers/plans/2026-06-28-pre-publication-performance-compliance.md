# Pre-Publication Performance and Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dev-corner v0.1.0 measurably performant, resilient under Manifest V3 service-worker limits, and internally consistent with Chrome Web Store policy before executing the publication plan.

**Architecture:** Preserve the existing popup/service-worker/IndexedDB boundaries. Add bounded network and crawl orchestration primitives in `src/background/`, keep reusable policies pure in `src/lib/`, enforce a saved-origin thumbnail boundary in both ingestion and rendering, and make a checked package/compliance report the prerequisite for publication.

**Tech Stack:** Chrome Manifest V3, TypeScript 6 strict mode, React 19, Dexie 4, Vite 8, Vitest 4, Node.js 24, pnpm 11.

---

## Approved Design and Execution Order

- Design specification: `docs/superpowers/specs/2026-06-28-pre-publication-performance-compliance-design.md`
- This plan must finish before `docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md` starts.
- Execute tasks in numeric order. A task may not be marked complete until its listed verification commands pass.
- Use test-driven development for every behavior change: add the focused failing test, observe the expected failure, implement the smallest complete change, then run focused and full regression checks.

## Global Constraints

- Do not change the digest-selection algorithm, including the existing Q1 behavior.
- Keep seven retained crawl days.
- Do not add a backend, telemetry, analytics, accounts, sync, content scripts, or remote code.
- The service worker remains the only context allowed to crawl or fetch markup.
- Do not use `setTimeout` or `setInterval` in the service worker. Use `AbortSignal.timeout()` for request/source deadlines and `chrome.alarms` for continuation scheduling.
- Keep sources sequential. Only per-source post enrichment may run concurrently, with a hard limit of three.
- Preserve typed cross-context messages and exhaustive request switching.
- Keep `http://*/*` and `https://*/*` optional, per-origin grants; do not add required host permissions.
- Any new pure logic under `src/lib/` requires unit tests.
- Automated tests must use fixtures and mocked `fetch`; never use live network.
- Commit only files named by the active task. The existing untracked `.pnpm-store/` directory is build-tool state and must never be committed.

## Verified Starting Baseline

Measured on 2026-06-28 in `/Users/huyng/ws/dev-corner`:

| Check | Result |
|---|---|
| `pnpm lint` | Pass |
| `pnpm test` | 15 files, 128 tests passed in 1.67 seconds |
| `pnpm build` | Pass in 241 milliseconds |
| Direct TypeScript CLI | Pass in 0.71 seconds, 229,473 KiB memory |
| `pnpm typecheck` | Did not complete within 60 seconds during the initial audit |
| `dist/` | Approximately 540 KiB |
| Popup JavaScript | 206.54 kB raw / 64.49 kB gzip |
| Service-worker JavaScript | 189.17 kB raw / 65.48 kB gzip |
| Shared JavaScript | 99.06 kB raw / 32.82 kB gzip |
| Popup CSS | 9.20 kB raw / 2.64 kB gzip |

Hard release budgets are defined in the approved design. Do not weaken them while implementing this plan.

### Task 1: Add deterministic local and package release gates

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `scripts/verify-package.mjs`
- Create: `docs/PERFORMANCE.md`

**Interfaces:**
- `pnpm typecheck` bypasses the generated shell shim and invokes the checked-in TypeScript package with Node.
- `pnpm verify:package` checks the built package budgets and forbidden executable patterns.
- `pnpm verify:release` runs typecheck, lint, tests, build, and package verification in that order.

- [ ] **Step 1: Ignore repository-local pnpm state**

  Append this exact entry to `.gitignore`:

  ```gitignore
  # repository-local package-manager cache
  .pnpm-store/
  ```

- [ ] **Step 2: Add the package verifier**

  Create `scripts/verify-package.mjs`:

  ```js
  import { gzipSync } from 'node:zlib'
  import { readFileSync, readdirSync, statSync } from 'node:fs'
  import { extname, join, relative, resolve } from 'node:path'

  const DIST = resolve('dist')
  const MAX_DIST_BYTES = 750 * 1024
  const MAX_GZIP_JS_BYTES = 80 * 1024
  const EXECUTABLE_EXTENSIONS = new Set(['.html', '.js', '.json'])
  const FORBIDDEN = [
    { label: 'eval()', expression: /\beval\s*\(/ },
    { label: 'new Function()', expression: /\bnew\s+Function\s*\(/ },
    { label: 'remote script tag', expression: /<script[^>]+src=["']https?:/i },
    { label: 'remote source map', expression: /sourceMappingURL=https?:/i },
  ]

  function filesUnder(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? filesUnder(path) : [path]
    })
  }

  const files = filesUnder(DIST)
  const failures = []
  const totalBytes = files.reduce((total, file) => total + statSync(file).size, 0)

  if (totalBytes > MAX_DIST_BYTES) {
    failures.push(`dist size ${totalBytes} exceeds ${MAX_DIST_BYTES} bytes`)
  }

  const javascript = files.filter((file) => extname(file) === '.js')
  const chunks = javascript.map((file) => {
    const content = readFileSync(file)
    const gzipBytes = gzipSync(content).byteLength
    if (gzipBytes > MAX_GZIP_JS_BYTES) {
      failures.push(`${relative(DIST, file)} gzip size ${gzipBytes} exceeds ${MAX_GZIP_JS_BYTES}`)
    }
    return { file: relative(DIST, file), rawBytes: content.byteLength, gzipBytes }
  })

  for (const file of files.filter((candidate) => EXECUTABLE_EXTENSIONS.has(extname(candidate)))) {
    const content = readFileSync(file, 'utf8')
    for (const rule of FORBIDDEN) {
      if (rule.expression.test(content)) {
        failures.push(`${relative(DIST, file)} contains ${rule.label}`)
      }
    }
  }

  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
  if (manifest.manifest_version !== 3) failures.push('manifest_version must equal 3')
  if (manifest.host_permissions !== undefined) failures.push('required host_permissions are forbidden')

  console.log(JSON.stringify({ totalBytes, chunks }, null, 2))
  if (failures.length > 0) {
    throw new Error(`Package verification failed:\n${failures.join('\n')}`)
  }
  ```

- [ ] **Step 3: Wire exact release commands**

  Change the relevant `package.json` scripts to:

  ```json
  {
    "scripts": {
      "dev": "vite",
      "build": "vite build",
      "test": "vitest run --passWithNoTests",
      "test:watch": "vitest",
      "typecheck": "node ./node_modules/typescript/bin/tsc --noEmit",
      "lint": "eslint .",
      "verify:package": "node scripts/verify-package.mjs",
      "verify:release": "pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify:package"
    }
  }
  ```

  Preserve all existing package metadata and dependencies outside the `scripts` object.

- [ ] **Step 4: Document the measurement procedure**

  Create `docs/PERFORMANCE.md` with:

  ```markdown
  # Performance and release budgets

  Run `pnpm verify:release` from a clean process before packaging. The command enforces TypeScript, lint, test, build, total-package, per-JavaScript-chunk, Manifest V3, required-host-permission, and remote-executable-code gates.

  ## Popup measurements

  Use a production `dist/` build loaded unpacked in a dedicated Chrome profile. Measure 20 cold popup openings with DevTools Performance, first with zero sources and then with at least 20 fixture-backed sources. Record action invocation to rendered shell and action invocation to the deterministic daily state. Required budgets are median ≤300 ms and p95 ≤750 ms for the shell, and median ≤500 ms and p95 ≤1,000 ms for local data.

  ## Crawl measurements

  Automated tests enforce cached-feed request count, maximum enrichment concurrency, request/source deadlines, and single-flight behavior. Manual testing confirms the same behavior with RSS, Atom, HTML fallback, slow, malformed, and offline sources.

  ## Storage measurements

  Chrome DevTools Application > IndexedDB is inspected after seven fixture crawl days with 20 sources. Only seven crawl-day partitions remain, removed sources have no posts, and favorite snapshots remain until explicitly removed.
  ```

- [ ] **Step 5: Run the new gate**

  Run:

  ```bash
  pnpm verify:release
  ```

  Expected: typecheck, lint, 128 existing tests, build, and package verification pass; the verifier prints total bytes and each JavaScript chunk's raw/gzip sizes.

- [ ] **Step 6: Commit**

  ```bash
  git add .gitignore package.json scripts/verify-package.mjs docs/PERFORMANCE.md
  git commit -m "build: add pre-publication release gates"
  ```

### Task 2: Align default settings and deletion with disclosed behavior

**Files:**
- Modify: `src/background/settings.ts`
- Modify: `src/background/permissions.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/crawl.ts`
- Modify: `src/lib/sources.ts`
- Modify: `src/popup/App.tsx`
- Modify: `tests/lib/sources.test.ts`
- Modify: `tests/integration/crawl.test.ts`
- Modify: `tests/popup/App.test.tsx`

**Behavior:**
- Daily notifications are off until the user enables them.
- Unsubscribing removes the source and its non-favorite posts in one transaction.
- Favorite snapshots remain.
- The origin grant is removed only when no remaining source uses that origin.

- [ ] **Step 1: Write failing lifecycle tests**

  Add `await db.posts.clear()` to that test file's `beforeEach`. Extend `tests/lib/sources.test.ts` so the delete test seeds two posts and one favorite, then asserts:

  ```ts
  const deleted = await deleteSource(id)

  expect(deleted?.url).toBe('https://blog.test')
  await expect(db.sources.count()).resolves.toBe(0)
  await expect(db.posts.where('sourceId').equals(id).count()).resolves.toBe(0)
  await expect(db.favoritePosts.count()).resolves.toBe(1)
  ```

  Extend the worker integration tests with two sources on `https://blog.test`, delete the first, and assert `chrome.permissions.remove` is not called; delete the second and assert:

  ```ts
  expect(chrome.permissions.remove).toHaveBeenCalledWith(
    { origins: ['https://blog.test/*'] },
    expect.any(Function),
  )
  ```

  In the worker integration tests, send `GET_SETTINGS` with empty storage and assert `enableDailyNotifications` is false. In `tests/popup/App.test.tsx`, change the default settings fixture to notifications disabled and assert the checkbox is unchecked on first render.

  Change the existing missing-origin crawl assertion to expect:

  ```ts
  expect(result).toEqual({
    ok: false,
    sourceId: source.id,
    postsWritten: 0,
    newPostsWritten: 0,
    error: 'Permission required for https://blog.example.com/',
  })
  ```

- [ ] **Step 2: Run focused tests to verify failure**

  Run:

  ```bash
  pnpm test tests/lib/sources.test.ts tests/integration/crawl.test.ts tests/popup/App.test.tsx
  ```

  Expected: failures show posts remain after source deletion, `permissions.remove` is absent, and notifications default to enabled.

- [ ] **Step 3: Make deletion transactional**

  Replace `deleteSource` in `src/lib/sources.ts` with:

  ```ts
  export async function deleteSource(id: number): Promise<Source | undefined> {
    return db.transaction('rw', db.sources, db.posts, async () => {
      const source = await db.sources.get(id)
      if (source === undefined) return undefined

      await db.posts.where('sourceId').equals(id).delete()
      await db.sources.delete(id)
      return source
    })
  }
  ```

- [ ] **Step 4: Release unused optional origin grants**

  Add to `src/background/permissions.ts`:

  ```ts
  export async function removePermissionWhenOriginUnused(sourceUrl: string): Promise<boolean> {
    const origin = originPatternForUrl(sourceUrl)
    const sources = await db.sources.toArray()
    const stillUsed = sources.some((source) => originPatternForUrl(source.url) === origin)
    if (stillUsed) return false

    return new Promise((resolve) => {
      chrome.permissions.remove({ origins: [origin] }, resolve)
    })
  }
  ```

  Import it in `src/background/index.ts`. Replace the `DELETE_SOURCE` handler body with:

  ```ts
  deleteSource(message.sourceId)
    .then(async (deleted) => {
      if (deleted !== undefined) {
        await removePermissionWhenOriginUnused(deleted.url)
      }
      sendResponse({ ok: true })
    })
    .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
  return true
  ```

- [ ] **Step 5: Default notifications off**

  In `src/background/settings.ts`, set:

  ```ts
  const DEFAULT_SETTINGS: Settings = {
    enableDailyCron: true,
    enableDailyNotifications: false,
  }
  ```

  In the `setDailyCron()` optimistic fallback object in `src/popup/App.tsx`, use `enableDailyNotifications: false`. Keep `setDailyNotifications()` wired to its `enableDailyNotifications` parameter so the explicit user toggle is reflected immediately. Do not overwrite an existing stored setting during upgrade.

  In `crawlSource()`, return this terminal failure when `ensureSourcePermission()` returns false:

  ```ts
  return {
    ok: false,
    sourceId: persistedSource.id,
    postsWritten: 0,
    newPostsWritten: 0,
    error: `Permission required for ${persistedSource.url}`,
  }
  ```

  This preserves the source's `needsPermission` state and lets `crawlAll()` report the skipped source accurately.

- [ ] **Step 6: Run focused and full tests**

  Run:

  ```bash
  pnpm test tests/lib/sources.test.ts tests/integration/crawl.test.ts tests/popup/App.test.tsx
  pnpm test
  ```

  Expected: all lifecycle/default tests and the full suite pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/background/settings.ts src/background/permissions.ts src/background/index.ts src/background/crawl.ts src/lib/sources.ts src/popup/App.tsx tests/lib/sources.test.ts tests/integration/crawl.test.ts tests/popup/App.test.tsx
  git commit -m "fix: align local data lifecycle with disclosures"
  ```

### Task 3: Declare the minimum current-tab permission and explicit CSP

**Files:**
- Modify: `manifest.config.ts`
- Modify: `tests/manifest.test.ts`

- [ ] **Step 1: Write failing manifest assertions**

  Add this test to `tests/manifest.test.ts`:

  ```ts
  it('declares only exercised API permissions and an explicit MV3 CSP', async () => {
    const resolvedManifest = (await manifest) as {
      minimum_chrome_version?: string
      permissions?: string[]
      content_security_policy?: { extension_pages?: string }
    }

    expect(resolvedManifest.minimum_chrome_version).toBe('103')
    expect(resolvedManifest.permissions).toEqual([
      'activeTab',
      'storage',
      'alarms',
      'contextMenus',
      'notifications',
    ])
    expect(resolvedManifest.content_security_policy?.extension_pages).toBe(
      "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; connect-src https: http:; img-src 'self' data: https:",
    )
  })
  ```

- [ ] **Step 2: Run the manifest test to verify failure**

  Run:

  ```bash
  pnpm test tests/manifest.test.ts
  ```

  Expected: failure because `activeTab`, `minimum_chrome_version`, and explicit CSP are absent.

- [ ] **Step 3: Update the manifest**

  Add these exact values to `defineManifest()` in `manifest.config.ts`:

  ```ts
  minimum_chrome_version: '103',
  permissions: ['activeTab', 'storage', 'alarms', 'contextMenus', 'notifications'],
  content_security_policy: {
    extension_pages:
      "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; connect-src https: http:; img-src 'self' data: https:",
  },
  ```

  Keep `optional_host_permissions: ['http://*/*', 'https://*/*']` unchanged and do not add `tabs`.

- [ ] **Step 4: Verify manifest and production output**

  Run:

  ```bash
  pnpm test tests/manifest.test.ts
  pnpm build
  pnpm verify:package
  ```

  Expected: tests pass; `dist/manifest.json` contains `activeTab`, the optional patterns, minimum Chrome 103, and the explicit CSP, with no `host_permissions`.

- [ ] **Step 5: Commit**

  ```bash
  git add manifest.config.ts tests/manifest.test.ts
  git commit -m "fix: declare minimal current-tab access and CSP"
  ```

### Task 4: Enforce the saved-origin thumbnail boundary

**Files:**
- Modify: `src/lib/thumbnail.ts`
- Modify: `src/background/crawl.ts`
- Modify: `src/popup/PostCard.tsx`
- Modify: `src/popup/DailyPostsTab.tsx`
- Modify: `src/popup/FavoritePostsTab.tsx`
- Modify: `tests/lib/thumbnail.test.ts`
- Modify: `tests/popup/components.test.tsx`
- Modify: `tests/popup/App.test.tsx`
- Modify: `tests/integration/crawl.test.ts`

**Policy:** A post thumbnail is either `/placeholder.svg` or an HTTPS URL whose origin exactly equals the saved source origin. Existing off-origin values are rejected at render time, so no schema migration is needed.

- [ ] **Step 1: Write failing thumbnail-policy tests**

  Import `renderableThumbnail` in `tests/lib/thumbnail.test.ts` and add:

  ```ts
  describe('renderableThumbnail', () => {
    it('allows HTTPS images from the saved source origin', () => {
      expect(
        renderableThumbnail('https://blog.test/images/post.webp', 'https://blog.test/feed'),
      ).toBe('https://blog.test/images/post.webp')
    })

    it.each([
      'https://cdn.test/post.webp',
      'http://blog.test/post.webp',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
    ])('replaces disallowed thumbnail %s', (thumbnail) => {
      expect(renderableThumbnail(thumbnail, 'https://blog.test')).toBe(PLACEHOLDER_THUMBNAIL)
    })

    it('keeps the packaged placeholder', () => {
      expect(renderableThumbnail(PLACEHOLDER_THUMBNAIL, 'https://blog.test')).toBe(
        PLACEHOLDER_THUMBNAIL,
      )
    })
  })
  ```

  Add component tests asserting same-origin images have `loading="lazy"` and `decoding="async"`, while an off-origin thumbnail renders `/placeholder.svg` and never renders the remote URL.

- [ ] **Step 2: Run focused tests to verify failure**

  Run:

  ```bash
  pnpm test tests/lib/thumbnail.test.ts tests/popup/components.test.tsx
  ```

  Expected: `renderableThumbnail` is missing and `PostCard` lacks source-origin enforcement and loading attributes.

- [ ] **Step 3: Implement the pure thumbnail policy**

  Add to `src/lib/thumbnail.ts`:

  ```ts
  export function renderableThumbnail(
    thumbnail: string | undefined,
    sourceUrl: string,
  ): string {
    if (thumbnail === undefined || thumbnail === PLACEHOLDER_THUMBNAIL) {
      return PLACEHOLDER_THUMBNAIL
    }

    try {
      const candidate = new URL(thumbnail)
      const source = new URL(sourceUrl)
      return candidate.protocol === 'https:' && candidate.origin === source.origin
        ? candidate.href
        : PLACEHOLDER_THUMBNAIL
    } catch {
      return PLACEHOLDER_THUMBNAIL
    }
  }
  ```

- [ ] **Step 4: Normalize thumbnails when posts are written**

  In `src/background/crawl.ts`:

  - Import `renderableThumbnail`.
  - Delete `AWS_BLOGS_DEFAULT_THUMBNAIL` and `sourceDefaultThumbnail()`.
  - In `toPost()`, set:

  ```ts
  thumbnail: renderableThumbnail(entry.thumbnail, source.url),
  ```

  Update the AWS integration test to expect `/placeholder.svg`. Add an integration case where feed media points at `https://cdn.test/image.jpg` and assert the stored thumbnail is `/placeholder.svg`.

- [ ] **Step 5: Guard rendering of legacy rows**

  Add `sourceUrl: string` to `PostCardData`. In `DailyPostsTab.tsx` and `FavoritePostsTab.tsx`, pass each post's `sourceUrl` into `PostCard`.

  In `PostCard.tsx`, import `useState`, `PLACEHOLDER_THUMBNAIL`, and `renderableThumbnail`; compute the safe URL and render:

  ```tsx
  const [imageFailed, setImageFailed] = useState(false)
  const thumbnail = renderableThumbnail(post.thumbnail, post.sourceUrl)
  const showImage = !imageFailed

  {showImage ? (
    <img
      src={thumbnail}
      alt={thumbnail === PLACEHOLDER_THUMBNAIL ? '' : `${post.title} thumbnail`}
      width="72"
      height="72"
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div className="thumbnail-fallback" aria-hidden="true">
      {sourceInitial(post.sourceTitle)}
    </div>
  )}
  ```

  Update every `PostCardData` fixture to include the matching `sourceUrl`. Change popup digest fixtures so same-origin thumbnail URLs use `https://source-${id}.test/thumb.jpg`.

- [ ] **Step 6: Verify thumbnail behavior and regressions**

  Run:

  ```bash
  pnpm test tests/lib/thumbnail.test.ts tests/popup/components.test.tsx tests/popup/App.test.tsx tests/integration/crawl.test.ts
  pnpm test
  ```

  Expected: focused and full suites pass; no assertion expects an off-origin remote image.

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/thumbnail.ts src/background/crawl.ts src/popup/PostCard.tsx src/popup/DailyPostsTab.tsx src/popup/FavoritePostsTab.tsx tests/lib/thumbnail.test.ts tests/popup/components.test.tsx tests/popup/App.test.tsx tests/integration/crawl.test.ts
  git commit -m "fix: restrict thumbnails to saved source origins"
  ```

### Task 5: Bound network bodies, redirects, requests, and source duration

**Files:**
- Create: `src/background/fetch.ts`
- Create: `tests/background/fetch.test.ts`
- Modify: `src/background/crawl.ts`
- Modify: `tests/integration/crawl.test.ts`

**Constants:**
- `MAX_MARKUP_BYTES = 2 * 1024 * 1024`
- `REQUEST_TIMEOUT_MS = 10_000`
- `SOURCE_TIMEOUT_MS = 30_000`

- [ ] **Step 1: Write failing fetch-boundary tests**

  Create `tests/background/fetch.test.ts` with mocked `fetch`, mocked `chrome.permissions.contains`, and cases that assert:

  ```ts
  await expect(fetchText('https://source.test/feed')).rejects.toThrow(
    'Response exceeded 2097152 bytes for https://source.test/feed',
  )
  ```

  ```ts
  await expect(fetchText('https://source.test/feed')).rejects.toThrow(
    'Redirected to an origin without permission: https://other.test/feed',
  )
  ```

  ```ts
  expect(fetch).toHaveBeenCalledWith(
    'https://source.test/feed',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  ```

  Cover `Content-Length` rejection, streamed-body rejection, permitted final URL, HTTP error, and request abort. Build streamed responses with `ReadableStream<Uint8Array>`; do not allocate a live 2 MiB fixture file.

  Add a case where both origins are granted but `https://source.test/feed` resolves to `http://source.test/feed`; expect `Refused HTTPS downgrade: http://source.test/feed`.

- [ ] **Step 2: Run the new test to verify failure**

  Run:

  ```bash
  pnpm test tests/background/fetch.test.ts
  ```

  Expected: failure because `src/background/fetch.ts` does not exist.

- [ ] **Step 3: Implement the bounded fetch module**

  Create `src/background/fetch.ts` with these exports:

  ```ts
  import { hasSourcePermission } from './permissions'

  export const MAX_MARKUP_BYTES = 2 * 1024 * 1024
  export const REQUEST_TIMEOUT_MS = 10_000
  export const SOURCE_TIMEOUT_MS = 30_000

  export interface FetchTextResult {
    url: string
    text: string
  }

  export async function fetchText(
    url: string,
    sourceSignal?: AbortSignal,
  ): Promise<FetchTextResult> {
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const signal = combineSignals(timeoutSignal, sourceSignal)

    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`)

      const finalUrl = response.url || url
      if (new URL(url).protocol === 'https:' && new URL(finalUrl).protocol !== 'https:') {
        throw new Error(`Refused HTTPS downgrade: ${finalUrl}`)
      }
      if (!(await hasSourcePermission(finalUrl))) {
        throw new Error(`Redirected to an origin without permission: ${finalUrl}`)
      }

      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > MAX_MARKUP_BYTES) {
        throw new Error(`Response exceeded ${MAX_MARKUP_BYTES} bytes for ${url}`)
      }

      return { url: finalUrl, text: await readText(response, url) }
    } catch (error) {
      if (sourceSignal?.aborted === true) {
        throw new Error(`Source crawl timed out after ${SOURCE_TIMEOUT_MS / 1000} seconds for ${url}`, {
          cause: error,
        })
      }
      if (timeoutSignal.aborted) {
        throw new Error(`Fetch timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds for ${url}`, {
          cause: error,
        })
      }
      throw error
    }
  }

  function combineSignals(first: AbortSignal, second: AbortSignal | undefined): AbortSignal {
    if (second === undefined) return first
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (first.aborted || second.aborted) abort()
    first.addEventListener('abort', abort, { once: true })
    second.addEventListener('abort', abort, { once: true })
    return controller.signal
  }

  async function readText(response: Response, url: string): Promise<string> {
    const reader = response.body?.getReader()
    if (reader === undefined) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      assertWithinLimit(bytes.byteLength, url)
      return new TextDecoder().decode(bytes)
    }

    const decoder = new TextDecoder()
    const chunks: string[] = []
    let total = 0
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      assertWithinLimit(total, url)
      chunks.push(decoder.decode(result.value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  }

  function assertWithinLimit(bytes: number, url: string): void {
    if (bytes > MAX_MARKUP_BYTES) {
      throw new Error(`Response exceeded ${MAX_MARKUP_BYTES} bytes for ${url}`)
    }
  }
  ```

- [ ] **Step 4: Route all crawler markup through the module**

  In `src/background/crawl.ts`:

  - Delete the local `FetchTextResult`, `FETCH_TIMEOUT_MS`, and `fetchText()` implementation.
  - Import `fetchText` and `FetchTextResult` from `./fetch`.
  - Create `const sourceSignal = AbortSignal.timeout(SOURCE_TIMEOUT_MS)` at the start of the `try` block in `crawlSource()`.
  - Pass `sourceSignal` through `resolveFeed`, `extractHtmlEntries`, `enrichFeedEntries`, `enrichFeedEntry`, `enrichHtmlEntry`, and `fetchMaybe`.
  - Import `SOURCE_TIMEOUT_MS` from `./fetch`.
  - Keep every request inside the same source deadline.

- [ ] **Step 5: Replace timeout and redirect integration tests**

  Replace the old `setTimeout` spy test with `AbortSignal.timeout` behavior using fake signals. Add a response whose `url` is `https://redirected.test/feed` while permission is denied and assert source failure records the redirect error. Add a streamed oversized body and assert source failure records the size error.

- [ ] **Step 6: Run focused and full verification**

  Run:

  ```bash
  pnpm test tests/background/fetch.test.ts tests/integration/crawl.test.ts
  pnpm typecheck
  pnpm test
  ```

  Expected: network-boundary tests, integration tests, typecheck, and full suite pass; `rg -n "setTimeout|setInterval" src/background` returns no matches.

- [ ] **Step 7: Commit**

  ```bash
  git add src/background/fetch.ts src/background/crawl.ts tests/background/fetch.test.ts tests/integration/crawl.test.ts
  git commit -m "perf: bound crawler network work"
  ```

### Task 6: Reuse cached metadata and batch IndexedDB writes

**Files:**
- Create: `src/lib/concurrency.ts`
- Create: `tests/lib/concurrency.test.ts`
- Modify: `src/background/crawl.ts`
- Modify: `tests/integration/crawl.test.ts`

- [ ] **Step 1: Write the concurrency contract test**

  Create `tests/lib/concurrency.test.ts` and assert `mapWithConcurrency([1,2,3,4,5], 3, worker)` preserves result order and never observes more than three active workers. Also assert limits below one throw `Concurrency limit must be at least 1`.

- [ ] **Step 2: Write failing crawl-efficiency tests**

  Add integration tests that:

  1. Crawl a five-entry no-media feed twice and assert the second crawl performs one feed request and zero post-page requests when stored metadata is complete.
  2. Delay five post-page fetches, record active requests, and assert the maximum is three.
  3. Spy on `db.posts.bulkPut` and assert one bulk write per source rather than five `put` calls.
  4. Re-crawl identical posts and assert `newPostsWritten` remains zero and IDs remain unchanged.

- [ ] **Step 3: Run focused tests to verify failure**

  Run:

  ```bash
  pnpm test tests/lib/concurrency.test.ts tests/integration/crawl.test.ts
  ```

  Expected: missing concurrency helper, sequential enrichment, repeated second-crawl page requests, and serial writes fail.

- [ ] **Step 4: Implement the pure concurrency helper**

  Create `src/lib/concurrency.ts`:

  ```ts
  export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Concurrency limit must be at least 1')
    }

    const results = new Array<R>(items.length)
    let nextIndex = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        const item = items[index]
        if (item !== undefined) results[index] = await worker(item, index)
      }
    })
    await Promise.all(runners)
    return results
  }
  ```

- [ ] **Step 5: Load candidate rows once and reuse complete metadata**

  Add these helpers to `src/background/crawl.ts`:

  ```ts
  const ENRICHMENT_CONCURRENCY = 3

  async function existingPostsByUrl(postUrls: readonly string[]): Promise<Map<string, Post>> {
    if (postUrls.length === 0) return new Map()
    const rows = await db.posts.where('postUrl').anyOf([...postUrls]).toArray()
    return new Map(rows.map((post) => [post.postUrl, post]))
  }

  function hasReusableMetadata(post: Post | undefined): post is Post {
    return (
      post !== undefined &&
      post.summary.trim().length > 0 &&
      post.thumbnail !== undefined &&
      post.thumbnail !== PLACEHOLDER_THUMBNAIL
    )
  }
  ```

  Parse and slice candidates before enrichment, load the map once, and call the helper separately in the feed and HTML paths:

  ```ts
  const enrichedFeed = await mapWithConcurrency(
    feedEntries,
    ENRICHMENT_CONCURRENCY,
    async (entry) => {
      const existing = existingByUrl.get(entry.postUrl)
      return hasReusableMetadata(existing)
        ? { ...entry, summary: existing.summary, thumbnail: existing.thumbnail }
        : enrichFeedEntry(entry, source.url, sourceSignal)
    },
  )

  const enrichedHtml = await mapWithConcurrency(
    htmlCandidates,
    ENRICHMENT_CONCURRENCY,
    async (candidate) => {
      const existing = existingByUrl.get(candidate.postUrl)
      return hasReusableMetadata(existing)
        ? {
            ...candidate,
            summary: existing.summary,
            thumbnail: existing.thumbnail,
          }
        : enrichHtmlEntry(candidate, sourceSignal)
    },
  )
  ```

  Change `enrichFeedEntry()` and `enrichHtmlEntry()` to accept the source signal introduced in Task 5. New or incomplete entries continue through the existing enrichment logic.

- [ ] **Step 6: Replace serial upserts with one transaction**

  Replace per-post `upsertPost()` calls with:

  ```ts
  async function upsertPosts(
    posts: readonly Post[],
    existingByUrl: ReadonlyMap<string, Post>,
  ): Promise<number> {
    const rows = posts.map((post) => {
      const existing = existingByUrl.get(post.postUrl)
      return existing?.id === undefined ? post : { ...post, id: existing.id }
    })

    await db.transaction('rw', db.posts, async () => {
      await db.posts.bulkPut(rows)
    })
    return posts.filter((post) => !existingByUrl.has(post.postUrl)).length
  }
  ```

  Calculate `newPostsWritten` from this return value. Remove `upsertPost()`.

- [ ] **Step 7: Verify efficiency and behavior**

  Run:

  ```bash
  pnpm test tests/lib/concurrency.test.ts tests/integration/crawl.test.ts
  pnpm typecheck
  pnpm test
  ```

  Expected: cached crawl, concurrency, bulk-write, idempotency, typecheck, and all regressions pass.

- [ ] **Step 8: Commit**

  ```bash
  git add src/lib/concurrency.ts tests/lib/concurrency.test.ts src/background/crawl.ts tests/integration/crawl.test.ts
  git commit -m "perf: reuse crawl metadata and batch writes"
  ```

### Task 7: Add single-flight crawling and alarm-backed continuation

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/background/crawl.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/scheduler.ts`
- Modify: `tests/integration/crawl.test.ts`
- Modify: `tests/lib/notifications.test.ts`
- Modify: `tests/popup/App.test.tsx`

**Persisted state:**

```ts
interface CrawlRunState {
  startedAt: number
  notificationRequested: boolean
  sourcesCrawled: number
  postsWritten: number
  newPostsWritten: number
  failures: Array<{ sourceId: number; error: string }>
}
```

**Constants:**
- `CRAWL_RUN_KEY = 'crawlRun'`
- `CRAWL_CONTINUATION_ALARM = 'crawl-continuation'`
- `MAX_CRAWL_INVOCATION_MS = 4 * 60_000`
- continuation delay: 60,000 milliseconds

- [ ] **Step 1: Write failing single-flight and continuation tests**

  Extend `tests/integration/crawl.test.ts` with cases that assert:

  - Two concurrent `crawlAll()` calls return the same promise result and invoke `crawlSource` work once per source.
  - When the invocation clock reaches four minutes with queue entries remaining, `chrome.alarms.create` receives:

    ```ts
    expect(chrome.alarms.create).toHaveBeenCalledWith(CRAWL_CONTINUATION_ALARM, {
      when: expect.any(Number),
    })
    ```

  - Partial results contain `completed: false`, leave the queue/run state persisted, and leave `crawlInProgress` true.
  - The continuation consumes the remaining queue, returns cumulative totals with `completed: true`, removes queue/run state, and sets `crawlInProgress` false.
  - A daily run split across batches creates exactly one notification after final completion.

- [ ] **Step 2: Run focused tests to verify failure**

  Run:

  ```bash
  pnpm test tests/integration/crawl.test.ts tests/lib/notifications.test.ts
  ```

  Expected: missing completion state, continuation alarm, cumulative state, and single-flight behavior.

- [ ] **Step 3: Extend result and response types**

  Add `completed: boolean` and `notificationRequested: boolean` to `CrawlAllResult`. Add optional `crawlCompleted?: boolean` to the successful `WorkerResponse` shape. Keep the `ok` discriminant and exhaustive switch unchanged.

- [ ] **Step 4: Wrap crawl execution in a single-flight entry point**

  In `src/background/crawl.ts`, rename the current implementation to `runCrawlAll()` and expose:

  ```ts
  export interface CrawlAllOptions {
    notificationRequested?: boolean
    now?: () => number
  }

  let activeCrawl: Promise<CrawlAllResult> | undefined
  let activeNotificationRequested = false

  export function crawlAll(options: CrawlAllOptions = {}): Promise<CrawlAllResult> {
    activeNotificationRequested ||= options.notificationRequested ?? false
    if (activeCrawl !== undefined) return activeCrawl

    const promise = runCrawlAll(options).finally(() => {
      activeCrawl = undefined
      activeNotificationRequested = false
    })
    activeCrawl = promise
    return promise
  }
  ```

  `runCrawlAll()` must persist `activeNotificationRequested` into `CrawlRunState` before advancing the first queue item and after each item, so a later daily caller joining a manual run is retained before a continuation.

- [ ] **Step 5: Persist cumulative run state and stop before the worker limit**

  At invocation start, load or initialize `CrawlRunState`. After each terminal source result, update and persist queue plus cumulative state. Before starting another source, compare `now() - invocationStartedAt` with `MAX_CRAWL_INVOCATION_MS`.

  If work remains:

  ```ts
  chrome.alarms.create(CRAWL_CONTINUATION_ALARM, { when: now() + 60_000 })
  return { ok: true, completed: false, ...runState }
  ```

  Do not prune or notify in a partial batch. On final completion, prune, remove `CRAWL_QUEUE_KEY` and `CRAWL_RUN_KEY`, set crawl progress false, and return cumulative totals with `completed: true`.

- [ ] **Step 6: Route both alarm names explicitly**

  Export `handleCrawlContinuationAlarm()` from `src/background/scheduler.ts`. It calls `crawlAll()`, and if the result completes a notification-requested run, it calls the existing notification helper once.

  Replace the alarm listener in `src/background/index.ts` with an exhaustive name branch:

  ```ts
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DAILY_CRAWL_ALARM) {
      void handleDailyAlarm(alarm).catch(() => undefined)
      return
    }
    if (alarm.name === CRAWL_CONTINUATION_ALARM) {
      void handleCrawlContinuationAlarm(alarm).catch(() => undefined)
    }
  })
  ```

  `handleDailyAlarm()` calls `crawlAll({ notificationRequested: true })` and notifies only when `completed` is true.

- [ ] **Step 7: Return partial status to the popup without claiming completion**

  In the `CRAWL_ALL` message handler, map the result without exposing internal notification state:

  ```ts
  sendResponse({
    ok: true,
    sourcesCrawled: result.sourcesCrawled,
    postsWritten: result.postsWritten,
    newPostsWritten: result.newPostsWritten,
    failures: result.failures,
    crawlCompleted: result.completed,
  })
  ```

  In `App.refreshNow()`, clear the button's local pending state when the worker responds. When `crawlCompleted === false`, leave the storage-backed crawl status active; the next popup open obtains it through `GET_CRAWL_STATUS`.

- [ ] **Step 8: Verify orchestration and regressions**

  Run:

  ```bash
  pnpm test tests/integration/crawl.test.ts tests/lib/notifications.test.ts tests/popup/App.test.tsx
  pnpm typecheck
  pnpm test
  ```

  Expected: single-flight, continuation, cumulative notification, popup status, and full suite pass.

- [ ] **Step 9: Commit**

  ```bash
  git add src/lib/types.ts src/background/crawl.ts src/background/index.ts src/background/scheduler.ts tests/integration/crawl.test.ts tests/lib/notifications.test.ts tests/popup/App.test.tsx
  git commit -m "perf: resume bounded crawls with alarms"
  ```

### Task 8: Create the compliance evidence and accurate publication artifacts

**Files:**
- Create: `docs/CHROME_WEB_STORE_COMPLIANCE.md`
- Create: `docs/privacy-policy.html`
- Create: `docs/store-listing.md`
- Create: `docs/chrome-web-store-reviewer-instructions.md`
- Modify: `docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md`

- [ ] **Step 1: Run the production dependency audit**

  Run:

  ```bash
  pnpm audit --prod --audit-level high
  pnpm build
  pnpm verify:package
  ```

  Expected: no unresolved high/critical production advisories; package verification confirms no remote/dynamically evaluated code. A high/critical result blocks this plan and publication. Record the advisory identifiers, update only the affected production dependency to the smallest compatible patched version, run `pnpm verify:release`, commit the lockfile/package change as `fix: remediate production dependency advisories`, then repeat this step until the audit passes.

- [ ] **Step 2: Write the compliance matrix**

  Create `docs/CHROME_WEB_STORE_COMPLIANCE.md` with these sections and conclusions:

  ```markdown
  # Chrome Web Store compliance matrix

  ## Single purpose

  Dev Corner builds a local daily reading digest from blog sources the user explicitly saves. Source management, crawling, digest selection, favorites, scheduling, and digest notifications all directly support that purpose.

  ## Permission inventory

  | Permission | Production use | User benefit | Narrower alternative |
  |---|---|---|---|
  | activeTab | Read URL/title after toolbar invocation | Subscribe to the current page | `tabs` is broader and rejected |
  | storage | Settings and resumable crawl state | Survives MV3 eviction/restart | In-memory state is not durable |
  | alarms | Daily crawl and one-shot continuation | Reliable MV3 scheduling | Worker timers are prohibited |
  | contextMenus | Save an explicitly selected page/link | Fast source subscription | No equivalent API |
  | notifications | Optional completed-digest alert | User-enabled morning alert | Feature is disabled by default |
  | optional host patterns | Fetch user-selected sources | RSS/Atom/HTML extraction | Grants are requested per origin |

  ## Data inventory

  | Data | Trigger | Local storage | Network recipient | Retention/deletion |
  |---|---|---|---|---|
  | Source URL/title | Explicit subscribe | IndexedDB sources | Selected source origin | Removed on unsubscribe |
  | Post metadata | Crawl selected source | IndexedDB posts | Selected source origin only | Seven crawl days or unsubscribe |
  | Favorite snapshot | Explicit favorite action | IndexedDB favoritePosts | None | Explicit unfavorite or uninstall |
  | Settings | Toggle action/defaults | chrome.storage.local | None | Setting update or uninstall |
  | Crawl state/errors | Crawl execution | chrome.storage.local/IndexedDB | None | Completion, retry, source removal, or uninstall |

  ## Dashboard declarations

  - Single purpose: use the statement above.
  - Remote code: No. Remote markup and images are data and are never executed.
  - Website content: disclose because titles, summaries, links, and permitted thumbnail URLs are extracted.
  - Web history: disclose conservatively because the extension stores URLs the user explicitly saves; it does not monitor general browsing history.
  - Personally identifiable, health, financial, authentication, personal communications, location, and general user-activity monitoring: not collected.
  - Data is not sold, used for ads, transferred to the developer, used for creditworthiness, or read by humans.
  - Certify Limited Use.

  ## Package evidence

  `pnpm verify:release` checks Manifest V3, no required host permissions, package/chunk budgets, and absence of eval, new Function, remote script tags, and remote source maps. The submission report records the final ZIP checksum.
  ```

- [ ] **Step 3: Write the privacy policy**

  Create `docs/privacy-policy.html` with:

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Dev Corner — Privacy Policy</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #172033; }
        h1 { font-size: 1.6rem; }
        h2 { margin-top: 2rem; font-size: 1.15rem; }
        code { overflow-wrap: anywhere; }
      </style>
    </head>
    <body>
      <h1>Dev Corner — Privacy Policy</h1>
      <p><strong>Effective date:</strong> 2026-06-28</p>

      <h2>Summary</h2>
      <p>Dev Corner builds a reading digest from blog sources you explicitly save. Your subscriptions, extracted post metadata, favorites, settings, and crawl state are stored locally in your browser. Dev Corner has no account, backend, analytics, advertising, or telemetry, and the developer does not receive or read this data.</p>

      <h2>Data handled locally</h2>
      <ul>
        <li>Source URLs and titles you choose to subscribe to.</li>
        <li>Post URLs, titles, summaries, publication times, and permitted thumbnail URLs extracted from those sources.</li>
        <li>Favorite-post snapshots you explicitly create.</li>
        <li>Daily crawl and notification preferences.</li>
        <li>Crawl queue, timestamps, and source-specific error messages needed for reliable local operation.</li>
      </ul>
      <p>This information is stored in extension IndexedDB and <code>chrome.storage.local</code>. It is not transmitted to the developer or a developer-controlled service.</p>

      <h2>Network requests</h2>
      <p>Dev Corner makes direct requests only to source origins you explicitly save and grant through Chrome's per-origin permission prompt. These requests discover and read RSS, Atom, or HTML content and may load an HTTPS thumbnail from the same saved origin. Thumbnail URLs on unrelated origins are not requested by the extension.</p>
      <p>The selected source operator receives ordinary network information, such as your IP address, user agent, requested URL, and request time. Dev Corner does not add an account identifier or tracking identifier.</p>
      <p>If you explicitly save and grant an HTTP-only source, that connection is not encrypted. Dev Corner never downgrades an HTTPS source to HTTP.</p>

      <h2>Permissions</h2>
      <ul>
        <li><strong>activeTab</strong> — temporarily reads the current page URL and title after you invoke Dev Corner, so you can subscribe to that page. It does not monitor general browsing.</li>
        <li><strong>storage</strong> — persists local settings and resumable crawl state.</li>
        <li><strong>alarms</strong> — schedules the optional daily crawl and resumes bounded crawl work without persistent timers.</li>
        <li><strong>contextMenus</strong> — adds “Save to Dev Corner” for a page or link you explicitly select.</li>
        <li><strong>notifications</strong> — sends an optional completed-digest alert. Notifications are off by default.</li>
        <li><strong>optional host permissions</strong> — grants access only to source origins you explicitly subscribe to and approve.</li>
      </ul>

      <h2>Retention and deletion</h2>
      <p>Normal post metadata is retained for the latest seven crawl days. Unsubscribing from a source removes that source, its normal posts, and its origin grant when no other source uses the origin. Favorite posts are independent snapshots and remain until you remove them. Uninstalling Dev Corner removes its local extension storage.</p>

      <h2>Sharing and prohibited uses</h2>
      <p>Dev Corner does not sell, share, or transfer locally stored data to advertisers, data brokers, or other third parties. It does not use data for personalized advertising, lending, creditworthiness, or unrelated purposes, and no human is allowed to read it.</p>
      <p>Dev Corner's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.</p>

      <h2>Contact</h2>
      <p>Questions may be sent to <a href="mailto:huynguyen260398@gmail.com">huynguyen260398@gmail.com</a>.</p>
    </body>
  </html>
  ```

- [ ] **Step 4: Write accurate store copy**

  Create `docs/store-listing.md` with:

  ```markdown
  # Dev Corner — Chrome Web Store listing

  ## Name
  Dev Corner

  ## Short description
  Build a private daily reading digest from developer blogs you choose. Local storage, per-site permissions, no account or backend.

  ## Single purpose
  Dev Corner builds a local daily reading digest from blog sources the user explicitly saves.

  ## Detailed description
  Dev Corner turns developer blogs you explicitly subscribe to into a local reading digest in the Chrome toolbar.

  Subscribe from the popup or context menu. Dev Corner requests access only to that site's origin, discovers RSS or Atom when available, falls back to best-effort HTML extraction, and stores recent post metadata in your browser. The Daily Posts view selects up to five available posts according to the extension's source-diversity rule. Favorites remain until you remove them.

  An optional 07:00 local crawl keeps the digest current. Daily desktop notifications are off by default and can be enabled from Sources.

  Dev Corner has no account, backend, analytics, advertising, or telemetry. Direct network requests go only to source origins you save and grant.

  ## Permission justifications

  - activeTab: Temporarily reads the URL and title of the active page after the user clicks Dev Corner, so the user can subscribe to that page. It does not monitor browsing.
  - storage: Persists local settings and resumable crawl state across browser restarts and MV3 service-worker eviction.
  - alarms: Schedules the optional daily crawl and resumes a bounded crawl queue without persistent worker timers.
  - contextMenus: Adds “Save to Dev Corner” for an explicitly selected page or link.
  - notifications: Sends an optional completed-digest alert. Notifications are off by default.
  - optional host permissions: Fetches RSS, Atom, HTML, and permitted same-origin thumbnails only from origins the user explicitly subscribes to and grants.

  ## Dashboard data disclosure

  Disclose Website content and, conservatively, Web history for explicitly saved URLs. Certify that data remains local, is used only for the stated single purpose, is not sold or transferred, is not used for advertising or creditworthiness, and is not read by humans.

  ## Remote code
  No. All executable logic is packaged in the extension. Remote markup and images are treated only as data.
  ```

- [ ] **Step 5: Write reviewer instructions**

  Create `docs/chrome-web-store-reviewer-instructions.md` with:

  ```markdown
  # Chrome Web Store reviewer instructions

  No credentials or test account are required. Dev Corner is fully client-side.

  1. Install the extension and open its toolbar popup. Confirm Daily Posts, Favorite Posts, and Sources render.
  2. Open an HTTPS developer blog in the active tab.
  3. Open Dev Corner, choose Sources, and click Subscribe.
  4. Grant Chrome's permission prompt for that blog origin.
  5. Click Refresh digest. The extension shows locally stored posts when extraction succeeds, or a source-specific error when the site has no usable feed/markup.
  6. Favorite one available post and confirm it appears in Favorite Posts.
  7. Return to Sources and unsubscribe. Normal posts for that source disappear; the independent favorite remains.
  8. Confirm Daily notifications is disabled on a fresh install and can be enabled explicitly in Sources.

  Network access is limited to origins explicitly saved and granted by the reviewer. No remote code, backend, analytics, or telemetry is used.
  ```

- [ ] **Step 6: Gate the existing publication plan**

  Modify `docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md`:

  - Replace its claim that the extension is already Web Store-ready with a dependency on this plan.
  - Insert `Task 0: Verify the pre-publication gate` before its current Task 1.
  - Task 0 runs `pnpm verify:release`, confirms the manual release report and ZIP checksum, and blocks every later publication task on failure.
  - Convert its privacy-policy and store-copy creation tasks into verification/deployment tasks that consume the files created here.
  - Add `activeTab` to permission justifications.
  - Replace blanket “all answers No / Not collected” instructions with the conservative Website content and Web history mapping from the compliance matrix.
  - Replace “exactly 5 posts” marketing claims with “up to five available posts.”
  - Replace “notifications off by default” as an assumption with a verification tied to Task 2's test.

  Insert this prerequisite text before the publication plan's current Task 1:

  ```markdown
  ### Task 0: Verify the pre-publication performance and compliance gate

  **Depends on:** `docs/superpowers/plans/2026-06-28-pre-publication-performance-compliance.md`

  - [ ] Run `pnpm verify:release`; stop if any command or budget fails.
  - [ ] Confirm `docs/PRE_PUBLICATION_RELEASE_REPORT.md` records Pass for every manual case against the current commit and extension version.
  - [ ] Recompute `shasum -a 256` for the submission ZIP and confirm it matches the report.
  - [ ] Confirm the privacy policy, store listing, dashboard disclosure mapping, reviewer instructions, manifest, and tested ZIP describe the same behavior.

  No later publication task is authorized until all four checks pass.
  ```

- [ ] **Step 7: Validate documentation consistency**

  Run:

  ```bash
  rg -n "exactly 5|all answers.*No|already Web Store-ready|No personal data is stored" docs
  rg -n "activeTab|Website content|Web history|Limited Use|off by default" docs
  git diff --check
  ```

  Expected: the first search returns no inaccurate publication language; the second finds the matching disclosures in compliance, privacy, listing, reviewer, and publication documents; diff check passes.

- [ ] **Step 8: Commit**

  ```bash
  git add docs/CHROME_WEB_STORE_COMPLIANCE.md docs/privacy-policy.html docs/store-listing.md docs/chrome-web-store-reviewer-instructions.md docs/superpowers/plans/2026-06-27-chrome-webstore-publication.md
  git commit -m "docs: add Chrome Web Store compliance evidence"
  ```

### Task 9: Execute and record the final pre-publication release gate

**Files:**
- Create: `docs/PRE_PUBLICATION_RELEASE_REPORT.md`
- No production code changes are permitted in this task. Any failure returns execution to the owning task.

- [ ] **Step 1: Run clean automated verification sequentially**

  Run:

  ```bash
  pnpm verify:release
  pnpm audit --prod --audit-level high
  ```

  Record command duration, test count, package bytes, and JavaScript raw/gzip sizes from actual output.

- [ ] **Step 2: Build and inspect the exact submission ZIP**

  Run:

  ```bash
  ZIP="extension-v0.1.0-$(git rev-parse --short HEAD).zip"
  test ! -e "$ZIP"
  (cd dist && zip -r "../$ZIP" .)
  unzip -l "$ZIP"
  shasum -a 256 "$ZIP"
  ```

  Expected: `manifest.json` is at the ZIP root; no tests, source maps, `.pnpm-store`, source TypeScript, or development-only files are present. Record the SHA-256 checksum.

- [ ] **Step 3: Run the unpacked-extension functional matrix**

  Load `dist/` in a dedicated Chrome profile and execute every manual case from the design specification:

  - Fresh install and current-schema upgrade.
  - Popup and context-menu subscription.
  - Permission grant, denial, retry, revoke, and unused-origin removal.
  - RSS, Atom, common-path feed, feed-less HTML, redirect, oversized response, slow source, malformed feed, HTTP source, HTTPS-to-HTTP rejection, and offline behavior.
  - Startup/manual and daily/manual overlapping triggers.
  - Continuation after simulated worker termination.
  - Notification disabled by default, explicit opt-in, and exactly one final-batch notification.
  - Source deletion removes normal posts and retains favorites.
  - No popup, service-worker, or extension-page console errors.

- [ ] **Step 4: Measure popup and storage budgets**

  Follow `docs/PERFORMANCE.md`. Record 20 cold runs for zero and at least 20 sources. Calculate median and p95 for shell and local-data readiness. Inspect IndexedDB after seven fixture days and confirm only seven crawl days remain and deleted-source posts are absent.

  Required results:

  - Shell median ≤300 ms and p95 ≤750 ms.
  - Local data median ≤500 ms and p95 ≤1,000 ms.
  - Refresh feedback ≤100 ms.
  - Total `dist/` ≤750 KiB.
  - Every gzip JavaScript chunk ≤80 KiB.

- [ ] **Step 5: Record immutable evidence**

  Create `docs/PRE_PUBLICATION_RELEASE_REPORT.md` containing:

  - Date, OS, Chrome version, Node version, pnpm version, commit SHA, extension version.
  - Automated command results and durations.
  - Test file/test counts.
  - Raw/gzip package measurements.
  - Dependency-audit result.
  - Popup median/p95 measurements for both datasets.
  - Storage/retention observations.
  - Every manual matrix case with Pass status and concise evidence.
  - Manifest permission/CSP snapshot.
  - Final ZIP filename, byte size, and SHA-256.
  - A final statement that all seven repository constraints were checked and preserved.

  Do not record a Pass for an unexecuted case. Do not weaken a budget to complete the report.

- [ ] **Step 6: Re-run after the report-only change**

  Run:

  ```bash
  pnpm verify:release
  git diff --check
  git status --short
  ```

  Expected: the gate passes and only the report is uncommitted.

- [ ] **Step 7: Commit the release report**

  ```bash
  git add docs/PRE_PUBLICATION_RELEASE_REPORT.md
  git commit -m "docs: record pre-publication release gate"
  ```

## Final Completion Criteria

The plan is complete only when all of the following are true:

- `pnpm verify:release` and production dependency audit pass.
- All performance budgets pass with recorded evidence.
- Crawls are single-flight, bounded, resumable, and batched.
- Cached complete posts are not repeatedly enriched.
- Removed sources leave no normal posts or unused origin grant; favorites remain.
- Notifications are off by default.
- Off-origin and insecure thumbnails cannot be requested by the popup.
- Manifest permissions and CSP match production behavior.
- No remote or dynamically evaluated code exists in the built ZIP.
- Privacy policy, compliance matrix, dashboard guidance, listing copy, reviewer instructions, and runtime behavior agree.
- The publication plan begins with a passing prerequisite for this plan.
- The final ZIP checksum is recorded against the tested commit and version.

## Self-Review

### Design coverage

| Design requirement | Implemented by |
|---|---|
| Reproducible release budgets | Tasks 1 and 9 |
| Popup/package performance evidence | Tasks 1 and 9 |
| Local data lifecycle and permission cleanup | Task 2 |
| Minimum permissions and CSP | Task 3 |
| Saved-origin thumbnail policy | Task 4 |
| Request/body/source bounds | Task 5 |
| Bounded enrichment and batched writes | Task 6 |
| Single-flight and continuation alarms | Task 7 |
| One notification after complete daily queue | Task 7 |
| Data inventory and disclosure consistency | Task 8 |
| Publication dependency and final evidence | Tasks 8 and 9 |

### Constraint review

- No task changes Q1 or retention.
- No task adds a backend, remote service, analytics, telemetry, or account.
- All crawl fetches stay in the worker.
- Worker deadlines use `AbortSignal.timeout`; scheduling uses `chrome.alarms`.
- New cross-context fields extend `WorkerResponse` in `src/lib/types.ts`.
- Post writes remain idempotent through the unique `postUrl` index and ID-preserving `bulkPut`.
- No task adds required host access.
- Every new pure helper has a focused unit test.
