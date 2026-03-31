# B002 — Pending Request Badge on Navigation

**Epic:** E3 — QA Workflow: Document Management Improvements
**Status:** `ready`
**Estimated size:** Small (< 1 hr)

---

## Goal

Show the count of pending document requests as a badge on the "Requests" nav link across all admin and QA layouts. QA spots new requests without navigating to the requests page.

---

## Background

`getPendingRequestCount()` already exists in `lib/document-requests.ts:199-203` and is already used on the requests page itself (`app/admin/requests/page.tsx`). The nav link "Requests" appears in two layouts:

- **Admin layout:** `app/admin/requests/layout.tsx` — 7 nav links, "Requests" points to `/admin/requests`
- **QA layout:** `app/qa/(protected)/layout.tsx` — "Requests" also points to `/admin/requests`, visible to all roles

Both layouts are server components that call `await auth()`, so they can call `getPendingRequestCount()` synchronously without a client fetch.

---

## Scope

### In scope
- Call `getPendingRequestCount()` in both layout files
- Render a small badge (count) next to the "Requests" link text when count > 0
- Badge styling: small pill, amber background (consistent with the requests page badge)
- No badge rendered when count is 0

### Out of scope
- Real-time updates (page refresh is fine)
- Badge on mobile hamburger menu (if one exists — handle only the current nav rendering)
- Changing the requests page itself

---

## Acceptance Criteria

1. When there are pending document requests, both the admin and QA nav layouts show a numeric badge next to "Requests" (e.g., `Requests 3`).
2. When there are zero pending requests, no badge is rendered — just the plain "Requests" text.
3. Badge uses amber styling consistent with the existing badge on `app/admin/requests/page.tsx`.
4. Both layouts import from `lib/document-requests.ts` — no duplicate query logic.
5. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `app/admin/requests/layout.tsx` | Import `getPendingRequestCount`, call it, render badge next to "Requests" link |
| `app/qa/(protected)/layout.tsx` | Same: import, call, render badge next to "Requests" link |

**Do not modify:**
- `lib/document-requests.ts` — function already exists
- `app/admin/requests/page.tsx` — leave the page-level badge as-is

---

## Test Plan

No unit test required — this is a pure UI change calling an existing function. Verify manually:
1. Create a pending document request (or ensure one exists in the DB)
2. Navigate to `/qa` — confirm badge visible on "Requests" nav link
3. Navigate to `/admin/requests` — confirm badge visible in that layout's nav too
4. Approve/reject all pending requests — confirm badge disappears from both

---

## Definition of Done

- [ ] Badge renders on both admin and QA nav when pending count > 0
- [ ] Badge hidden when count is 0
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
