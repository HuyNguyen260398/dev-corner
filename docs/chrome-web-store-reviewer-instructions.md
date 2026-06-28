# Chrome Web Store reviewer instructions

No credentials or test account are required. Dev Corner is fully client-side.

1. Install the extension and open its toolbar popup. Confirm Daily Posts, Favorite Posts, and Sources render.
2. Open an HTTPS developer blog in the active tab.
3. Open Dev Corner, choose Sources, and click Subscribe.
4. Grant Chrome's permission prompt for that blog origin.
5. Click Refresh digest. The extension shows locally stored posts when extraction succeeds, or a source-specific error when the site has no usable feed/markup.
6. Favorite one available post and confirm it appears in Favorite Posts.
7. Return to Sources and unsubscribe. Normal posts for that source disappear; the independent favorite remains.
8. Confirm Daily notifications is disabled on a fresh install and can be enabled explicitly in Sources.

Network access is limited to origins explicitly saved and granted by the reviewer. No remote code, backend, analytics, or telemetry is used.

