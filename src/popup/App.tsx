// Daily digest and source management UI. The popup never crawls (GUD-002): it
// reads IndexedDB live and routes saves/deletes/refreshes through the worker via
// the typed message boundary (GUD-003).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { listFavorites } from '../lib/favorites'
import { originPatternForUrl } from '../lib/permissions'
import { listSources } from '../lib/sources'
import type { Post, Settings, Source, WorkerRequest, WorkerResponse } from '../lib/types'
import { BottomNav, type PopupTab } from './BottomNav'
import { DailyPostsTab } from './DailyPostsTab'
import { FavoritePostsTab } from './FavoritePostsTab'
import { SourcesTab } from './SourcesTab'
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

      {activeTab === 'sources' && (
        <SourcesTab
          sources={sources}
          settings={settings}
          lastCrawl={lastCrawl}
          onSaveCurrentPage={() => void saveCurrentPage()}
          onRemoveSource={(id) => void remove(id)}
          onRequestPermission={(source) => void requestPermission(source)}
          onSetDailyCron={(enabled) => void setDailyCron(enabled)}
          onSetDailyNotifications={(enabled) => void setDailyNotifications(enabled)}
        />
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <BottomNav activeTab={activeTab} onSelect={setActiveTab} />
    </main>
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
