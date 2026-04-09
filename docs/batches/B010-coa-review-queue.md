# B010 — COA Extraction Review Queue

**Epic:** E2 — Data Quality: Sync Validation Completions
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Goal

Add a review gate to AI-extracted COA data so that auto-extracted values must be approved by QA before appearing on the public product detail page. Currently, Claude Haiku extracts COA parameters on upload and they go live immediately with only an "AI-extracted" caveat. This batch adds a `review_status` column to `coa_data`, gates public display behind `approved` status, provides a review interface in the QA dashboard, and adds an agent tool for bulk review.

---

## Background

COA extraction via Claude Haiku vision (`lib/coa-extract.ts`) runs fire-and-forget after each COA upload (`app/api/upload/route.ts` line ~146). Extracted fields (brix, acidity, color, etc.) are stored in `coa_data` per lot and displayed as pills on the product detail page (`app/product/[id]/page.tsx` LotRow). The only safeguard is an italic disclaimer: "AI-extracted — may contain errors."

The `coa_data` table schema (`lib/db.ts` line 213) currently has: `lot_id` (PK), `data` (JSON), `updated_at`, `updated_by`. The `updated_by` field tracks the source (`"auto-extract"`, `"backfill"`, `"agent"`), but there is no review workflow.

The existing `document_requests` table provides a prior-art pattern for review status: `status CHECK(IN ('pending','approved','rejected','sent'))`, `reviewed_at`, `reviewed_by`.

**Key sync invariant:** Lot IDs change on every sync. `exportCoaData()` / `relinkCoaData()` preserve COA data by lot number. New review columns must follow the same export/relink pattern.

**Key files to understand:**
- `lib/coa-data.ts` — Data layer: types, query, upsert, export/relink, display formatting
- `lib/coa-extract.ts` — Claude Haiku vision extraction
- `app/api/upload/route.ts` — Fire-and-forget extraction hook (line ~146)
- `app/product/[id]/page.tsx` — Public COA pill display (LotRow, line ~219)
- `app/qa/(protected)/QADashboardClient.tsx` — QA dashboard with lot pills and expanded document panel
- `lib/documents.ts` — `getDocumentStatus()` and `ProductDocStatus` type
- `lib/agent-tools.ts` — `save_coa_data`, `backfill_coa_data` tool execution

---

## Scope

### In scope
- Add `review_status`, `reviewed_at`, `reviewed_by` columns to `coa_data` (migration + DDL)
- Gate public COA pill display behind `review_status = 'approved'`
- Auto-extract and backfill set `review_status = 'pending'`; agent `save_coa_data` sets `'approved'`
- Existing `coa_data` rows grandfathered as `'approved'` via migration default
- Review status preserved across weekly sync via export/relink
- QA dashboard: amber lot pills for pending review, "Pending Review" filter, approve/reject in expanded panel
- New `GET/POST /api/coa-review` route (auth: `qa` or `reviewer`)
- New `review_coa_data` agent tool (both `qa` and `reviewer` can use)
- Tests for review functions, sync preservation, public display gating

### Out of scope
- Changes to COA extraction logic itself (prompt, model, field parsing)
- Changes to the backfill UI in `/admin/tools`
- Notifications or emails on pending review items
- Review notes/comments per rejection (simple approve/reject only)
- Separate dedicated review queue page (integrated into existing QA dashboard)

---

## Acceptance Criteria

