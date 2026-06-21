import { defineManifest } from '@crxjs/vite-plugin'

const extensionIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

// MV3 manifest. host_permissions is <all_urls> for personal/unpacked use (ADR-002);
// a public Web Store listing would swap to per-origin optional_host_permissions
// (plan Phase 8). The service worker is the only crawling context.
export default defineManifest({
  manifest_version: 3,
  name: 'dev-corner',
  version: '0.1.0',
  description:
    'Crawls your saved blog sources and shows a daily 5-post reading digest. Fully local.',
  icons: extensionIcons,
  permissions: ['storage', 'alarms', 'contextMenus', 'notifications'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'dev-corner',
    default_icon: extensionIcons,
  },
})
