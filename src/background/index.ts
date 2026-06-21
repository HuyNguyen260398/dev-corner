// Service worker entry point — the only context that crawls (per CLAUDE.md).
// Here we register the "Save to dev-corner" context menu (F12), save through the
// shared src/lib/sources path, and trigger background-only crawling. No in-memory
// state is relied upon between events (CON-002).
import { crawlAll, crawlSourceById, isCrawlInProgress } from './crawl'
import { requestAndMarkSourcePermission, requestStoredSourcePermission } from './permissions'
import { configureDailyAlarm, handleDailyAlarm } from './scheduler'
import { getSettings, updateSettings } from './settings'
import { addSource, deleteSource } from '../lib/sources'
import type { WorkerRequest, WorkerResponse } from '../lib/types'

const SAVE_MENU_ID = 'dev-corner-save'

// Context menus are registered fresh on install/update (they do not persist across
// extension reloads). 'page' saves the current tab; 'link' saves a right-clicked link.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: SAVE_MENU_ID,
    title: 'Save to dev-corner',
    contexts: ['page', 'link'],
  })
  void configureDailyAlarm().catch(() => undefined)
})

chrome.runtime.onStartup.addListener(() => {
  void crawlAll().catch(() => undefined)
  void configureDailyAlarm().catch(() => undefined)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleDailyAlarm(alarm).catch(() => undefined)
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SAVE_MENU_ID) return
  // A right-clicked link wins over the page; linkUrl carries no title, so the page
  // title only applies when saving the page itself.
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url
  if (!url) return
  const title = info.linkUrl ? undefined : tab?.title
  void saveSourceWithPermission(url, title, true)
    .catch(() => undefined)
})

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Typed message boundary (GUD-003): the popup sends WorkerRequest and gets back a
// WorkerResponse. Handlers are async, so we return true to keep the channel open
// and call sendResponse later.
chrome.runtime.onMessage.addListener(
  (message: WorkerRequest, _sender, sendResponse: (response: WorkerResponse) => void) => {
    switch (message.type) {
      case 'SAVE_SOURCE':
        saveSourceWithPermission(message.url, message.title, false)
          .then(({ sourceId, permissionGranted }) =>
            sendResponse({ ok: true, sourceId, permissionGranted }),
          )
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'DELETE_SOURCE':
        deleteSource(message.sourceId)
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'REQUEST_SOURCE_PERMISSION':
        requestStoredSourcePermission(message.sourceId)
          .then(async (permissionGranted) => {
            if (permissionGranted) {
              await crawlSourceById(message.sourceId)
            }
            sendResponse({ ok: true, sourceId: message.sourceId, permissionGranted })
          })
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'CRAWL_SOURCE':
        crawlSourceById(message.sourceId)
          .then((result) =>
            sendResponse(
              result.ok
                ? { ok: true, sourceId: result.sourceId }
                : { ok: false, error: result.error ?? 'Crawl failed' },
            ),
          )
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'CRAWL_ALL':
        crawlAll()
          .then((result) => sendResponse(result))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'GET_SETTINGS':
        getSettings()
          .then((settings) => sendResponse({ ok: true, settings }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'UPDATE_SETTINGS':
        updateSettings(message.settings)
          .then(async (settings) => {
            await configureDailyAlarm()
            sendResponse({ ok: true, settings })
          })
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
      case 'GET_CRAWL_STATUS':
        isCrawlInProgress()
          .then((crawlInProgress) => sendResponse({ ok: true, crawlInProgress }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }))
        return true
    }

    return assertNever(message)
  },
)

function assertNever(value: never): never {
  throw new Error(`Unhandled worker request: ${JSON.stringify(value)}`)
}

async function saveSourceWithPermission(
  url: string,
  title: string | undefined,
  crawlAfterGrant: boolean,
): Promise<{ sourceId: number; permissionGranted: boolean }> {
  const sourceId = await addSource(url, title)
  const permissionGranted = await requestAndMarkSourcePermission(sourceId, url)
  if (permissionGranted && crawlAfterGrant) {
    await crawlSourceById(sourceId)
  }
  return { sourceId, permissionGranted }
}
