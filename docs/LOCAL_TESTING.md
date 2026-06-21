# Local Testing Guide

How to run, load, and test the dev-corner extension on your own machine.

dev-corner is a Chrome MV3 extension built with CRXJS + Vite. It is **fully
local** — no backend, no remote DB. Everything below runs against an unpacked
extension loaded into a local Chrome profile.

## Prerequisites

- Node `>=24` (see `.nvmrc`)
- `pnpm` (`packageManager: pnpm@11.5.2`)
- A Chromium browser (Chrome, Edge, Brave, etc.)

```bash
nvm use            # picks up .nvmrc
pnpm install       # first time only
```

## Commands

| Command            | What it does                                              |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | Vite dev server + CRXJS. Writes a dev build to `dist/` and hot-reloads on change. Use while developing. |
| `pnpm build`       | Production build to `dist/`. The real artifact; use before opening a PR. |
| `pnpm test`        | Run unit tests once (`vitest run`).                       |
| `pnpm test:watch`  | Re-run unit tests on change. Fastest loop for `src/lib/` logic. |
| `pnpm typecheck`   | `tsc --noEmit`, strict mode, no `any`.                   |
| `pnpm lint`        | ESLint over the repo.                                     |

## Two ways to test

### A. Dev mode with hot reload (day-to-day)

```bash
pnpm dev
```

Load it into Chrome **once**:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the **`dist/`** folder
5. Pin "dev-corner" from the puzzle-icon menu for one-click popup access

While `pnpm dev` runs:

- Popup (React) changes **hot-reload** instantly.
- Service worker and **manifest** changes may need a click of the ↻ reload icon
  on the extension card.

### B. Production build (pre-PR check)

This mirrors the "Before opening a PR" checklist in `CLAUDE.md`.

```bash
pnpm build
```

Then **Load unpacked → `dist/`** the same way. No dev server, no HMR — this is
exactly what a user would install, so it's the honest verification.

## Where to inspect things

| Target | How to open | What you'll see |
| ------ | ----------- | --------------- |
| **Popup UI** | Click the toolbar icon, then right-click the popup → **Inspect** | React UI + its console |
| **Service worker** (the only crawling context) | `chrome://extensions` card → click the blue **"service worker"** link | `fetch` / feed-parse / IndexedDB logs |
| **IndexedDB** (Dexie data) | Any DevTools → **Application** tab → IndexedDB | Posts, sources |
| **`chrome.storage.local`** (queues/progress) | DevTools → **Application** → Storage → Extension storage | Crawl queue & progress state |

## Inspecting the local database (IndexedDB)

All persisted data lives in a Dexie/IndexedDB database named **`dev-corner`**
(schema in `src/lib/db.ts`), under the extension's own origin
(`chrome-extension://<id>`). The service worker writes it; the popup reads it
live. Both contexts share the one database.

### Browse it in DevTools (no code)

1. Open the popup, then **right-click inside it → Inspect** (DevTools for the
   popup's context, which shares the extension origin). The **service worker**
   DevTools works too — same origin, same data.
2. Go to the **Application** tab → **Storage → IndexedDB → dev-corner**.
3. Expand and click **`sources`** or **`posts`** to see each row (`id`, `url`,
   `title`, `addedAt`, …).
4. Click the **↻ refresh** icon in that panel after saving — IndexedDB views
   don't auto-update.

### Query it from the console

`db` is not exposed on `globalThis`, and the built module path is content-hashed,
so the most convenient route is to add a dev-only handle. In `src/lib/db.ts`:

```ts
// dev-only: lets you run `await db.sources.toArray()` in the console.
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).db = db
```

Then, in the popup or service-worker console (`pnpm dev` build):

```js
await db.sources.toArray()                 // all saved sources
await db.sources.get({ url: location.href })
await db.posts.where('crawlDay').equals('2026-06-20').toArray()
await db.sources.count()
```

The guard is stripped from `pnpm build` output, so it never ships to users.

## Useful service-worker console snippets

Open the **service worker** DevTools (see table above), then:

```js
// List scheduled alarms (don't wait on the real schedule)
chrome.alarms.getAll(console.log)

// Inspect persisted queue / progress
chrome.storage.local.get(null, console.log)

// Trigger a manual crawl of all saved sources.
chrome.runtime.sendMessage({ type: 'CRAWL_ALL' }, console.log)

// Expected response shape:
// { ok: true, sourcesCrawled: 1, postsWritten: 5, failures: [] }

// Crawl one known source by id.
chrome.runtime.sendMessage({ type: 'CRAWL_SOURCE', sourceId: 1 }, console.log)

// If a stale crawl queue is blocking manual testing, clear it and crawl again.
chrome.storage.local.remove('crawlQueue', () => {
  chrome.runtime.sendMessage({ type: 'CRAWL_ALL' }, console.log)
})
```

> Use the typed message shapes from `src/lib/types.ts` — don't invent ad-hoc
> message objects.

## MV3 gotchas (expected behavior, not bugs)

- **The service worker is ephemeral.** Chrome stops it after ~30s idle and
  respawns it on the next event (alarm, message, popup open). A "stopped" worker
  is normal. Never rely on in-memory state surviving between events.
- **Alarms are slow to test in real time.** Inspect with
  `chrome.alarms.getAll(...)` and invoke handlers manually instead of waiting.
- **`host_permissions: <all_urls>`** (per ADR-002, personal/unpacked) means
  cross-origin fetches to saved sources work without extra prompts.

## Recommended Phase 2 loop

`src/lib/` is side-effect-free and the most valuable thing to unit-test, so the
tightest feedback loop usually doesn't need a browser:

```bash
pnpm test:watch
```

Reserve the load-into-Chrome cycle (`pnpm dev` + the worker DevTools console)
for crawl / IndexedDB / popup integration behavior.

## Troubleshooting

- **Extension won't load / "Manifest is invalid"** — run `pnpm build` and
  re-load `dist/`; the dev manifest only exists while `pnpm dev` is running.
- **Changes not showing** — for worker/manifest edits, click ↻ on the extension
  card; for a stale build, stop `pnpm dev`, delete `dist/`, and restart.
- **Worker shows "Inactive"** — it's idle. Click the popup or trigger an alarm
  to wake it.
- **Don't test against live network in unit tests** — mock `fetch` with fixtures
  under `tests/fixtures/` (see `CLAUDE.md` testing rules).
