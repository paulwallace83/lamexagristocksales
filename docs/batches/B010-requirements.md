# B010 — Requirements Checklist

## Functional

### Schema & Data Layer
- [ ] `coa_data` table has `review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected'))` column
- [ ] `coa_data` table has `reviewed_at TEXT` column
- [ ] `coa_data` table has `reviewed_by TEXT` column
- [ ] Migration sets existing rows to `review_status = 'approved'` (grandfather clause)
- [ ] `CoaData` type includes `reviewStatus: CoaReviewStatus`
- [ ] `getCoaDataForLots()` returns `reviewStatus` in each entry
- [ ] `upsertCoaData()` accepts optional 4th param `reviewStatus` (default `'pending'`)
- [ ] `upsertCoaData()` does not downgrade `approved` → `pending` when re-extracting for a lot that was already approved
- [ ] `reviewCoaData(lotId, action, reviewedBy)` updates `review_status`, `reviewed_at`, `reviewed_by`
- [ ] `getCoaReviewQueue(productId?)` returns pending + rejected rows with lot/product info

### Sync Preservation
- [ ] `ExportedCoaRow` includes `reviewStatus`, `reviewedAt`, `reviewedBy`
- [ ] `exportCoaData()` SELECTs the 3 review columns
- [ ] `relinkCoaData()` INSERTs the 3 review columns when re-linking after sync
- [ ] Review status round-trips through a full export → delete lots → re-seed → relink cycle

### Public Display Gating
- [ ] Product detail page shows COA pills only when `reviewStatus === 'approved'`
- [ ] Product detail page shows COA-derived test badges (heavy metal, pesticide) only when `reviewStatus === 'approved'`
- [ ] Document-based test badges (from uploaded test-result files) remain visible regardless of review status
- [ ] AI caveat disclaimer only appears when pills are shown (i.e., approved data)
- [ ] Product pages with no COA data or only pending data display identically to pre-B010 "no COA" state

### Extraction Sources
- [ ] Auto-extract (upload route) writes `review_status = 'pending'`
- [ ] `backfill_coa_data` agent tool writes `review_status = 'pending'`
- [ ] `save_coa_data` agent tool writes `review_status = 'approved'`

### API Route — `/api/coa-review`
- [ ] `GET /api/coa-review?productId=xxx` returns per-lot COA data with formatted fields, review status, updatedBy, updatedAt
- [ ] `POST /api/coa-review` accepts `{ lotIds: number[], action: 'approve' | 'reject' }` and updates all specified lots
- [ ] POST returns count of updated lots
- [ ] Both `qa` and `reviewer` roles are authorized
- [ ] Unauthenticated requests return 404 (not 401/403)
- [ ] Invalid `action` value returns 400
- [ ] Empty `lotIds` array returns 400

### QA Dashboard — Lot Pills
- [ ] Lots with `review_status = 'pending'` show amber pill (`bg-amber-50 text-amber-700 border-amber-200`) with ⏳
- [ ] Lots with `review_status = 'approved'` show green pill with ✓ (existing behavior)
- [ ] Lots with `review_status = 'rejected'` show red pill with ✗ (same as no COA — but lot still has COA doc)
- [ ] Lots with no COA data show red pill with ✗ (existing behavior, unchanged)

### QA Dashboard — Filter
- [ ] New "Pending Review" filter option added alongside existing All / Missing / Partial / Complete
- [ ] "Pending Review" filter shows only products where `pendingCoaReviewCount > 0`
- [ ] Count of pending products shown in filter label (e.g., "Pending Review (3)")

### QA Dashboard — Review Panel
- [ ] Expanding a product row shows a "COA Extraction Review" section below the documents panel
- [ ] Review section fetches `GET /api/coa-review?productId=xxx` on panel open
- [ ] Loading spinner shown while fetching
- [ ] Each lot with pending/rejected COA data shows: lot number, extracted field pills, review status badge, Approve button, Reject button
- [ ] Approve button calls `POST /api/coa-review` with `action: 'approve'` for that lot
- [ ] Reject button calls `POST /api/coa-review` with `action: 'reject'` for that lot
- [ ] "Approve All" button approves all pending lots for the product in one call
- [ ] UI updates optimistically on approve/reject; refreshes doc status on success
- [ ] Error state shown if API call fails

