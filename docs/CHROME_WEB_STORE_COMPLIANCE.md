# Chrome Web Store compliance matrix

## Single purpose

Dev Corner builds a local daily reading digest from blog sources the user explicitly saves. Source management, crawling, digest selection, favorites, scheduling, and digest notifications all directly support that purpose.

## Permission inventory

| Permission | Production use | User benefit | Narrower alternative |
|---|---|---|---|
| activeTab | Read URL/title after toolbar invocation | Subscribe to the current page | `tabs` is broader and rejected |
| storage | Settings and resumable crawl state | Survives MV3 eviction/restart | In-memory state is not durable |
| alarms | Daily crawl and one-shot continuation | Reliable MV3 scheduling | Worker timers are prohibited |
| contextMenus | Save an explicitly selected page/link | Fast source subscription | No equivalent API |
| notifications | Optional completed-digest alert | User-enabled morning alert | Feature is disabled by default |
| optional host patterns | Fetch user-selected sources | RSS/Atom/HTML extraction | Grants are requested per origin |

## Data inventory

| Data | Trigger | Local storage | Network recipient | Retention/deletion |
|---|---|---|---|---|
| Source URL/title | Explicit subscribe | IndexedDB sources | Selected source origin | Removed on unsubscribe |
| Post metadata | Crawl selected source | IndexedDB posts | Selected source origin; permitted thumbnail host/subdomain | Seven crawl days or unsubscribe |
| Favorite snapshot | Explicit favorite action | IndexedDB favoritePosts | None | Explicit unfavorite or uninstall |
| Settings | Toggle action/defaults | chrome.storage.local | None | Setting update or uninstall |
| Crawl state/errors | Crawl execution | chrome.storage.local/IndexedDB | None | Completion, retry, source removal, or uninstall |

## Dashboard declarations

- Single purpose: use the statement above.
- Remote code: No. Remote markup and images are data and are never executed.
- Website content: disclose because titles, summaries, links, and permitted thumbnail URLs are extracted.
- Web history: disclose conservatively because the extension stores URLs the user explicitly saves; it does not monitor general browsing history.
- Personally identifiable, health, financial, authentication, personal communications, location, and general user-activity monitoring: not collected.
- Data is not sold, used for ads, transferred to the developer, used for creditworthiness, or read by humans.
- Certify Limited Use.

## Package evidence

`pnpm verify:release` checks Manifest V3, no required host permissions, package/chunk budgets, and absence of eval, new Function, remote script tags, and remote source maps. The submission report records the final ZIP checksum.
