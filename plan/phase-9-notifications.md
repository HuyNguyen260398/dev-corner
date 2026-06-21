---
goal: Phase 9 — Daily new-post notifications after the scheduled crawl
version: 1.0
date_created: 2026-06-21
last_updated: 2026-06-21
owner: Huy Nguyen
status: 'Planned'
tags: [feature, notifications, background, scheduling]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Add a simple Chrome notification after the daily scheduled crawl when at least
one newly discovered post is available in today's digest. The feature stays fully
local: no backend, telemetry, remote push service, or network calls beyond the
existing fetches to user-saved sources. Phase 9 of the
[master plan](./feature-dev-corner-mvp-1.md).

## 1. Requirements & Constraints

- **REQ-F13**: After the 07:00 scheduled crawl completes, notify the user when new posts were discovered for today's digest.
- **REQ-F14**: Notification copy must be summary-only: count of new posts and a short digest cue; do not include remote images or post content fetches in the notification.
- **REQ-F15**: Clicking the notification opens the extension popup/digest surface via the extension action where Chrome supports it.
- **REQ-F16**: Users can disable daily notifications separately from disabling the daily crawl.
- **SEC-001**: Privacy — no telemetry, remote push, notification analytics, or third-party services.
- **CON-002**: MV3 service workers are ephemeral; notification dedupe state must persist to `chrome.storage.local`.
- **CON-003**: Use the existing `chrome.alarms` daily schedule; do not add `setInterval` or `setTimeout`.
- **CON-005**: TypeScript strict mode; no `any`; extend discriminated unions in `src/lib/types.ts`.
- **GUD-001**: Pure notification formatting/counting logic belongs in `src/lib/` and has unit tests.
- **GUD-002**: The popup never crawls; it may only read/update notification settings via typed worker messages.
- **PAT-003**: Notification emission happens only from the service worker after `handleDailyAlarm()` finishes `crawlAll()`.

## 2. Implementation Steps

> Commit-per-task completion is required for this phase. Complete exactly one
> task, run that task's verification, update this plan row with `✅ YYYY-MM-DD`
> and the commit hash, then commit only the files for that task before starting
> the next task.

### Commit-per-task completion protocol

For each `TASK-XXX`, execute this sequence:

1. Implement only the files listed in the task description and related test files.
2. Run the task-specific verification command listed in the task row.
3. Update the task row's `Completed` cell to `✅ YYYY-MM-DD` and its `Commit` cell to the created commit hash.
4. Stage only the changed files for that task plus this plan file.
5. Create one commit with subject `TASK-XXX: <short description>` and this trailer:

```text
Co-Authored-By: Codex <codex@openai.com>
```

Do not combine two task numbers in one commit. Do not begin the next task until
the previous task has a passing verification command and its own commit.

### Implementation Phase 9

- GOAL-009: Daily opt-out notification for newly discovered posts.

| Task | Description | Verification before commit | Completed | Commit |
|------|-------------|----------------------------|-----------|--------|
| TASK-043 | Extend `Settings` in `src/lib/types.ts` with `enableDailyNotifications: boolean`; default it to `true` in `src/background/settings.ts`; extend `UPDATE_SETTINGS` handling without changing existing `enableDailyCron` behavior. | `pnpm test tests/popup/App.test.tsx tests/integration/crawl.test.ts` | ✅ 2026-06-21 | `TASK-043: add notification setting default` |
| TASK-044 | Add `src/lib/notifications.ts` with pure helpers: `localDateKey(date: Date)`, `buildDigestNotification({ newPostCount, digestCount, dateKey })`, and `shouldNotifyDailyDigest({ enableDailyCron, enableDailyNotifications, newPostCount, dateKey, lastNotificationDate })`; cover them in `tests/lib/notifications.test.ts`. | `pnpm test tests/lib/notifications.test.ts` | ✅ 2026-06-21 | `TASK-044: add digest notification helpers` |
| TASK-045 | Update `src/background/crawl.ts` result types to report `newPostsWritten` separately from `postsWritten`; make `upsertPost()` return whether the `postUrl` was newly inserted so repeated crawls do not announce old posts. | `pnpm test tests/integration/crawl.test.ts` | ✅ 2026-06-21 | `TASK-045: count newly inserted posts` |
| TASK-046 | Create `src/background/notifications.ts` as the only `chrome.notifications` wrapper; persist `lastDigestNotificationDate` in `chrome.storage.local`; call `chrome.notifications.create()` with a stable notification id like `daily-digest-${dateKey}` and packaged `icons/icon-128.png` as `iconUrl`; handle `chrome.notifications.onClicked` by opening the digest surface with `chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/index.html') })`, or `chrome.action.openPopup()` when supported. | `pnpm test tests/lib/notifications.test.ts tests/integration/crawl.test.ts` | ✅ 2026-06-21 | `TASK-046: add background notification wrapper` |
| TASK-047 | Wire `src/background/scheduler.ts`: after `handleDailyAlarm()` completes `crawlAll()`, call the notification wrapper only if `shouldNotifyDailyDigest()` returns true; always reschedule the next 07:00 alarm in `finally`. | `pnpm test tests/integration/crawl.test.ts` | ✅ 2026-06-21 | `TASK-047: notify after scheduled crawls` |
| TASK-048 | Add a popup toggle beside the existing daily crawl toggle in `src/popup/App.tsx`: label `Daily notifications`; disabled while settings load; writes `UPDATE_SETTINGS { enableDailyNotifications }`; add/adjust popup tests. | `pnpm test tests/popup/App.test.tsx` | ✅ 2026-06-21 | `TASK-048: add notification settings toggle` |
| TASK-049 | Add notification integration tests in `tests/integration/crawl.test.ts`: scheduled crawl with new posts creates one notification; same-day second scheduled crawl does not; manual `CRAWL_ALL` does not create a notification; disabled setting suppresses notification. | `pnpm test tests/integration/crawl.test.ts && pnpm build` | ✅ 2026-06-21 | `TASK-049: cover notification crawl scenarios` |

