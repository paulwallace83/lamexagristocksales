# Retrospective — B010

## Summary

Solid batch with clean architecture. The review status model integrates naturally into the existing data layer — the upsert CASE logic, sync export/relink, and public display gating all work correctly and are covered by 16 new SQLite-backed tests. The QA dashboard UI is functional but has two areas that warrant attention: the `onReviewed` callback triggers a full page reload rather than a surgical state refresh, and the `POST /api/coa-review` route accepts lot IDs directly (integers) without verifying that the requesting user has access to the product those lots belong to.

## Acceptance Criteria Status

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Auto-extracted COA data created with `review_status = 'pending'` | PASS | Default in `upsertCoaData()` and verified in test |
| 2 | Backfilled COA data created with `review_status = 'pending'` | PASS | 3 callers (agent tool, API route, CLI script) all omit 4th arg → default `'pending'` |
| 3 | Manually saved COA data created with `review_status = 'approved'` | PASS | `save_coa_data` case explicitly passes `"approved"` |
| 4 | Public product page shows pills only when `approved` | PASS | `coaApproved` gate in `LotRow` |
| 5 | Document-based test badges remain visible regardless | PASS | `testDocs` filtering is independent of `coaApproved` |
| 6 | Existing rows migrated to `approved` | PASS | ALTER TABLE default is `'approved'`; CREATE TABLE default is `'pending'` |
| 7 | QA dashboard amber lot pills for pending | PASS | `pendingReview` conditional in lot map |
| 8 | QA dashboard "Pending Review" filter | PASS | Count + filter logic in place |
| 9 | QA expanded panel shows extracted fields + Approve/Reject | PASS | `CoaReviewPanel` component |
| 10 | POST `/api/coa-review` updates review status | PASS | Calls `reviewCoaData()` per lot |
| 11 | GET `/api/coa-review` returns COA data with review status | PASS | Formats fields server-side via `formatCoaFields()` |
| 12 | Both `qa` and `reviewer` roles can approve/reject | PASS | Auth check allows both |
| 13 | Unauthenticated → 404 (not 403) | PASS | Matches existing pattern |
| 14 | `review_coa_data` agent tool | PASS | Full implementation with lot filtering |
| 15 | Review status survives weekly sync | PASS | `exportCoaData()` + `relinkCoaData()` include 3 new columns; round-trip test passes |
| 16 | `npm test` passes | PASS | 151/151 |
| 17 | `npx tsc --noEmit` clean | PASS | |

## File-by-File Review

### lib/db.ts
- **Confidence:** 9/10
- **Uncertainties:** SQLite's behavior with `CHECK` constraint on `ALTER TABLE ADD COLUMN` is non-standard — it works in SQLite 3.25+ but earlier versions silently ignore it. Railway uses a modern SQLite so this is fine in practice.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** If `coa_data` table doesn't exist yet (fresh DB), `coaInfo.length` is 0 and the migration is skipped — correct, because `CREATE TABLE` in `SCHEMA_SQL` already has the columns.
- **Sync survival:** N/A — schema only.
- **Data privacy:** No.
- **Client/server boundary:** Server only. OK.

### lib/coa-data.ts
- **Confidence:** 9/10
- **Uncertainties:** The `CASE WHEN excluded.review_status = 'pending'` logic in `upsertCoaData()` correctly prevents downgrade but has a subtle implication: if the lot was `rejected` and a re-extraction fires, the status remains `rejected` (not re-set to `pending`). This is actually desirable — a rejected lot stays rejected until explicitly re-approved — but it's not called out in the requirements.
- **Suggested Refactoring:** `getCoaReviewQueue()` has duplicated type annotations for the two branches (with/without productId). Could extract the type alias.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** `reviewCoaData()` will happily "approve" a lot that is already approved (no-op but returns `true`). Not harmful but imprecise.
- **Sync survival:** Uses lot numbers for export/relink. Correct.
- **Data privacy:** No customer data flows through these functions.
- **Client/server boundary:** Imports `getDb()` — server only. OK.

### app/api/upload/route.ts
- **Confidence:** 10/10
- **Uncertainties:** None. No code changed — the default parameter in `upsertCoaData()` handles the `pending` status automatically.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None new.

### app/product/[id]/page.tsx
- **Confidence:** 10/10
- **Uncertainties:** None. Clean two-line change with clear semantics.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None.