1. Auto-extracted COA data (upload route) is created with `review_status = 'pending'`
2. Backfilled COA data (`backfill_coa_data` tool) is created with `review_status = 'pending'`
3. Manually saved COA data (`save_coa_data` tool) is created with `review_status = 'approved'`
4. Public product page shows COA pills and COA-derived test badges **only** when `review_status = 'approved'`
5. Public product page still shows document-based test badges regardless of review status
6. Existing `coa_data` rows are migrated to `review_status = 'approved'` (no disruption)
7. QA dashboard lot pills show amber with ⏳ for lots with pending COA review
8. QA dashboard has a "Pending Review" filter option showing products with unreviewed extractions
9. QA dashboard expanded panel shows extracted COA fields per lot with Approve/Reject buttons
10. `POST /api/coa-review` accepts `{ lotIds, action }` and updates review status (auth required)
11. `GET /api/coa-review?productId=xxx` returns COA data with review status for the product's lots
12. Both `qa` and `reviewer` roles can approve/reject COA data
13. Unauthenticated requests to `/api/coa-review` return 404 (not 403)
14. `review_coa_data` agent tool accepts productId + optional lotNumbers + action
15. Review status (`review_status`, `reviewed_at`, `reviewed_by`) survives weekly sync via export/relink
16. `npm test` passes with all existing + new tests
17. `npx tsc --noEmit` clean

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/db.ts` | Add 3 columns to `coa_data` DDL + migration in `migrate()` |
| `lib/coa-data.ts` | `CoaReviewStatus` type, update `CoaData`, update `upsertCoaData()`, update `getCoaDataForLots()`, update export/relink, add `reviewCoaData()`, add `getCoaReviewQueue()` |
| `app/api/upload/route.ts` | Pass `"pending"` to `upsertCoaData()` |
| `lib/agent-tools.ts` | `save_coa_data` passes `"approved"`, `backfill_coa_data` passes `"pending"`, new `review_coa_data` tool definition + execution |
| `app/api/agent/chat/route.ts` | Register `review_coa_data` tool, update system prompt with COA review rule |
| `app/product/[id]/page.tsx` | Gate pill + COA badge display behind `reviewStatus === 'approved'` |
| `lib/documents.ts` | Add `coaReviewStatus` + `pendingCoaReviewCount` to `ProductDocStatus`, update `getDocumentStatus()` |
| `app/qa/(protected)/QADashboardClient.tsx` | Amber lot pills, "Pending Review" filter, review section in expanded panel |
| `app/api/coa-review/route.ts` | New route: GET (product COA data) + POST (approve/reject) |
| `tests/coa-data.test.ts` | Tests for review status functions |
| `agent_docs/coa-data.md` | Document review workflow, new agent tool |

**Do not modify:** `data/inventory.json`, `lib/sync-apply.ts`, `lib/coa-extract.ts`, existing sync tools in `agent-tools.ts`.

---

## Files to Read (Context)

- `lib/coa-data.ts` — Current data layer (types, upsert, export/relink, formatting)
- `lib/db.ts` — Schema DDL and migration pattern
- `lib/documents.ts` — `ProductDocStatus` type and `getDocumentStatus()` (dashboard data source)
- `app/api/upload/route.ts` — Fire-and-forget extraction hook
- `app/product/[id]/page.tsx` — Public LotRow COA pill display
- `app/qa/(protected)/QADashboardClient.tsx` — Dashboard lot pills + expanded panel
- `app/qa/(protected)/page.tsx` — Dashboard server component
- `lib/agent-tools.ts` — `save_coa_data` and `backfill_coa_data` execution
- `app/api/agent/chat/route.ts` — System prompt and tool registration
- `app/api/documents/[productId]/route.ts` — Auth guard pattern for API routes
- `tests/coa-data.test.ts` — Existing test structure

---

## Test Plan

Extend `tests/coa-data.test.ts`:

```ts
describe("reviewCoaData", () => {
  it("updates review_status to approved")
  it("updates review_status to rejected")
  it("sets reviewed_at and reviewed_by")
  it("returns false for non-existent lot")
});

describe("getCoaReviewQueue", () => {
  it("returns pending and rejected rows")
  it("excludes approved rows")
  it("filters by productId when provided")
  it("returns empty array when no pending items")
});

describe("upsertCoaData with reviewStatus", () => {
  it("defaults to pending when no status provided")
  it("sets approved when explicitly passed")
  it("does not downgrade approved to pending on re-extract")
});

describe("export/relink preserves review status", () => {
  it("exportCoaData includes reviewStatus, reviewedAt, reviewedBy")
  it("relinkCoaData restores review columns after re-link")
});
```

These tests will require mocking `getDb()` with an in-memory better-sqlite3 instance or extending the existing mock pattern.

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
- [ ] Documentation Checklist complete — CLAUDE.md, agent_docs/coa-data.md, epics.md updated