## 3. Alternatives

- **ALT-001**: Show a notification after every crawl, including manual refresh and context-menu saves. Rejected because it creates noisy duplicate notifications and makes manual refresh feel surprising.
- **ALT-002**: Use remote push notifications. Rejected because it violates the fully local/no-backend requirement.
- **ALT-003**: Include post titles in the notification body. Deferred to keep the first version simple and avoid long, unstable notification text; the popup remains the digest surface.

## 4. Dependencies

- **DEP-001**: Phase 5 scheduling is present (`src/background/scheduler.ts`, `DAILY_CRAWL_ALARM`).
- **DEP-002**: Phase 6 digest/pruning is present (`src/lib/selection.ts`, today's posts in IndexedDB).
- **DEP-003**: Manifest includes Chrome `notifications` permission. No new permission should be needed because `manifest.config.ts` already declares it.
- **DEP-004**: Chrome extension APIs: `chrome.notifications`, `chrome.storage.local`, and existing `chrome.alarms`.

## 5. Files

- `src/lib/types.ts` — add `Settings.enableDailyNotifications` and preserve typed message unions.
- `src/background/settings.ts` — default notification setting to enabled.
- `src/lib/notifications.ts` — pure notification formatting and decision helpers.
- `src/background/crawl.ts` — count newly inserted posts separately from upserts.
- `src/background/notifications.ts` — Chrome notification wrapper and same-day dedupe storage.
- `src/background/scheduler.ts` — invoke notification wrapper after the scheduled crawl only.
- `src/popup/App.tsx` and `src/popup/App.css` — notification toggle UI.
- `tests/lib/notifications.test.ts`, `tests/integration/crawl.test.ts`, `tests/popup/App.test.tsx` — unit, integration, and UI coverage.
- `manifest.config.ts` — verify `notifications` remains declared; no permission widening.

## 6. Testing

- **TEST-010**: Unit-test `shouldNotifyDailyDigest()` for enabled, disabled, zero-new-post, and same-day-dedupe cases.
- **TEST-011**: Unit-test `buildDigestNotification()` for singular/plural copy and stable notification id.
- **TEST-012**: Integration-test the daily alarm path: a scheduled crawl that inserts new posts creates exactly one notification and stores `lastDigestNotificationDate`.
- **TEST-013**: Integration-test duplicate prevention: a second scheduled crawl on the same local day creates no additional notification.
- **TEST-014**: Integration-test scope: manual `CRAWL_ALL`, `CRAWL_SOURCE`, and context-menu save do not create daily digest notifications.
- **TEST-015**: Popup test verifies the `Daily notifications` toggle loads from `GET_SETTINGS` and sends `UPDATE_SETTINGS`.
- **TEST-016**: Run `pnpm build`; manually load `dist/` unpacked and confirm no background service-worker console errors.

## 7. Risks & Assumptions

- **RISK-006**: Users may perceive daily notifications as noisy. Mitigation: add a dedicated opt-out setting and emit at most once per local day.
- **RISK-007**: Chrome notifications may not appear if the operating system suppresses browser notifications. Mitigation: keep popup digest as the primary source of truth and document this in manual testing notes if needed.
- **RISK-008**: Counting upserts as new posts would spam users. Mitigation: `upsertPost()` returns insert-vs-update and `newPostsWritten` drives notification eligibility.
- **ASSUMPTION-005**: Daily notifications default to enabled because the extension already has the `notifications` permission and the user asked to be informed of new posts daily.
- **ASSUMPTION-006**: Notification content is summary-only for v1; detailed post browsing remains in the popup.

## 8. Related Specifications / Further Reading

- [Master plan](./feature-dev-corner-mvp-1.md)
- [Phase 5 scheduling](./phase-5-scheduling.md)
- [Phase 6 digest UI + pruning](./phase-6-digest-ui.md)
- `docs/DEVELOPMENT_PLAN.md` §6 (scheduling) and §8 (permissions)
- Chrome Extensions documentation: `chrome.notifications` API and MV3 service-worker lifecycle