### lib/documents.ts
- **Confidence:** 8/10
- **Uncertainties:** The `SELECT lot_id, review_status FROM coa_data` query fetches ALL coa_data rows on every `getDocumentStatus()` call. For the current inventory size (dozens of products, hundreds of lots) this is negligible. For thousands of lots it would be better to limit to the lot IDs present in the current inventory.
- **Suggested Refactoring:** Could join against `lots` to only fetch relevant rows, but premature optimization at current scale.
- **Shortcuts Taken:** Fetches all rows instead of filtering to relevant lots. Accepted for simplicity.
- **Unhandled Edge Cases:** If `coa_data` contains orphaned rows (lot_id pointing to a deleted lot), they're harmlessly ignored because the lot ID won't match any product's lots.
- **Sync survival:** The query runs at render time against current lot IDs. OK.
- **Data privacy:** No sensitive fields exposed.
- **Client/server boundary:** Server only. OK.

### app/api/coa-review/route.ts
- **Confidence:** 8/10
- **Uncertainties:** **The POST endpoint accepts raw `lotIds` (integers) and operates on them without verifying that the lots belong to any particular product.** A malicious authenticated user could approve/reject lots for any product. This is low-risk because both `qa` and `reviewer` are trusted internal users, and the only action is changing `review_status` (no data deletion or modification). But it deviates from the pattern of product-scoped operations.
- **Suggested Refactoring:** Add a `productId` param to POST and verify that each lot belongs to that product before reviewing. This bounds the blast radius.
- **Shortcuts Taken:** No Zod validation — uses manual type checks. Consistent with all other routes in the project, but noted.
- **Unhandled Edge Cases:** Very large `lotIds` array (100k+) would be slow in the loop. Could add a cap (e.g., 500). Unlikely in practice.
- **Data privacy:** No customer/pricing data. OK.
- **Client/server boundary:** Server only. OK.
- **Path safety:** No filesystem operations. OK.

### app/qa/(protected)/QADashboardClient.tsx
- **Confidence:** 7/10
- **Uncertainties:**
  1. **`onReviewed` calls `window.location.reload()`** — this is a heavy-handed refresh. The page is server-rendered, so `router.refresh()` from `next/navigation` would be the right way to do this. However, `QADashboardClient` receives `statuses` as a prop from the server component, and there's no current mechanism to re-fetch just the statuses without a full page reload. The reload works correctly but flashes.
  2. **The `CoaReviewPanel` uses `React.useEffect` with `load` in the dep array.** The `load` function is memoized via `useCallback` with `productId` as dependency, so this is stable. But the eslint-plugin-react-hooks exhaustive-deps rule (if enabled) might flag it. Not a bug.
  3. **Pending count mismatch:** The `pendingCount` prop comes from server-rendered data. After an approve action, the local `items` state is optimistically updated but `pendingCount` in the heading text stays stale until reload. Minor UX inconsistency.
- **Suggested Refactoring:** Use `useRouter().refresh()` instead of `window.location.reload()` for seamless server-component re-render.
- **Shortcuts Taken:** Full page reload instead of surgical state refresh. Accepted since existing patterns in the codebase (e.g., `refreshDocs`) work the same way for doc operations.
- **Unhandled Edge Cases:** If the user expands two products in rapid succession, the second expansion triggers `setExpandedProductId(null)` on the first click then immediately sets to the new product — this is an existing pattern, not introduced by B010.
- **Data privacy:** No customer data. OK.
- **Client/server boundary:** Client component correctly. No DB imports. OK.

