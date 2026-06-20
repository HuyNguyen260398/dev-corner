// Service worker entry point — the only context that crawls (per CLAUDE.md).
// Crawling and scheduling (chrome.alarms) arrive in later phases. Here we register
// the "Save to dev-corner" context menu (F12) and save through the shared, pure
// src/lib/sources path. No in-memory state is relied upon between events (CON-002).
import { addSource } from '../lib/sources'

const SAVE_MENU_ID = 'dev-corner-save'

// Context menus are registered fresh on install/update (they do not persist across
// extension reloads). 'page' saves the current tab; 'link' saves a right-clicked link.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: SAVE_MENU_ID,
    title: 'Save to dev-corner',
    contexts: ['page', 'link'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SAVE_MENU_ID) return
  // A right-clicked link wins over the page; linkUrl carries no title, so the page
  // title only applies when saving the page itself.
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url
  if (!url) return
  const title = info.linkUrl ? undefined : tab?.title
  void addSource(url, title)
})
