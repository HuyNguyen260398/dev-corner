// Source management UI (F1, F2). The popup never crawls (GUD-002): it reads the
// source list live from IndexedDB and routes saves/deletes through the worker via
// the typed message boundary (GUD-003). The daily digest replaces this in Phase 6.
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSources } from '../lib/sources'
import type { WorkerRequest, WorkerResponse } from '../lib/types'

function send(request: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(request) as Promise<WorkerResponse>
}

export function App() {
  const sources = useLiveQuery(() => listSources(), [])
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main>
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
