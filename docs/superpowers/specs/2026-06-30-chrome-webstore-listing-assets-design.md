# Chrome Web Store Listing Assets Design

**Date:** 2026-06-30  
**Status:** Approved for implementation  
**Target release:** Dev Corner 0.1.0

## Goal

Produce the customer-facing visual assets required for the first public Chrome Web Store submission while accurately representing the packaged extension and protecting private browsing information.

## Deliverables

Create four local files:

- `~/Desktop/screenshot-1-digest.png`
- `~/Desktop/screenshot-2-sources.png`
- `~/Desktop/screenshot-3-favorites.png`
- `~/Desktop/promo-small-440x280.png`

The three screenshots must be 1280×800 PNG files. The promotional tile must be a 440×280 PNG file. Every file must be no more than 2 MB.

## Screenshot content

Use a dedicated Chrome profile loaded with the verified `dist/` package. Populate the extension from live, public developer-blog posts. The preferred sources are:

- DEV Community
- Kubernetes Blog
- DevOpsCube

Substitute another public HTTPS developer blog only if one of these sources cannot be granted or crawled successfully. Do not use personal, authenticated, private, or locally hosted content.

Capture these states:

1. **Daily Posts:** Show a populated digest with post cards, thumbnails where available, the Dev Corner header, and bottom navigation.
2. **Sources:** Show the saved public sources, the daily crawl control, daily notifications visibly disabled, the subscribe action, and bottom navigation.
3. **Favorite Posts:** Favorite at least one post from Daily Posts and show it retained in the Favorite Posts view with bottom navigation.

## Screenshot framing

Use the approved **browser-context** direction:

- Capture the literal Chrome experience at 1280×800 with the extension popup open.
- Keep the popup fully visible and readable.
- Use a public developer-blog page as the active background tab.
- Keep browser chrome visible to establish that this is a toolbar extension.
- Use the same browser window dimensions, profile, extension package, and general framing for all three screenshots.
- Do not add marketing copy, simulated browser controls, or composited UI around the captured experience.

Before capture, remove or hide unrelated tabs, bookmarks, downloads, account avatars, profile names, notification banners, debug tools, local URLs, and private browsing history. The active page and all visible post content must be public.

## Promotional tile

Use the approved **product-preview** direction.

### Composition

- Full 440×280 canvas with no padding or transparency around the outer edge.
- Dark navy background based on the extension palette (`#0b1120`, `#111827`, and `#172033`).
- Green accent based on `#22c55e`.
- Left side: the existing `dc` brand mark and short headline.
- Right side: a simplified, accurate preview of the Daily Posts interface using generic shapes rather than copied live article content.
- Maintain strong contrast and legibility when displayed at half size.

### Copy

Use only:

- Headline: `A focused daily digest`
- Supporting line: `Developer blogs you choose. Local by design.`

Do not add rankings, review claims, performance claims, security guarantees, Chrome endorsement, source trademarks, or claims not supported by the extension.

## Production approach

- Capture screenshots from the real unpacked production extension; do not recreate the popup in a design tool.
- Generate the promotional tile as a raster PNG based on the approved composition, then inspect and correct it if text, dimensions, colors, or UI representation diverge from this specification.
- Do not modify extension behavior, permissions, manifest data, or production UI for these assets.

## Validation

For each screenshot:

- Confirm dimensions are exactly 1280×800.
- Confirm PNG format and file size no more than 2 MB.
- Confirm the popup state matches the filename and listing description.
- Confirm live content is public and no private browser data is visible.
- Confirm no debug UI, broken thumbnails, loading state, permission prompt, or crawl error is visible.

For the promotional tile:

- Confirm dimensions are exactly 440×280.
- Confirm PNG format and file size no more than 2 MB.
- Confirm the two approved text strings are spelled exactly.
- Confirm the product preview is recognizable and consistent with the shipped popup.
- Confirm the tile remains readable when downscaled to 220×140.

Record the final file paths, dimensions, sizes, and validation result in `docs/CHROME_WEB_STORE_PUBLICATION_READINESS.md`.

## Non-goals

- No marquee promotional image.
- No video asset.
- No localization variants for version 0.1.0.
- No UI redesign or screenshot-only production behavior.
- No use of private, fixture, or fabricated article content in screenshots.

