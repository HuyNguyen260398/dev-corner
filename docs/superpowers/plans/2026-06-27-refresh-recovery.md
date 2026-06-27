# Refresh Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a rejected worker message or stalled source request cannot leave the popup indefinitely showing "Refreshing latest posts...".

**Architecture:** Keep the popup responsible for its local pending state and the background worker responsible for network deadlines. The popup always clears manual-refresh state in `finally`; the crawler aborts each `fetch` after 15 seconds and routes the timeout through the existing source-failure and queue-finalization paths.

**Tech Stack:** TypeScript 6, React 19, Chrome Manifest V3, Vitest 4, Testing Library, fake-indexeddb

---

## File Structure

- `src/popup/App.tsx`: recover the manual-refresh UI when runtime messaging rejects.
- `tests/popup/App.test.tsx`: reproduce and lock the popup recovery behavior.
- `src/background/crawl.ts`: enforce the per-request network deadline.
- `tests/integration/crawl.test.ts`: reproduce a stalled fetch and verify timeout persistence behavior.

### Task 1: Recover the popup from rejected refresh messages

**Files:**
- Modify: `tests/popup/App.test.tsx`
- Modify: `src/popup/App.tsx:105-117`

- [ ] **Step 1: Write the failing popup regression test**

Add this test under `describe('App scheduling controls', ...)`:

```tsx
it('clears refresh progress and reports a rejected crawl message', async () => {
  let rejectCrawl!: (reason: unknown) => void
  const pendingCrawl = new Promise<WorkerResponse>((_resolve, reject) => {
    rejectCrawl = reject
  })
  const sendMessage = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>
  sendMessage.mockImplementation((request: WorkerRequest) =>
    request.type === 'CRAWL_ALL'
      ? pendingCrawl
      : Promise.resolve(
          responses[request.type] ?? { ok: false, error: `Unhandled ${request.type}` },
        ),
  )

  render(<App />)
  await waitFor(() => {
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_CRAWL_STATUS' })
  })

  fireEvent.click(screen.getByRole('button', { name: 'Refresh digest' }))
  expect(await screen.findByText('Refreshing latest posts...')).toBeTruthy()

  rejectCrawl(new Error('Service worker disconnected.'))

  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Service worker disconnected.',
  )
  await waitFor(() => {
    expect(screen.queryByText('Refreshing latest posts...')).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh digest' })).toHaveProperty(
      'disabled',
      false,
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/popup/App.test.tsx -t "clears refresh progress"
```

Expected: FAIL because the rejected `CRAWL_ALL` promise escapes `refreshNow`, leaving `crawlInProgress` true and producing no alert.

- [ ] **Step 3: Implement popup recovery**

Replace `refreshNow` with:

```tsx
async function refreshNow() {
  setError(null)
  setCrawlInProgress(true)
  try {
    const response = await send({ type: 'CRAWL_ALL' })
    if (!response.ok) setError(response.error)
  } catch (error) {
    setError(errorMessage(error))
  } finally {
    setCrawlInProgress(false)
  }
}
```

The follow-up `GET_CRAWL_STATUS` request is intentionally removed: `CRAWL_ALL` resolves only after `crawlAll` finishes its own `finally` block.

- [ ] **Step 4: Run popup tests and verify GREEN**

Run:

```bash
pnpm test -- tests/popup/App.test.tsx
```

Expected: all popup tests PASS with no unhandled rejection.

- [ ] **Step 5: Commit the popup recovery**

```bash
git add src/popup/App.tsx tests/popup/App.test.tsx
git commit -m "fix: recover rejected popup refreshes"
```

### Task 2: Abort stalled crawler fetches

**Files:**
- Modify: `tests/integration/crawl.test.ts`
- Modify: `src/background/crawl.ts:401-407`

- [ ] **Step 1: Write the failing crawler timeout test**

Add `vi.useRealTimers()` to `afterEach`, then add this test under `describe('crawlSource', ...)`:

```ts
it('aborts and records a source fetch that exceeds 15 seconds', async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn(
    (_input: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const source = await addSourceRow('https://slow.example.com/')

  const crawl = crawlSource(source)
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  await vi.advanceTimersByTimeAsync(15_000)

  await expect(crawl).resolves.toEqual({
    ok: false,
    sourceId: source.id,
    postsWritten: 0,
    newPostsWritten: 0,
    error: 'Fetch timed out after 15 seconds for https://slow.example.com/',
  })
  await expect(db.sources.get(source.id)).resolves.toMatchObject({
    lastError: 'Fetch timed out after 15 seconds for https://slow.example.com/',
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/integration/crawl.test.ts -t "exceeds 15 seconds"
```

Expected: FAIL because `fetchText` does not pass an abort signal or install a deadline, so the crawl promise remains pending.

- [ ] **Step 3: Implement the fetch deadline**

Add the constant near the existing crawler constants:

```ts
const FETCH_TIMEOUT_MS = 15_000
```

Replace `fetchText` with:

```ts
async function fetchText(url: string): Promise<FetchTextResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`)
    }
    return { url, text: await response.text() }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Fetch timed out after 15 seconds for ${url}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 4: Keep fetch URL assertions accurate**

Update the two exact argument assertions because production now passes `RequestInit`:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  'https://blog.example.com/post-with-og-image',
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
)
expect(fetchMock).not.toHaveBeenCalledWith(
  'https://feeds.example.net/rss.xml',
  expect.anything(),
)
```

Update `installFetchMock` to accept the optional request initializer while preserving its existing response behavior:

```ts
const fetchMock = vi.fn(async (input: URL | RequestInfo, _init?: RequestInit) => {
```

- [ ] **Step 5: Run crawler integration tests and verify GREEN**

Run:

```bash
pnpm test -- tests/integration/crawl.test.ts
```

Expected: all crawler integration tests PASS, including the 15-second timeout regression.

- [ ] **Step 6: Commit the crawler deadline**

```bash
git add src/background/crawl.ts tests/integration/crawl.test.ts
git commit -m "fix: time out stalled crawler fetches"
```

### Task 3: Validate the complete fix

**Files:**
- Verify only; no production files should change.

- [ ] **Step 1: Run the complete automated validation matrix**

Run each command and require exit code 0:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all tests pass, TypeScript reports no errors, ESLint reports no errors, and Vite creates `dist/` successfully.

- [ ] **Step 2: Check repository constraints and scope**

Run:

```bash
git diff main...HEAD -- manifest.config.ts src/lib/selection.ts
git status --short
```

Expected: no changes from this fix to permissions or digest selection; only `.pnpm-store/` and `.superpowers/` may remain as unrelated untracked tooling artifacts.

- [ ] **Step 3: Push the completed branch**

```bash
git push -u origin feature/favorites-tabbed-popup
```

Expected: the remote branch advances to include the design, popup recovery, and crawler timeout commits.
