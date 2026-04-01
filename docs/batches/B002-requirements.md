# B002 — Requirements: Pending Request Badge on Navigation

## Functional Requirements

- [ ] `NavLink` interface in `AdminHeader.tsx` has an optional `badge?: number` property
- [ ] When `badge` is present and > 0, an amber pill is rendered inline after the link label text
- [ ] When `badge` is 0, undefined, or absent, no badge is rendered
- [ ] Badge styling: small pill, `bg-amber-100 text-amber-800`, scaled for nav context (text-xs, tight padding)
- [ ] `app/admin/requests/layout.tsx` calls `getPendingRequestCount()` and passes the count as `badge` on the "Requests" nav link
- [ ] `app/qa/(protected)/layout.tsx` does the same
- [ ] Both layouts import from `lib/document-requests.ts` — no duplicate query logic

## Error States

- [ ] `getPendingRequestCount()` returns 0 when no pending requests exist → no badge rendered
- [ ] If `document_requests` table is empty → count is 0, no badge, no crash

## Build

- [ ] `npx tsc --noEmit` clean — no type errors introduced

## Non-Requirements

- No unit test (pure UI change calling existing function)
- No real-time updates (page refresh is sufficient)
- No changes to `lib/document-requests.ts`
- No changes to `app/admin/requests/page.tsx`
