# Correctness Review — B002

**Reviewer:** Fresh agent session
**Date:** 2026-04-01
**Batch:** docs/batches/B002-pending-request-badge.md

## Checks

| Check | Result |
|-------|--------|
| `npm test` | 76/76 passed |
| `npx tsc --noEmit` | Clean |

## Acceptance Criteria Verification

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| 1 | Both layouts show numeric badge when pending > 0 | Pass | `app/admin/requests/layout.tsx:17,23` and `app/qa/(protected)/layout.tsx:14,25` both call `getPendingRequestCount()` and pass as `badge` prop |
| 2 | No badge when count is 0 | Pass | `AdminHeader.tsx:59` checks `link.badge != null && link.badge > 0` — correctly hides for 0 and undefined |
| 3 | Amber styling consistent with requests page badge | Pass | Nav badge uses `bg-amber-100 text-amber-800` — same colour tokens as `app/admin/requests/page.tsx:21`. Size is smaller (`text-[10px]` vs `text-sm`) which is appropriate for nav context |
| 4 | Both layouts import from `lib/document-requests.ts` | Pass | No duplicate query logic |
| 5 | `npx tsc --noEmit` clean | Pass | |

## Files Reviewed

- `app/admin/requests/layout.tsx` — full file (42 lines)
- `app/qa/(protected)/layout.tsx` — full file (43 lines)
- `components/AdminHeader.tsx` — full file (101 lines)
- `lib/document-requests.ts:199-203` — `getPendingRequestCount()` source
- `app/admin/requests/page.tsx:1-25` — existing badge for styling comparison

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **`AdminHeader.tsx:59`** — The `!= null` loose equality check (`link.badge != null`) catches both `null` and `undefined`, which is correct here. However, if a `badge: 0` were ever explicitly passed (vs omitted), the `> 0` check already handles it. The double guard is harmless but redundant — `link.badge && link.badge > 0` would behave identically since `0` is falsy. Not a bug, just a note.

## Summary

Clean implementation. The batch is small and well-scoped — two layouts import an existing function and pass the count to a shared component that conditionally renders a pill. The null/zero guard in `AdminHeader` is correct. Badge colours match the existing requests page. No new database calls, no client-side SQLite risk (all server components), no unhandled edge cases.
