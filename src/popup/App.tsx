// Source management UI (F1, F2). The popup never crawls (GUD-002): it reads the
// source list live from IndexedDB and routes saves/deletes through the worker via
// the typed message boundary (GUD-003). The daily digest replaces this in Phase 6.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSources } from '../lib/sources'
import type { Settings, WorkerRequest, WorkerResponse } from '../lib/types'

function send(request: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(request) as Promise<WorkerResponse>
}

export function App() {
  const sources = useLiveQuery(() => listSources(), [])
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
      {sources && sources.length > 0 ? (
        <ul>
          {sources.map((s) => (
            <li key={s.id}>
              <span title={s.url}>{s.title}</span>
              <button type="button" onClick={() => void remove(s.id!)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No sources saved yet.</p>
      )}
    </main>
  )
}
