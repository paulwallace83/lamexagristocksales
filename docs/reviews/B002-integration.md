# Integration Review — B002

**Reviewer:** Fresh agent session
**Date:** 2026-04-01
**Batch:** docs/batches/B002-pending-request-badge.md

## Critical (must fix before merge)

None.

## Important (should fix, can be next batch)

- **`app/admin/tools/layout.tsx`, `app/review/layout.tsx`, `app/admin/email/layout.tsx`, `app/admin/discount/layout.tsx`, `app/admin/agent/layout.tsx`** — These 5 layout files all render a "Requests" nav link via `AdminHeader` but were NOT updated with the pending count badge. Only `app/admin/requests/layout.tsx` and `app/qa/(protected)/layout.tsx` received the badge. This means a user on the Import Review page, Email page, Discount page, Tools page, or Agent page will see a plain "Requests" label with no count, but navigating to the QA portal or Requests page will show the badge. The batch doc (`docs/batches/B002-pending-request-badge.md`, lines 55-57) only specified two files to touch, so the implementation matches the spec — but the spec missed the other 5 layouts. The `AdminHeader` component is shared across all 7 layouts, and the badge infrastructure is already in place (the `badge` prop on `NavLink`). Each missing layout needs: (1) import `getPendingRequestCount` from `lib/document-requests`, (2) call it, (3) pass `badge: pendingCount` on the Requests link. This is a 2-line change per file. The inconsistency is confusing for users who expect the badge to appear site-wide. Should be addressed before merge or immediately after.

## Minor (nice to have)

- **`components/AdminHeader.tsx` line 59** — The badge guard uses `link.badge != null && link.badge > 0`. The `!= null` check is redundant when combined with `> 0` since `undefined > 0` is `false` and `null > 0` is `false` in JavaScript. However, the explicit null check makes intent clearer and is a common defensive pattern. Not a bug; just a style observation. No change needed.

- **`components/AdminHeader.tsx` line 60** — The badge styling (`bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full`) is a scaled-down version of the badge on `app/admin/requests/page.tsx` line 21 (`bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1.5 rounded-full`). Same colour scheme, smaller text and padding for the nav context. This is the correct approach — consistent colour language, appropriate sizing for location. The requests page badge also appends the word "pending" while the nav badge shows only the number. Good differentiation.

- **Nav link arrays are duplicated across 7 layout files.** Each layout independently defines its `navLinks` array with largely the same entries. This is pre-existing duplication not introduced by B002, but B002 makes it more visible: the badge needs to be wired in 7 places rather than 1. A future refactor could extract a shared `getNavLinks(role, pendingCount)` helper or a `nav-links.ts` config. Not a B002 concern, but worth noting for future batch planning.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A: B002 adds no new data storage. The badge count is computed live from `document_requests` (which is preserved across syncs, per Architecture.md line 97).
- [x] New tables/columns added to the "preserved during sync" path — N/A: No schema changes. Uses existing `document_requests` table.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A: No schema changes.
- [x] No assumptions about lot ID stability — Confirmed. `getPendingRequestCount()` counts rows by `status = 'pending'` with no lot ID reference.

## Future Batch Readiness

- **B003 (QA Panel Doc Actions):** Ready. B003 targets `QADashboardClient.tsx` and adds a `DELETE /api/documents/[id]` route. B002 touched layout files and `AdminHeader.tsx` — no overlap. The nav link duplication noted above is irrelevant to B003's scope.
- **Overall foundation:** Solid. The `AdminHeader` `badge` prop is a clean, reusable extension point. Any future nav badge (e.g., unresolved enquiries count for E4) can use the same mechanism by passing `badge` on the relevant link in the navLinks array. The pattern of calling a synchronous `getDb()` function in a server-component layout is consistent with the project's architecture (server components access SQLite directly, per Architecture.md lines 186-192).

## Doc Updates Needed

- [ ] CLAUDE.md: Update Batch Queue table — B002 status should change from `ready` to `done` (or `in-review`). B001 status should also be updated (still showing `ready` per B001 integration review finding).
- [ ] Architecture.md: No changes needed. The document request queue is already listed in the surface-to-role mapping table (line 48). The badge is a UI enhancement with no architectural impact.
- [ ] LESSONS.md: New lesson candidate — "Nav link arrays are duplicated across 7 layout files. When adding a cross-cutting nav feature (badge, new link, rename), all 7 files must be updated: `app/qa/(protected)/layout.tsx`, `app/admin/requests/layout.tsx`, `app/admin/tools/layout.tsx`, `app/review/layout.tsx`, `app/admin/email/layout.tsx`, `app/admin/discount/layout.tsx`, `app/admin/agent/layout.tsx`." This would prevent future batches from making the same incomplete-coverage mistake.
