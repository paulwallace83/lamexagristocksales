# Retrospective — B003

## Summary

The implementation is clean and functional — two files modified, no new files, no new dependencies. The auth fix and the `DocumentsPanel` rewrite are straightforward and leverage existing API endpoints. The main concern is a UX gap: dashboard-level status badges and coverage counts are server-rendered and do not update after inline delete/upload without a full page reload. This is not a correctness issue (the database is accurate), but it is visible to QA users.

## File-by-File Review

### app/api/documents/[productId]/route.ts
- **Confidence:** 9/10
- **Uncertainties:** None for the changes made (two 401→404 swaps). The existing DELETE handler's `lotId` query param is a misnomer — it actually receives a lot *number* (the file system directories use lot numbers, not IDs). This pre-existing inconsistency is not introduced by B003 but the new client code now depends on it. If someone later "fixes" the param name to `lotNumber`, the client code would break.
- **Suggested Refactoring:** Rename the `lotId` query parameter to `lotNumber` across both the route handler and client code to match what it actually represents. Not urgent since it works correctly, but prevents future confusion.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None for the changes made.

### app/qa/(protected)/QADashboardClient.tsx
- **Confidence:** 7/10
- **Uncertainties:**
  1. **Base contract extraction logic (lines 299-301):** Client-side extraction originally used `lastIndexOf("-")` but the server-side `extractBaseContract()` in `lib/inventory.ts` uses `indexOf("-")` (first hyphen). **Fixed during retro** — changed to `indexOf("-")` to match. For standard `XXXXXX-YY` contracts the result was identical, but contracts with multiple hyphens would have diverged.
  2. **Dashboard status counts stale after actions:** After a delete or upload, the `statuses` prop from the server component is not refreshed. The coverage badges (e.g., "3/14"), status labels ("Partial"/"Complete"/"Missing"), and filter counts in the top bar all remain stale until a full page reload. A user who deletes the last document in a category will still see "Partial" status until they reload. This is a visible UX gap.
  3. **No loading indicator during refresh:** After delete/upload, `onRefresh()` fetches fresh data but no spinner or loading state is shown. The panel briefly displays stale data until the fetch completes. For fast networks this is imperceptible, but on slow connections the deleted document may linger for a moment.
- **Suggested Refactoring:**
  1. Verify `extractBaseContract()` logic matches — or import the function in a shared utility that both server and client can use. Alternatively, pass base contracts from the server component via `ProductDocStatus`.
  2. After delete/upload, could call `router.refresh()` (from `next/navigation`) to re-render the server component and update all status counts. This is a more complete solution but adds a full RSC re-render.
  3. Add a brief loading shimmer to the documents panel during refresh.
- **Shortcuts Taken:**
  - `window.confirm()` instead of a custom modal (per batch spec — intentional).
  - Client-side base contract extraction rather than receiving from server.
  - Single `error` state shared across all categories (works because it's cleared on new actions, but could theoretically show a stale error from a different category).
- **Unhandled Edge Cases:**
  - Product with zero lots: the lot-level upload form shows an empty lot picker with no checkboxes. Submit is disabled (correct), but the empty state could be confusing. In practice all products have lots.
  - Product with zero contracts (lots have no contract references): `baseContracts` will be empty. Clicking "+ Upload" on a contract-level category will show only the file input + submit. Submitting will trigger `setError("No contracts available")`. This is handled but the UX could be improved (e.g., hide the upload button for contract-level categories when there are no contracts).

## Lamex-Specific Checks

| Check | Status | Notes |
|-------|--------|-------|
| **Sync survival** | Pass | No new server-side data storage. Delete and upload both use existing handlers that store lot numbers (not IDs) for re-linking. |
| **Data privacy** | Pass | No customer names, pricing, or sensitive ERP fields exposed. Document filenames and lot numbers are expected to be visible to QA users. |
| **Client/server boundary** | Pass | No `better-sqlite3` or `lib/db` imports in client code. All DB operations via fetch to API routes. |
| **Path safety** | Pass | Delete params go through `URLSearchParams` → existing route sanitizes with `safePath()` + `resolve().startsWith()` guard. Upload uses `FormData` to existing upload API with server-side validation. |

## Items Needing Immediate Attention

None — the base contract extraction mismatch was the only item and was fixed during the retro (changed `lastIndexOf` → `indexOf` to match server-side `extractBaseContract()`).

## Items for Future Batches

1. **Stale status counts after inline actions:** After delete/upload, the dashboard status badges and filter counts don't update without a full page reload. Consider calling `router.refresh()` or lifting status state to allow client-side updates. Low severity (data is correct in DB, just UI is stale).
2. **`lotId` → `lotNumber` rename in DELETE handler:** The query param `lotId` actually carries a lot number. Rename for clarity to prevent future confusion.
3. **Hide contract-level upload when no contracts exist:** Minor UX polish — currently shows error on submit rather than preventing the attempt.
4. **Loading indicator during panel refresh:** Brief shimmer or spinner while re-fetching docs after delete/upload.

## LESSONS.md Candidates

1. **Base contract extraction is duplicated client-side:** `extractBaseContract()` exists in `lib/inventory.ts` (server-only) but cannot be imported in `"use client"` components. The client-side DocumentsPanel reimplements the logic. If the extraction logic changes, both locations must be updated. Consider extracting to a shared utility file that doesn't import server-only modules.
2. **DELETE handler's `lotId` param is actually a lot number:** The existing `DELETE /api/documents/[productId]` route uses a query param called `lotId` to construct the file path, but the directory structure uses lot *numbers*. The param must receive the lot number string, not a numeric lot ID. This naming inconsistency predates B003 but now has a client-side dependency in `QADashboardClient.tsx`.
