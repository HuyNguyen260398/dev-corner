# Performance and release budgets

Run `pnpm verify:release` from a clean process before packaging. The command enforces TypeScript, lint, test, build, total-package, per-JavaScript-chunk, Manifest V3, required-host-permission, and remote-executable-code gates.

## Popup measurements

Use a production `dist/` build loaded unpacked in a dedicated Chrome profile. Measure 20 cold popup openings with DevTools Performance, first with zero sources and then with at least 20 fixture-backed sources. Record action invocation to rendered shell and action invocation to the deterministic daily state. Required budgets are median ≤300 ms and p95 ≤750 ms for the shell, and median ≤500 ms and p95 ≤1,000 ms for local data.

## Crawl measurements

Automated tests enforce cached-feed request count, maximum enrichment concurrency, request/source deadlines, and single-flight behavior. Manual testing confirms the same behavior with RSS, Atom, HTML fallback, slow, malformed, and offline sources.

## Storage measurements

Chrome DevTools Application > IndexedDB is inspected after seven fixture crawl days with 20 sources. Only seven crawl-day partitions remain, removed sources have no posts, and favorite snapshots remain until explicitly removed.
