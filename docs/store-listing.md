# Dev Corner — Chrome Web Store listing

## Name
Dev Corner

## Short description
Build a private daily reading digest from developer blogs you choose. Local storage, per-site permissions, no account or backend.

## Single purpose
Dev Corner builds a local daily reading digest from blog sources the user explicitly saves.

## Detailed description
Dev Corner turns developer blogs you explicitly subscribe to into a local reading digest in the Chrome toolbar.

Subscribe from the popup or context menu. Dev Corner requests access only to that site's origin, discovers RSS or Atom when available, falls back to best-effort HTML extraction, and stores recent post metadata in your browser. The Daily Posts view selects up to five available posts according to the extension's source-diversity rule. Favorites remain until you remove them.

An optional 07:00 local crawl keeps the digest current. Daily desktop notifications are off by default and can be enabled from Sources.

Dev Corner has no account, backend, analytics, advertising, or telemetry. Content requests go only to source origins you save and grant; HTTPS thumbnails may load from image hosts explicitly selected by those sources.

## Permission justifications

- activeTab: Temporarily reads the URL and title of the active page after the user clicks Dev Corner, so the user can subscribe to that page. It does not monitor browsing.
- storage: Persists local settings and resumable crawl state across browser restarts and MV3 service-worker eviction.
- alarms: Schedules the optional daily crawl and resumes a bounded crawl queue without persistent worker timers.
- contextMenus: Adds “Save to Dev Corner” for an explicitly selected page or link.
- notifications: Sends an optional completed-digest alert. Notifications are off by default.
- optional host permissions: Fetches RSS, Atom, and HTML only from origins the user explicitly subscribes to and grants. Thumbnail rendering separately accepts HTTPS image URLs explicitly provided by those sources, including third-party CDNs.

## Dashboard data disclosure

Disclose Website content and, conservatively, Web history for explicitly saved URLs. Certify that data remains local, is used only for the stated single purpose, is not sold or transferred, is not used for advertising or creditworthiness, and is not read by humans.

## Remote code
No. All executable logic is packaged in the extension. Remote markup and images are treated only as data.
