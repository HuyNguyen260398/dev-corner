// Shared, side-effect-free types. No `chrome.*` access here (GUD-001).
// All cross-context messages use the discriminated unions below (GUD-003).

/** A user-saved blog/source page. */
export type SourcePermissionState = 'granted' | 'needsPermission'

export interface Source {
  id?: number
  /** The page the user saved. Unique. */
  url: string
  /** Best-effort site title. */
  title: string
  /** Resolved RSS/Atom feed, cached after discovery. */
  feedUrl?: string
  faviconUrl?: string
  addedAt: number
  lastCrawledAt?: number
  /** Last crawl failure, surfaced in the UI. */
  lastError?: string
  /** Whether Chrome has granted this source origin to the extension. */
  permissionState?: SourcePermissionState
}

/** A post extracted from a source (F5 fields). */
export interface Post {
  id?: number
  sourceId: number
  /** F5: source original link. */
  sourceUrl: string
  /** F5 */
  title: string
  /** F5 */
  summary: string
  /** F5 */
  thumbnail?: string
  /** F5: post original link. Unique per source. */
  postUrl: string
  publishedAt?: number
  crawledAt: number
  /** 'YYYY-MM-DD' local — scopes "today's" list. */
  crawlDay: string
}

/** Persisted user settings (chrome.storage.local). */
export interface Settings {
  /** F7: crawl daily at 07:00 local time. */
  enableDailyCron: boolean
  /** Phase 9: notify after the daily crawl when new posts are discovered. */
  enableDailyNotifications: boolean
}

/** Requests sent from the popup / context menu to the service worker. */
export type WorkerRequest =
  | { type: 'CRAWL_ALL' }
  | { type: 'CRAWL_SOURCE'; sourceId: number }
  | { type: 'SAVE_SOURCE'; url: string; title?: string; permissionGranted?: boolean }
  | { type: 'DELETE_SOURCE'; sourceId: number }
  | { type: 'REQUEST_SOURCE_PERMISSION'; sourceId: number; permissionGranted?: boolean }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'GET_CRAWL_STATUS' }

/** Responses returned by the service worker, discriminated on `ok`. */
export type WorkerResponse =
  | {
      ok: true
      sourceId?: number
      sourcesCrawled?: number
      postsWritten?: number
      newPostsWritten?: number
      failures?: Array<{ sourceId: number; error: string }>
      settings?: Settings
      crawlInProgress?: boolean
      permissionGranted?: boolean
    }
  | { ok: false; error: string }
