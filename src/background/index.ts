// Service worker entry point — the only context that crawls (per CLAUDE.md).
// Crawling, scheduling (chrome.alarms), and the typed message handler are added in
// later phases (TASK-020+). This placeholder establishes the SW so the unpacked
// extension loads. No in-memory state is relied upon between events (CON-002).
chrome.runtime.onInstalled.addListener(() => {
  console.log('dev-corner: service worker installed')
})