### lib/agent-tools.ts
- **Confidence:** 9/10
- **Uncertainties:** The `review_coa_data` tool uses `agent:${uploaderEmail}` as the `reviewedBy` value. This is a new convention — all other `updatedBy` values use simple labels like `"agent"`, `"auto-extract"`, `"backfill"`. The colon-prefixed format is informative but inconsistent.
- **Suggested Refactoring:** Either standardize all `updatedBy`/`reviewedBy` to include the email, or use plain `uploaderEmail` here (without the `agent:` prefix). Not urgent.
- **Shortcuts Taken:** The tool is not added to `REVIEWER_ONLY_TOOLS` per the design decision that both roles can review. Correct.
- **Unhandled Edge Cases:** If `lotNumbers` contains duplicates, the same lot would be reviewed twice (harmless — idempotent UPDATE). If `lotNumbers` contains lot numbers that exist on other products, they're filtered out by `getCoaReviewQueue(productId)`.
- **Data privacy:** Product names appear in the returned `message`. Product names are NOT confidential (they're on the public site). OK.
- **Client/server boundary:** Server only. OK.

### app/api/agent/chat/route.ts
- **Confidence:** 10/10
- **Uncertainties:** None. Two text changes to the system prompt.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None.

### tests/coa-data.test.ts
- **Confidence:** 9/10
- **Uncertainties:** The in-memory SQLite database used in tests has a simpler schema than the real DB (e.g., `lots` table is missing `quantity`, `weight_lbs`, `bbd` columns). This is fine because the COA functions only need `lot_id`, `lot_number`, and the listing/product join.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** Each `beforeEach` creates a fresh `:memory:` DB. This is slightly slower than a `BEGIN/ROLLBACK` pattern but cleaner and only adds ~5ms per test.
- **Unhandled Edge Cases:** No test for the POST `/api/coa-review` route (would require Next.js route handler testing setup). Covered by manual testing.

### Documentation files (agent_docs/coa-data.md, CLAUDE.md, docs/epics.md, docs/roadmap.md, agent_docs/db-schema.md)
- **Confidence:** 10/10
- **Uncertainties:** None.
- **Shortcuts Taken:** None.

## Cross-Cutting Concerns

- **Error handling:** All API routes return appropriate status codes (400 for validation, 404 for auth). Server-side errors are caught and returned as generic messages. Stack traces are not exposed. The `CoaReviewPanel` shows error state to the user. OK.
- **Loading & empty states:** `CoaReviewPanel` has loading spinner, error state, and returns null when no items. The "Pending Review" filter shows the standard "No products match this filter" empty state. OK.
- **Auth & roles:** `/api/coa-review` allows both `qa` and `reviewer`. Returns 404 for unauthenticated. Matches Architecture.md permissions table for QA portal access. Agent tool is not in `REVIEWER_ONLY_TOOLS`. OK.
- **Audit logging:** No audit log table exists in this project (noted in Architecture.md as debt). The `reviewed_by` and `reviewed_at` columns serve as an implicit audit trail. Consistent with existing patterns.
- **Validation:** Manual validation (not Zod) consistent with all other routes. POST body validation covers: JSON parse errors, non-object bodies, invalid action values, empty/missing lotIds.
- **TypeScript:** No `any` types introduced. All new types are properly defined. `as never` used only in test mocks (standard vitest pattern). `as "approve" | "reject"` cast in agent tool is safe because the guard above ensures the value.

## Items Needing Immediate Attention

1. ~~**QADashboardClient.tsx (confidence 7/10) — `window.location.reload()` in `onReviewed`**~~ **FIXED** during retro. Changed to `useRouter().refresh()` from `next/navigation` for seamless server-component re-render without page flash.

## Items for Future Batches

| # | File | Item | Severity |
|---|------|------|----------|
| 1 | `app/api/coa-review/route.ts` | POST could accept a `productId` param and verify lots belong to that product before reviewing. Low risk since users are authenticated internal staff. | Minor |
| 2 | `app/qa/(protected)/QADashboardClient.tsx` | `pendingCount` in the review panel heading text becomes stale after optimistic approve — shows original count until reload. | Minor |
| 3 | `lib/agent-tools.ts` | `reviewedBy` uses `agent:${uploaderEmail}` format — inconsistent with other `updatedBy` values that use plain labels. | Minor |
| 4 | `lib/documents.ts` | `getDocumentStatus()` fetches all `coa_data` rows unconditionally. At scale, should join against `lots` to scope the query. | Minor |
| 5 | `app/api/coa-review/route.ts` | No upper bound on `lotIds` array length. Could add a cap (e.g., 500) to prevent abuse. | Minor |

## Lessons Learned

### `upsertCoaData` re-extraction must not downgrade review status
**What happened:** When a COA is re-extracted (via backfill or re-upload), the new data should replace the old fields but NOT reset an existing `approved` review status to `pending`. The fix is SQL-level: `CASE WHEN excluded.review_status = 'pending' THEN coa_data.review_status ELSE excluded.review_status END`. This preserves the prior approval while still updating the extracted data.
**Pattern:** Any column that represents a human decision (review status, approval flags) should be preserved on data refresh unless the new value represents an equal or higher authority.
**Risk if ignored:** Approved COA data silently reverts to pending on every weekly sync backfill, requiring QA to re-approve everything.

### ALTER TABLE default vs CREATE TABLE default can differ intentionally
**What happened:** The `coa_data` migration uses `DEFAULT 'approved'` to grandfather existing rows, while the `CREATE TABLE` DDL uses `DEFAULT 'pending'` for new databases. SQLite applies the ALTER default to existing rows on add. This intentional mismatch serves two purposes: existing data stays visible (approved) and new extractions start gated (pending).
**Pattern:** When adding a review gate to an existing feature, use the migration default to express the grandfather policy, and the DDL default to express the ongoing policy.