### Agent Tool — `review_coa_data`
- [ ] Tool definition: `{ productId: string, lotNumbers?: string[], action: 'approve' | 'reject' }`
- [ ] When `lotNumbers` omitted, reviews all pending lots for the product
- [ ] Returns summary: lots reviewed count, lots not found count, action taken
- [ ] Both `qa` and `reviewer` roles can call this tool (NOT in `REVIEWER_ONLY_TOOLS`)
- [ ] System prompt includes guidance on COA review workflow

---

## Error Handling

- [ ] `reviewCoaData()` returns false (not throws) for non-existent lot ID
- [ ] `POST /api/coa-review` with non-existent lot IDs succeeds for valid IDs, reports skipped count
- [ ] `GET /api/coa-review` with non-existent `productId` returns empty array (not error)
- [ ] `review_coa_data` agent tool with invalid product ID returns descriptive error message
- [ ] `review_coa_data` agent tool with lot numbers not found returns partial success + list of not-found lots
- [ ] Migration failure (e.g., column already exists) handled gracefully — `PRAGMA table_info` check prevents double-add

---

## Edge Cases

- [ ] Product with 0 lots: `getCoaReviewQueue()` returns empty, dashboard shows no review section
- [ ] Lot with COA document but no extracted data (extraction failed): no review needed — lot pill stays red (no COA data)
- [ ] Lot approved → new COA uploaded → re-extracted: `upsertCoaData` does NOT downgrade from `approved` to `pending` (preserves prior approval since the lot already has verified data — QA can re-review if the new extraction differs)
- [ ] Lot rejected → `save_coa_data` (manual correction): status set to `approved` (human-verified override)
- [ ] Weekly sync with pending COA data: review status preserved through export/relink cycle
- [ ] Lot removed from inventory after sync: orphaned `coa_data` row cleaned up by normal sync process (CASCADE or re-link miss)
- [ ] Concurrent approve/reject calls for same lot: last-write-wins (SQLite serialized writes, no conflict)
- [ ] Dashboard with 50+ pending products: filter shows all, no pagination needed (product count is bounded by inventory size)

---

## Tests

### Happy Path
- [ ] Auto-extract creates `coa_data` row with `review_status = 'pending'`
- [ ] `save_coa_data` creates row with `review_status = 'approved'`
- [ ] `reviewCoaData(lotId, 'approve', 'user@test.com')` sets status to `approved`, sets `reviewed_at` and `reviewed_by`
- [ ] `reviewCoaData(lotId, 'reject', 'user@test.com')` sets status to `rejected`
- [ ] `getCoaReviewQueue()` returns only pending + rejected rows
- [ ] `getCoaReviewQueue(productId)` filters to specific product
- [ ] `getCoaDataForLots()` includes `reviewStatus` in returned data
- [ ] Export → relink preserves `review_status`, `reviewed_at`, `reviewed_by`

### Error Cases
- [ ] `reviewCoaData()` with non-existent lot returns false
- [ ] `getCoaReviewQueue()` with no pending data returns empty array
- [ ] `upsertCoaData()` with invalid review status: caught by CHECK constraint (test that DB throws)

### Edge Cases
- [ ] `upsertCoaData()` on already-approved lot with `pending` status: status remains `approved`
- [ ] `upsertCoaData()` on already-approved lot with `approved` status: status stays `approved`, `updated_at` changes
- [ ] `formatCoaFields()` behavior unchanged (existing tests still pass — review status doesn't affect formatting)
- [ ] `detectCoaTestTypes()` behavior unchanged (existing tests still pass)
