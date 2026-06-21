// Daily digest and source management UI. The popup never crawls (GUD-002): it
// reads IndexedDB live and routes saves/deletes/refreshes through the worker via
// the typed message boundary (GUD-003).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { selectDigest } from '../lib/selection'
import { listSources } from '../lib/sources'
import type { Post, Settings, Source, WorkerRequest, WorkerResponse } from '../lib/types'

function send(request: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(request) as Promise<WorkerResponse>
}

export function App() {
  const today = localDateKey(new Date())
  const sources = useLiveQuery(() => listSources(), [])
  const todaysPosts = useLiveQuery(() => db.posts.where('crawlDay').equals(today).toArray(), [today])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [crawlInProgress, setCrawlInProgress] = useState(false)

  useEffect(() => {
    void loadSchedulingState()
  }, [])

  async function loadSchedulingState() {
    setError(null)
    const [settingsRes, statusRes] = await Promise.all([
      send({ type: 'GET_SETTINGS' }),
      send({ type: 'GET_CRAWL_STATUS' }),
    ])

    if (settingsRes.ok && settingsRes.settings !== undefined) {
      setSettings(settingsRes.settings)
    } else if (!settingsRes.ok) {
      setError(settingsRes.error)
    }

    if (statusRes.ok && statusRes.crawlInProgress !== undefined) {
      setCrawlInProgress(statusRes.crawlInProgress)
    } else if (!statusRes.ok) {
      setError(statusRes.error)
    }
  }

  async function saveCurrentPage() {
    setError(null)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      setError('No active page to save.')
      return
    }
    const res = await send(
      tab.title
        ? { type: 'SAVE_SOURCE', url: tab.url, title: tab.title }
        : { type: 'SAVE_SOURCE', url: tab.url },
    )
    if (!res.ok) setError(res.error)
  }

  async function remove(id: number) {
    setError(null)
    const res = await send({ type: 'DELETE_SOURCE', sourceId: id })
    if (!res.ok) setError(res.error)
  }

  async function refreshNow() {
    setError(null)
    setCrawlInProgress(true)
    const res = await send({ type: 'CRAWL_ALL' })
    if (!res.ok) setError(res.error)
    const status = await send({ type: 'GET_CRAWL_STATUS' })
    if (status.ok && status.crawlInProgress !== undefined) {
      setCrawlInProgress(status.crawlInProgress)
    } else {
      setCrawlInProgress(false)
      if (!status.ok) setError(status.error)
    }
  }

  async function setDailyCron(enableDailyCron: boolean) {
    setError(null)
    setSettings((current) => ({ ...(current ?? { enableDailyCron }), enableDailyCron }))
    const res = await send({ type: 'UPDATE_SETTINGS', settings: { enableDailyCron } })
    if (res.ok && res.settings !== undefined) {
      setSettings(res.settings)
    } else if (!res.ok) {
      setError(res.error)
      await loadSchedulingState()
    }
  }

  return (
    <main>
      <section aria-labelledby="digest-heading">
        <h1 id="digest-heading">Today's digest</h1>
        <DigestPreview
          crawlInProgress={crawlInProgress}
          posts={todaysPosts}
          sources={sources}
          today={today}
        />
      </section>

      <button type="button" onClick={() => void refreshNow()} disabled={crawlInProgress}>
        {crawlInProgress ? 'Refreshing...' : 'Refresh now'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={settings?.enableDailyCron ?? false}
          disabled={settings === null}
          onChange={(event) => void setDailyCron(event.currentTarget.checked)}
        />
        Daily 07:00 crawl
      </label>
      <button type="button" onClick={() => void saveCurrentPage()}>
        Save current page
      </button>
      {error && <p role="alert">{error}</p>}
      <SourceList sources={sources} remove={remove} />
    </main>
  )
}

function DigestPreview({
  crawlInProgress,
  posts,
  sources,
  today,
}: {
  crawlInProgress: boolean
  posts: Post[] | undefined
  sources: Source[] | undefined
  today: string
}) {
  if (crawlInProgress) {
    return <p role="status">Refreshing latest posts...</p>
  }

  if (sources === undefined || posts === undefined) {
    return <p role="status">Loading digest...</p>
  }

  if (sources.length === 0) {
    return <p>No sources saved yet.</p>
  }

  const digest = selectDigest(posts, sources, today)
  if (digest.length > 0) {
    return (
      <ul aria-label="Today's digest">
        {digest.map((post) => (
          <li key={post.postUrl}>
            <article>
              {post.thumbnail && (
                <img src={post.thumbnail} alt={`${post.title} thumbnail`} width="64" height="64" />
              )}
              <h2>
                <a href={post.postUrl} target="_blank" rel="noreferrer">
                  {post.title}
                </a>
              </h2>
              <p>{post.summary}</p>
            </article>
          </li>
        ))}
      </ul>
    )
  }

  const failures = sources.filter((source) => source.lastError)
  if (failures.length === sources.length) {
    return (
      <div role="alert">
        <p>All sources failed to crawl.</p>
        <ul>
          {failures.map((source) => (
            <li key={source.id ?? source.url}>
              {source.title}: {source.lastError}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return <p>No posts crawled for today yet.</p>
}

function SourceList({
  sources,
  remove,
}: {
  sources: Source[] | undefined
  remove: (id: number) => Promise<void>
}) {
  if (sources === undefined || sources.length === 0) return null

  return (
    <section aria-labelledby="sources-heading">
      <h2 id="sources-heading">Saved sources</h2>
      <ul>
        {sources.map((source) => (
          <li key={source.id}>
            <span title={source.url}>{source.title}</span>
            <button type="button" onClick={() => void remove(source.id!)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
