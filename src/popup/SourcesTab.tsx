import type { Settings, Source } from '../lib/types'

interface SourcesTabProps {
  sources: Source[] | undefined
  settings: Settings | null
  lastCrawl: string
  onSaveCurrentPage: () => void
  onRemoveSource: (id: number) => void
  onRequestPermission: (source: Source & { id: number }) => void
  onSetDailyCron: (enabled: boolean) => void
  onSetDailyNotifications: (enabled: boolean) => void
}

export function SourcesTab({
  sources,
  settings,
  lastCrawl,
  onSaveCurrentPage,
  onRemoveSource,
  onRequestPermission,
  onSetDailyCron,
  onSetDailyNotifications,
}: SourcesTabProps) {
  return (
    <section aria-labelledby="sources-heading" className="tab-panel sources-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h1 id="sources-heading">Sources</h1>
        </div>
        <span>{sources?.length ?? 0}</span>
      </div>

      <label className="schedule-toggle">
        <input
          type="checkbox"
          checked={settings?.enableDailyCron ?? false}
          disabled={settings === null}
          onChange={(event) => onSetDailyCron(event.currentTarget.checked)}
        />
        <span aria-hidden="true" />
        <span>Daily 07:00 crawl</span>
      </label>

      <label className="schedule-toggle">
        <input
          type="checkbox"
          checked={settings?.enableDailyNotifications ?? false}
          disabled={settings === null}
          onChange={(event) => onSetDailyNotifications(event.currentTarget.checked)}
        />
        <span aria-hidden="true" />
        <span>Daily notifications</span>
      </label>

      <button type="button" className="primary-action" onClick={onSaveCurrentPage}>
        <PlusIcon />
        <span>Subscribe</span>
      </button>

      {sources === undefined ? (
        <div className="loading-card" role="status">
          <p>Loading sources...</p>
        </div>
      ) : sources.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No sources saved yet.</p>
          <p>Subscribe to the current page to add it to your local library.</p>
        </div>
      ) : (
        <ul className="source-list" aria-label="Saved sources">
          {sources.map((source) => (
            <li key={source.id ?? source.url}>
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
                      if (source.id !== undefined) {
                        onRequestPermission({ ...source, id: source.id })
                      }
                    }}
                  >
                    Grant permission
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-button subtle"
                disabled={source.id === undefined}
                onClick={() => {
                  if (source.id !== undefined) onRemoveSource(source.id)
                }}
                aria-label={`Unsubscribe ${source.title}`}
                title={`Unsubscribe ${source.title}`}
              >
                <BookmarkOffIcon />
                <span className="sr-only">Unsubscribe</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="crawl-note">Last crawl {lastCrawl}</p>
    </section>
  )
}

function sourceInitial(source: Source): string {
  return source.title.trim().slice(0, 1).toUpperCase() || 'S'
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
