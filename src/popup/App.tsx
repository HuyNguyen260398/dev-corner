// Daily digest and source management UI. The popup never crawls (GUD-002): it
// reads IndexedDB live and routes saves/deletes/refreshes through the worker via
// the typed message boundary (GUD-003).
import { useEffect, useRef, useState, type Ref } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { listFavorites } from '../lib/favorites'
import { originPatternForUrl } from '../lib/permissions'
import { listSources } from '../lib/sources'
import type { Post, Settings, Source, WorkerRequest, WorkerResponse } from '../lib/types'
import { BottomNav, type PopupTab } from './BottomNav'
import { DailyPostsTab } from './DailyPostsTab'
import { FavoritePostsTab } from './FavoritePostsTab'
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
  const favorites = useLiveQuery(() => listFavorites(), [])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [crawlInProgress, setCrawlInProgress] = useState(false)
  const [activeTab, setActiveTab] = useState<PopupTab>('daily')
  const [pendingFavoriteUrls, setPendingFavoriteUrls] = useState<ReadonlySet<string>>(new Set())
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

  async function toggleDailyFavorite(post: Post) {
    const isFavorite = favorites?.some((favorite) => favorite.postUrl === post.postUrl) ?? false
    if (isFavorite) {
      await updateFavorite(post.postUrl, { type: 'REMOVE_FAVORITE', postUrl: post.postUrl })
      return
    }
    if (post.id === undefined) {
      setError(`Post ${post.postUrl} has no persisted id.`)
      return
    }
    await updateFavorite(post.postUrl, { type: 'ADD_FAVORITE', postId: post.id })
  }

  async function updateFavorite(postUrl: string, request: WorkerRequest) {
    setError(null)
    setPendingFavoriteUrls((current) => new Set(current).add(postUrl))
    try {
      const response = await send(request)
      if (!response.ok) setError(response.error)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setPendingFavoriteUrls((current) => {
        const next = new Set(current)
        next.delete(postUrl)
        return next
      })
    }
  }

  const lastCrawl = latestCrawlTime(sources)
  const favoriteUrls = new Set(favorites?.map((favorite) => favorite.postUrl) ?? [])

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

      {activeTab === 'daily' && (
        <DailyPostsTab
          crawlInProgress={crawlInProgress}
          posts={todaysPosts}
          sources={sources}
          today={today}
          favoriteUrls={favoriteUrls}
          pendingUrls={pendingFavoriteUrls}
          onToggleFavorite={(post) => void toggleDailyFavorite(post)}
        />
      )}

      {activeTab === 'favorites' && (
        <FavoritePostsTab
          favorites={favorites}
          pendingUrls={pendingFavoriteUrls}
          onRemoveFavorite={(postUrl) =>
            void updateFavorite(postUrl, { type: 'REMOVE_FAVORITE', postUrl })
          }
        />
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

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

      <SourceList
        ref={sourcesSectionRef}
        sources={sources}
        remove={remove}
        requestPermission={requestPermission}
      />

      <footer className="action-bar" aria-label="Primary actions">
        <button type="button" className="primary-action" onClick={() => void saveCurrentPage()}>
          <PlusIcon />
          <span>Subscribe</span>
        </button>
        <p className="crawl-note">Last crawl {lastCrawl}</p>
      </footer>

      <BottomNav activeTab={activeTab} onSelect={setActiveTab} />
    </main>
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
            <span className="source-copy">
              <span className="source-title" title={source.url}>
                {source.title}
              </span>
              <span className="source-url" title={source.url}>
                {source.url}
              </span>
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
              aria-label={`Unsubscribe ${source.title}`}
              title={`Unsubscribe ${source.title}`}
            >
              <BookmarkOffIcon />
              <span className="sr-only">Unsubscribe</span>
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

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function sourceInitial(source: Source | undefined): string {
  const label = source?.title ?? 'S'
  return label.trim().slice(0, 1).toUpperCase() || 'S'
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

function BookmarkOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11" />
      <path d="M2 2l20 20" />
    </svg>
  )
}
