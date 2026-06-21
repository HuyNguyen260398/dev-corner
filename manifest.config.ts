import { defineManifest } from '@crxjs/vite-plugin'

const extensionIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

// MV3 manifest. Public Web Store builds use per-origin optional host grants
// requested at save time (ADR-002 Option B). The service worker is the only
// crawling context.
export default defineManifest({
  manifest_version: 3,
  name: 'dev-corner',
  version: '0.1.0',
  description:
    'Crawls your saved blog sources and shows a daily 5-post reading digest. Fully local.',
  icons: extensionIcons,
  permissions: ['storage', 'alarms', 'contextMenus', 'notifications'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
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
