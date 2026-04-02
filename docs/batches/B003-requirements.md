# B003 Requirements — QA Dashboard: Delete & Upload from Expanded Panel

**Batch:** B003
**Created:** 2026-04-02

---

## Delete functionality

- [ ] **DEL-1:** Each document in the expanded panel shows a delete icon/button (red, positioned after the document link)
- [ ] **DEL-2:** Clicking delete shows a browser confirmation dialog: "Delete {originalName}? This cannot be undone."
- [ ] **DEL-3:** On confirm, sends `DELETE /api/documents/{productId}?documentId=X&filename=Y&category=Z&lotId=Z` (or `&baseContract=Z` for contract-level docs)
- [ ] **DEL-4:** On successful delete, the panel refreshes to show updated document list without full page reload
- [ ] **DEL-5:** During delete, the button shows a loading/disabled state to prevent double-click
- [ ] **DEL-6:** On delete failure, an inline error message is shown (not a silent failure)

## Upload functionality

- [ ] **UPL-1:** Each category section in the expanded panel shows an "Upload" button (even categories with no existing documents)
- [ ] **UPL-2:** All 5 category sections render in the panel (COA, Test Results, Specs, Labels, Photos) — empty categories show header + upload button only
- [ ] **UPL-3:** Clicking "Upload" toggles an inline form below the category header
- [ ] **UPL-4:** Lot-level form (COA, test-results): shows checkboxes for each lot (lot number + BBD). At least one lot must be selected before file picker is enabled.
- [ ] **UPL-5:** Contract-level form (specs, labels, photos): shows a dropdown of base contracts derived from lot data. Auto-selected if only one contract exists.
- [ ] **UPL-6:** File input accepts PDF and image files only (PDF, JPEG, PNG, GIF, WebP)
- [ ] **UPL-7:** On submit, sends `POST /api/upload` with FormData (`file`, `productId`, `category`, `lotIds` or `baseContract`)
- [ ] **UPL-8:** On successful upload, the panel refreshes to show the new document without full page reload
- [ ] **UPL-9:** During upload, the submit button shows a loading state and is disabled
- [ ] **UPL-10:** On upload failure, an inline error message is shown with the server's error text

## Auth & security

- [ ] **SEC-1:** GET `/api/documents/{productId}` returns 404 (not 401) for unauthenticated/unauthorized requests
- [ ] **SEC-2:** DELETE `/api/documents/{productId}` returns 404 (not 401) for unauthenticated/unauthorized requests
- [ ] **SEC-3:** Only `qa` or `reviewer` roles can delete documents (enforced server-side, unchanged)
- [ ] **SEC-4:** Only `qa` or `reviewer` roles can upload documents (enforced server-side by existing `POST /api/upload`, unchanged)

## Type safety & build

- [ ] **TSC-1:** `npx tsc --noEmit` passes with zero errors
- [ ] **TSC-2:** No `any` types introduced — all new state and props are properly typed

## Edge cases

- [ ] **EDGE-1:** Expanding a product with zero documents shows all 5 category sections with upload buttons and "No documents" text
- [ ] **EDGE-2:** Deleting the last document in a category still shows the category section with its upload button
- [ ] **EDGE-3:** Upload form for lot-level docs disables submit when no lots are selected
- [ ] **EDGE-4:** Product with a single base contract auto-selects it in contract-level upload form
- [ ] **EDGE-5:** After delete + re-expand, cache is invalidated and fresh data is fetched

## Out of scope (confirmed)

- Drag-and-drop upload
- Bulk delete / bulk upload
- COA re-extraction after replacement upload
- Custom modal (using `window.confirm()` instead)
- Physical file deletion changes (keeping existing behavior)
- Creating a new API route (using existing DELETE handler)
