# Integration Review — B010

**Reviewer:** Fresh agent session
**Date:** 2026-04-07
**Batch:** docs/batches/B010-requirements.md

## Critical (must fix before merge)

No critical issues found. The batch integrates cleanly with existing patterns across the data layer, UI, agent tools, and sync pipeline.

## Important (should fix, can be next batch)

- **`app/api/coa-review/route.ts` (POST)** — The POST endpoint accepts raw `lotIds` (integers) and calls `reviewCoaData()` on each without verifying the lots belong to any particular product. A malicious authenticated user (qa or reviewer) could approve or reject COA data for any lot in the system by guessing lot IDs. The existing `app/api/documents/[productId]/route.ts` pattern scopes operations by `productId` from the URL path. Adding a `productId` field to the POST body and verifying each lot belongs to that product would match the existing scoping pattern. Impact: low risk since users are trusted internal staff, but inconsistent with how other routes scope mutations.

- **`app/api/coa-review/route.ts` (POST)** — No upper bound on the `lotIds` array length. The existing `batch_lot_lookup` agent tool caps at 50, `batch_upload_documents` caps at 30, and `backfill_coa_data` caps at 50 documents. Adding a similar cap (e.g., 500) to the POST endpoint would be consistent with the existing pattern of bounding array inputs in action endpoints.

- **`lib/agent-tools.ts` (`review_coa_data` case)** — The `reviewedBy` value uses a new `agent:${uploaderEmail}` format (e.g., `agent:qa@lamexfoods.com`). All other `updatedBy` / `reviewedBy` values in the codebase use plain labels: `"auto-extract"`, `"backfill"`, `"agent"`, or raw email strings (from the POST route: `session.user.email || "unknown"`). This introduces a third convention. Should standardize — either use plain email everywhere or adopt the `agent:` prefix project-wide.

- **Branch contains unrelated changes** — `data/inventory.json` (~15,800 lines changed), `data/discount-inventory.json`, `suppliers.md`, `warehouses.md` all have date/content changes from what appears to be a weekly sync run while on this branch. These are not B010 code changes and should either be committed separately or excluded from the B010 merge to keep the commit focused.

## Minor (nice to have)

- **`lib/coa-data.ts` (`getCoaReviewQueue`)** — The type annotation for the `rows` variable is duplicated verbatim across the two branches of the ternary (with/without `productId`). Extracting a `type CoaReviewDbRow = { ... }` alias would reduce duplication and improve readability. The existing `lib/documents.ts` uses a `type DocRow` pattern for exactly this purpose (line 209).

- **`app/qa/(protected)/QADashboardClient.tsx` (`CoaReviewPanel`)** — The `pendingCount` prop comes from server-rendered data via `ProductDocStatus.pendingCoaReviewCount`. After an optimistic approve action, the local `items` state is updated but the heading text still shows the original `pendingCount` value until the `router.refresh()` completes. This is a minor UX inconsistency. Could derive the displayed count from `items.filter(i => i.reviewStatus === 'pending').length` instead of the prop.

- **`lib/documents.ts` (`getDocumentStatus`)** — The new query `SELECT lot_id, review_status FROM coa_data` fetches ALL `coa_data` rows on every call. At the current inventory scale (dozens of products, hundreds of lots) this is negligible. If the inventory grows to thousands of lots, this could be scoped by joining against the `lots` table to only fetch rows for active lots. The existing `getDocuments()` call in the same function already fetches all documents unconditionally, so this is consistent with the current approach.

- **`app/api/coa-review/route.ts`** — Missing `export const dynamic = "force-dynamic"`. While not strictly required (the `auth()` call reads cookies which makes the route inherently dynamic), the existing `app/api/documents/[productId]/route.ts` and `app/api/upload/route.ts` also omit it, so this is consistent with the closest peer routes. However, the majority of API routes in the project (~15 of them) do include it explicitly. Adding it would align with the majority pattern.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — `exportCoaData()` exports by lot number, `relinkCoaData()` re-links by lot number. The 3 new columns (`review_status`, `reviewed_at`, `reviewed_by`) are included in both functions. Round-trip test at `tests/coa-data.test.ts` line 318 verifies the full export-delete-reseed-relink cycle preserves review status.
- [x] New tables/columns added to the "preserved during sync" path — `coa_data` was already preserved via `exportCoaData()`/`relinkCoaData()` in `lib/sync-apply.ts`. The 3 new columns are included in both the export SELECT and the relink INSERT. No new tables created.
- [x] Migration block in `lib/db.ts` for any schema changes — Migration at line 249 adds the 3 columns via `ALTER TABLE` with `DEFAULT 'approved'` (grandfather clause). `PRAGMA table_info` check prevents double-add. DDL at line 213 uses `DEFAULT 'pending'` for new databases.
- [x] No assumptions about lot ID stability — All cross-sync references use lot numbers. The review panel fetches lot IDs at render time from the current database state. The agent tool resolves lot numbers to lot IDs via `getCoaReviewQueue(productId)`.

## Future Batch Readiness

- **E3 (QA Workflow)**: Ready. The `pendingCoaReviewCount` field on `ProductDocStatus` and the `coaReviewStatus` field on each lot provide the data needed for future QA dashboard filters (e.g., "filter by supplier or doc status"). The COA review panel pattern (`CoaReviewPanel` component with fetch-on-expand) establishes a reusable pattern for inline review actions.
- **E4 (Sales Intelligence)**: Ready. No conflicts. The admin dashboard homepage (when built) could surface `pendingCoaReviewCount` aggregates.
- **Overall foundation**: Solid. The review status model is cleanly layered:
  - Data layer: `lib/coa-data.ts` owns all review functions
  - API: `app/api/coa-review/route.ts` follows existing auth and error patterns
  - UI: Client component fetches via API, no server-only imports
  - Agent: Tool definition and execution follow existing patterns
  - Sync: Review columns flow through the same export/relink pipeline as the base `coa_data` fields
  - Tests: 16 new tests covering upsert semantics, review workflow, queue filtering, and export/relink round-trip

## Doc Updates Needed

- [x] CLAUDE.md: Updated — batch queue shows B010 as `in-progress`, test count updated to 151, B010 listed in completed batches. **Minor issue:** CLAUDE.md shows B010 in the "Batch Queue" table as `in-progress` but the epics.md shows E2 as `done`. When the batch closes, CLAUDE.md should move B010 to the "Completed" list and clear the queue table.
- [x] Architecture.md: No changes needed. The architecture did not change — this batch added columns to an existing table and a new API route, both of which follow existing patterns described in Architecture.md.
- [x] LESSONS.md: Two new lessons added: (1) `upsertCoaData` re-extraction must not downgrade review status, (2) ALTER TABLE default vs CREATE TABLE default can differ intentionally. Both are well-written, actionable, and document non-obvious decisions.
- [x] agent_docs/coa-data.md: Updated with review status section, updated agent tool documentation, updated key files list. Accurate.
- [x] agent_docs/db-schema.md: Updated `coa_data` row to include the 3 new columns and the display gating note. Accurate.
- [x] docs/epics.md: E2 marked as `done` with B010. Accurate.
- [x] docs/roadmap.md: COA extraction review queue marked as done with version v0.12.0. Accurate.
