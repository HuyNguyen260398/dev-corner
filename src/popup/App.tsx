// Daily digest and source management UI. The popup never crawls (GUD-002): it
// reads IndexedDB live and routes saves/deletes/refreshes through the worker via
// the typed message boundary (GUD-003).
import { useEffect, useRef, useState, type Ref } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { originPatternForUrl } from '../lib/permissions'
import { selectDigest } from '../lib/selection'
import { listSources } from '../lib/sources'
import type { Post, Settings, Source, WorkerRequest, WorkerResponse } from '../lib/types'
import './App.css'

function send(request: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(request) as Promise<WorkerResponse>
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function App() {
  const today = localDateKey(new Date())
  const sources = useLiveQuery(() => listSources(), [])
  const todaysPosts = useLiveQuery(() => db.posts.where('crawlDay').equals(today).toArray(), [today])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [crawlInProgress, setCrawlInProgress] = useState(false)
  const sourcesSectionRef = useRef<HTMLElement | null>(null)

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
    let permissionGranted = false
    try {
      permissionGranted = await requestOriginPermission(tab.url)
    } catch (e) {
      setError(errorMessage(e))
    }
    const res = await send({
      type: 'SAVE_SOURCE',
      url: tab.url,
      ...(tab.title ? { title: tab.title } : {}),
      permissionGranted,
    })
    if (!res.ok) setError(res.error)
  }

  async function remove(id: number) {
    setError(null)
    const res = await send({ type: 'DELETE_SOURCE', sourceId: id })
    if (!res.ok) setError(res.error)
  }

  async function requestPermission(source: Source & { id: number }) {
    setError(null)
    let permissionGranted: boolean
    try {
      permissionGranted = await requestOriginPermission(source.url)
    } catch (e) {
      setError(errorMessage(e))
      return
    }
    const res = await send({
      type: 'REQUEST_SOURCE_PERMISSION',
      sourceId: source.id,
      permissionGranted,
    })
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
    setSettings((current) => ({
      ...(current ?? { enableDailyCron, enableDailyNotifications: true }),
      enableDailyCron,
    }))
    const res = await send({ type: 'UPDATE_SETTINGS', settings: { enableDailyCron } })
    if (res.ok && res.settings !== undefined) {
      setSettings(res.settings)
    } else if (!res.ok) {
      setError(res.error)
      await loadSchedulingState()
    }
  }

  async function setDailyNotifications(enableDailyNotifications: boolean) {
    setError(null)
    setSettings((current) => ({
      ...(current ?? { enableDailyCron: true, enableDailyNotifications }),
      enableDailyNotifications,
    }))
    const res = await send({
      type: 'UPDATE_SETTINGS',
      settings: { enableDailyNotifications },
    })
    if (res.ok && res.settings !== undefined) {
      setSettings(res.settings)
    } else if (!res.ok) {
      setError(res.error)
      await loadSchedulingState()
    }
  }

  function focusSources() {
    sourcesSectionRef.current?.focus()
  }

  const sourceCount = sources?.length ?? 0
  const postCount = todaysPosts?.length ?? 0
  const lastCrawl = latestCrawlTime(sources)

  return (
    <main className="popup-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            dc
          </span>
          <div>
            <p className="eyebrow">dev-corner</p>
            <p className="date-label">{formatToday(new Date())}</p>
          </div>
        </div>
        <div className="topbar-actions" aria-label="Digest actions">
          <button
            type="button"
            className="icon-button is-live"
            onClick={() => void refreshNow()}
            disabled={crawlInProgress}
            aria-label="Refresh digest"
            title="Refresh digest"
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      <section className="digest-panel" aria-labelledby="digest-heading">
        <div className="hero-copy">
          <div>
            <p className="eyebrow accent">Morning brief</p>
            <h1 id="digest-heading">Morning brief</h1>
          </div>
          <p className="hero-subtitle">{digestSummary(sourceCount, postCount, crawlInProgress)}</p>
        </div>

        <div className="status-pills" aria-label="Digest status">
          <span>Local only</span>
          <span>{settings?.enableDailyCron !== false ? '07:00 crawl' : 'Manual crawl'}</span>
          <span>5 min read</span>
        </div>

        <label className="schedule-toggle">
          <input
            type="checkbox"
            checked={settings?.enableDailyCron ?? false}
            disabled={settings === null}
            onChange={(event) => void setDailyCron(event.currentTarget.checked)}
          />
          <span aria-hidden="true" />
          <span>Daily 07:00 crawl</span>
        </label>

        <label className="schedule-toggle">
          <input
            type="checkbox"
            checked={settings?.enableDailyNotifications ?? false}
            disabled={settings === null}
            onChange={(event) => void setDailyNotifications(event.currentTarget.checked)}
          />
          <span aria-hidden="true" />
          <span>Daily notifications</span>
        </label>

        <DigestPreview
          crawlInProgress={crawlInProgress}
          posts={todaysPosts}
          sources={sources}
          today={today}
        />
      </section>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <SourceList
        ref={sourcesSectionRef}
        sources={sources}
        remove={remove}
        requestPermission={requestPermission}
      />

      <footer className="action-bar" aria-label="Primary actions">
        <button type="button" className="primary-action" onClick={() => void saveCurrentPage()}>
          <PlusIcon />
          <span>Save page</span>
        </button>
        <button type="button" className="secondary-action" onClick={focusSources}>
          <ListIcon />
          <span>Sources</span>
        </button>
        <p className="crawl-note">Last crawl {lastCrawl}</p>
      </footer>
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
    return (
      <div className="loading-card" role="status">
        <p>Refreshing latest posts...</p>
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (sources === undefined || posts === undefined) {
    return (
      <div className="loading-card" role="status">
        <p>Loading digest...</p>
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No sources saved yet.</p>
        <p>Add the current page or use the right-click menu to build tomorrow's brief.</p>
      </div>
    )
  }

  const digest = selectDigest(posts, sources, today)
  if (digest.length > 0) {
    return (
      <ul className="digest-list" aria-label="Today's digest">
        {digest.map((post, index) => {
          const source = sources.find((candidate) => candidate.id === post.sourceId)
          return (
            <li key={post.postUrl}>
              <article className={index === 0 ? 'post-card featured-post' : 'post-card'}>
                {post.thumbnail ? (
                  <img src={post.thumbnail} alt={`${post.title} thumbnail`} width="72" height="72" />
                ) : (
                  <div className="thumbnail-fallback" aria-hidden="true">
                    {sourceInitial(source, post)}
                  </div>
                )}
                <div className="post-content">
                  <div className="post-meta">
                    <span>{source?.title ?? hostLabel(post.sourceUrl)}</span>
                    <span>{relativeTime(post.publishedAt ?? post.crawledAt)}</span>
                  </div>
                  <h2>
                    <a href={post.postUrl} target="_blank" rel="noreferrer">
                      {post.title}
                    </a>
                  </h2>
                  <p>{post.summary}</p>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    )
  }

  const failures = sources.filter((source) => source.lastError)
  if (failures.length === sources.length) {
    return (
      <div className="alert" role="alert">
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

  return (
    <div className="empty-state">
      <p className="empty-title">No posts crawled for today yet.</p>
      <p>Refresh the digest or wait for the next scheduled crawl.</p>
    </div>
  )
}

type SourceListProps = {
  sources: Source[] | undefined
  remove: (id: number) => Promise<void>
  requestPermission: (source: Source & { id: number }) => Promise<void>
}

function SourceList({
  ref,
  sources,
  remove,
  requestPermission,
}: SourceListProps & { ref: Ref<HTMLElement> }) {
  if (sources === undefined || sources.length === 0) return null

  return (
    <section className="sources-panel" aria-labelledby="sources-heading" ref={ref} tabIndex={-1}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="sources-heading">Saved sources</h2>
        </div>
        <span>{sources.length}</span>
      </div>
      <ul className="source-list">
        {sources.map((source) => (
          <li key={source.id}>
            <span className="source-favicon" aria-hidden="true">
              {sourceInitial(source)}
            </span>
            <span className="source-title" title={source.url}>
              {source.title}
            </span>
            {source.permissionState === 'needsPermission' && (
              <>
                <span className="permission-chip">Needs permission</span>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    if (source.id != null) void requestPermission({ ...source, id: source.id })
                  }}
                >
                  Grant permission
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-button subtle"
              onClick={() => void remove(source.id!)}
              aria-label={`Delete ${source.title}`}
              title={`Delete ${source.title}`}
            >
              <TrashIcon />
              <span className="sr-only">Delete</span>
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

function digestSummary(sourceCount: number, postCount: number, crawlInProgress: boolean): string {
  if (crawlInProgress) return 'Refreshing your saved sources'
  if (sourceCount === 0) return 'Save a developer blog to start your local brief'
  if (postCount === 0) return `${sourceCount} saved ${pluralize('source', sourceCount)} ready`
  return `${Math.min(postCount, 5)} posts from your saved sources`
}

function latestCrawlTime(sources: Source[] | undefined): string {
  const latest = sources
    ?.map((source) => source.lastCrawledAt)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => right - left)[0]

  if (latest === undefined) return 'pending'

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(latest))
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Saved source'
  }
}

function sourceInitial(source: Source | undefined, post?: Post): string {
  const label = source?.title ?? (post ? hostLabel(post.sourceUrl) : 'S')
  return label.trim().slice(0, 1).toUpperCase() || 'S'
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}

function requestOriginPermission(sourceUrl: string): Promise<boolean> {
  const origin = originPatternForUrl(sourceUrl)
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      const lastError = chrome.runtime.lastError
      if (lastError !== undefined) {
        reject(new Error(lastError.message))
        return
      }
      resolve(granted)
    })
  })
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 9A7 7 0 0 0 6.2 6.7L4 9" />
      <path d="M5.5 15A7 7 0 0 0 17.8 17.3L20 15" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}
