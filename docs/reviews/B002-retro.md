# Retrospective — B002

## Summary
Very small, clean batch. Three files changed with ~10 lines of new code total. Extended an existing shared component with an optional property and wired two layout files to an existing DB function. No new dependencies, no new patterns, no risk surface.

## File-by-File Review

### components/AdminHeader.tsx
- **Confidence:** 10/10
- **Uncertainties:** None. The `badge` prop is optional — all 7 existing consumers continue to work without passing it.
- **Suggested Refactoring:** None needed. If future badges need different colours per-link, the interface could accept a `badgeClass` string, but that's speculative and not worth adding now.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** Negative badge values would render (e.g., `badge: -1`). Not a real concern since `getPendingRequestCount()` returns a SQL `COUNT(*)` which is always >= 0. The `> 0` guard handles zero correctly.

### app/admin/requests/layout.tsx
- **Confidence:** 10/10
- **Uncertainties:** None. This is a server component that already calls `await auth()`. Adding a synchronous `getPendingRequestCount()` call (better-sqlite3) is safe and consistent with how `app/admin/requests/page.tsx` already uses it.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None. The existing function handles empty tables gracefully (returns 0).

### app/qa/(protected)/layout.tsx
- **Confidence:** 10/10
- **Uncertainties:** None. Identical pattern to the requests layout above.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None.

### docs/batches/B002-requirements.md
- **Confidence:** 10/10
- **Uncertainties:** None — documentation file.
- **Suggested Refactoring:** N/A.
- **Shortcuts Taken:** N/A.
- **Unhandled Edge Cases:** N/A.

## Lamex-Specific Checks
- **Sync survival:** No new data model. `document_requests` table is preserved across syncs. Badge count is computed live, not stored.
- **Data privacy:** Badge only shows a number (count of pending requests). No customer names, pricing, or sensitive fields exposed.
- **Client/server boundary:** Both layouts are server components. `getPendingRequestCount()` calls `getDb()` (better-sqlite3) — safe because it runs server-side only. `AdminHeader` is a regular component rendered by server component parents — no client-side DB import.
- **Path safety:** No filesystem operations introduced.

## Items Needing Immediate Attention
None. All files rated 10/10.

## Items for Future Batches
- The amber pill on a dark navy header may have contrast concerns on some screens. Worth a visual check in production lighting conditions, but not a blocker.
- If more nav badges are needed in future (e.g., unresolved enquiries), the `badge` prop is already reusable.

## LESSONS.md Candidates
None — no new patterns, mistakes, or non-obvious decisions emerged from this batch.
