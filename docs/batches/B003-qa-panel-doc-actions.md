# B003 — QA Dashboard: Delete & Upload from Expanded Panel

**Epic:** E3 — QA Workflow: Document Management Improvements
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Goal

QA can delete a document and upload a replacement directly from the expanded product panel on the QA dashboard (`/qa`), without navigating away to `/qa/upload/[id]`. Reduces the number of clicks for the most common QA task: replacing a bad COA or adding a missing document.

---

## Background

The QA dashboard is at `app/qa/(protected)/page.tsx` with client component `QADashboardClient.tsx`. When a product row is expanded, it loads documents from `/api/documents/[productId]` and renders them grouped by category (COA, Test Results, Specs, Labels, Photos). Currently this panel is **read-only** — documents show as clickable links that open in a new tab. There is no delete button or inline upload.

Document deletion requires:
1. Removing the row from the `documents` table
2. Removing associated `document_lots` rows (FK cascade should handle this)
3. Optionally removing the file from disk (or leaving it as an orphan — safer for now)

Document upload already has a working API at `POST /api/upload` used by `/qa/upload/[id]`. The same endpoint can be called from the expanded panel with a file input.

---

## Scope

### In scope
- Delete button on each document in the expanded panel
- Confirmation dialog before delete ("Delete {filename}? This cannot be undone.")
- `DELETE /api/documents/[id]` route handler — deletes DB row, returns success. Does NOT delete the file from disk (safe default; orphaned files are cleaned during rename-uploads runs).
- Inline upload button per category section in the expanded panel (e.g., "Upload COA" under the COA group)
- Upload calls existing `POST /api/upload` endpoint
- Panel refreshes its document list after delete or upload without full page reload
- Auth check on delete endpoint: requires `qa` or `reviewer` role

### Out of scope
- Deleting the physical file from disk (deferred — requires audit trail)
- Drag-and-drop upload in the panel (existing page at `/qa/upload/[id]` has this; panel gets a simple file input)
- Bulk delete / bulk upload
- COA re-extraction after replacement upload (user can trigger backfill separately)
- Filter by supplier or doc status on QA dashboard (separate batch)

---

## Acceptance Criteria

1. Each document in the expanded panel shows a delete icon/button.
2. Clicking delete shows a confirmation dialog with the document filename.
3. Confirming delete calls `DELETE /api/documents/[id]` and removes the document from the panel without page reload.
4. Unauthenticated or unauthorized delete requests return 404 (not 403 — per security rules, never reveal resource existence).
5. Each category section in the expanded panel shows an "Upload" button.
6. Clicking upload opens a file picker. Selected file is uploaded via `POST /api/upload` with the correct `productId` and `category`.
7. After successful upload, the document list in the panel refreshes to show the new file.
8. Delete endpoint is auth-guarded: only `qa` or `reviewer` roles can delete.
9. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `app/api/documents/[id]/route.ts` | New file — `DELETE` handler. Auth check, delete from `documents` table, return 200. |
| `app/qa/(protected)/QADashboardClient.tsx` | Add delete button + confirmation per document. Add upload button per category. Refresh panel state after either action. |

**Do not modify:**
- `POST /api/upload/route.ts` — reuse as-is
- `lib/documents.ts` — add a `deleteDocument(id)` function if one doesn't exist, but do not change existing functions
- `app/qa/(protected)/page.tsx` — server component, no changes needed

---

## Test Plan

No unit tests for UI components (these are client components with fetch calls). Verify:

1. Expand a product on `/qa` that has at least one document
2. Click delete on a document → confirm → document disappears from panel
3. Refresh page → document is gone (not just hidden client-side)
4. Click upload under a category → pick a file → file appears in panel after upload
5. Open an incognito window (unauthenticated) → call `DELETE /api/documents/1` → returns 404
6. Verify `coa_data` rows for the deleted document's lots are NOT removed (COA data is independent of the document record)

---

## Definition of Done

- [ ] Delete button renders on each document in expanded panel
- [ ] Confirmation dialog prevents accidental deletes
- [ ] `DELETE /api/documents/[id]` route works with auth guard
- [ ] Upload button per category section in expanded panel
- [ ] Panel refreshes after delete and upload
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
