# Integration Review — B001

**Reviewer:** Fresh agent session
**Date:** 2026-04-01
**Batch:** docs/batches/B001-sync-data-quality.md

## Status

B001 has been implemented despite the batch doc still showing `Status: Ready`. The `SyncWarningType` union, `CANONICAL_UNIT_TYPES` constant, unit type validation, unit type change detection, and duplicate product detection are all present in `lib/sync.ts`. A dedicated test file exists at `tests/sync-validation.test.ts` with 17 tests. All 76 tests pass. `npx tsc --noEmit` is clean.

## Critical (must fix before merge)

None found from an integration perspective. The correctness review (`docs/reviews/B001-correctness.md`) identified two null-safety bugs in the unit-type change detection path — those are correctness issues, not integration issues, but they should be fixed before merge.

## Important (should fix, can be next batch)

- **`docs/batches/B001-sync-data-quality.md` line 3** — Status field still reads `Ready` but the batch is implemented. Should be updated to `done` (or `in-review`) to avoid confusion. The batch queue table in `CLAUDE.md` also shows B001 as `ready`.

- **`lib/sync.ts:457` — Function signature diverges from batch doc description.** The batch doc (line 26) described the signature as `(proposed: Product[], current: Product[])`. The actual implementation takes `(proposed: InventoryData, suppliers: SuppliersFile, warehouses: WarehousesFile, current?: InventoryData)`. This is the correct integration — it matches how `computeDiff()` calls the function on line 410 — but the batch doc is now misleading for anyone reading it after the fact. The signature was already this shape before B001 (the existing COO and warehouse checks needed the suppliers/warehouses arguments). No code change needed; the batch doc should note this divergence in a post-implementation addendum.

- **`tests/sync-validation.test.ts` — No `vi.mock("../lib/db")` present.** The existing test patterns in `tests/coa-data.test.ts` and `tests/documents.test.ts` both mock `../lib/db` because their imported modules transitively import SQLite. The sync validation test file does NOT mock `../lib/db`. This works today because `lib/sync.ts` does not import `lib/db.ts` — it only uses `readFileSync` for JSON files. However, if `lib/sync.ts` ever adds a database import (plausible for future validation checks that query the DB), this test file will break with a native module error. This is a latent fragility, not a current bug. Pattern: `LESSONS.md` line 85 says "Mock `../lib/db` to test any function in a file that imports SQLite". Since `sync.ts` does not import SQLite today, omitting the mock is technically correct. Worth noting for future batch authors.

## Minor (nice to have)

- **`lib/sync.ts:115-117` — `CANONICAL_UNIT_TYPES` is defined in `lib/sync.ts` rather than a separate `lib/validation-rules.ts`.** The batch doc (line 43) suggested either location. Keeping it in `sync.ts` is fine for now — the constant is only used by `validateBusinessRules()` in the same file. If future batches add more validation constants (e.g., canonical pack sizes, format lists), consider extracting to a dedicated file to avoid `sync.ts` growing too large (currently 762 lines).

- **`lib/sync.ts:93-103` — `SyncWarningType` union was extended with three new members (`invalid-unit-type`, `unit-type-changed`, `probable-duplicate`).** This is the correct pattern — the union is used as a discriminator in `SyncWarning.type`. The new types are consistent with the existing kebab-case naming convention (`missing-coo`, `unknown-warehouse`, etc.). No issues.

- **`tests/sync-validation.test.ts` — Test file is separate from `tests/sync.test.ts`.** The existing `sync.test.ts` tests `generateProductId`. The new `sync-validation.test.ts` tests `validateBusinessRules`. Splitting by function is a reasonable choice since both are exported from the same module. An alternative would have been adding to `sync.test.ts`, but the separation keeps test files focused and follows the pattern where each test file covers a logical unit. No issue.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A: B001 adds validation checks only, no new data storage. The checks run during the pre-sync diff phase before any data is written.
- [x] New tables/columns added to the "preserved during sync" path — N/A: No schema changes. No new tables or columns.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A: No schema changes.
- [x] No assumptions about lot ID stability — Confirmed. The new checks operate on `Product` objects from JSON (proposed/current inventory files), not on database rows. No lot IDs are referenced.

## Future Batch Readiness

- **B002 (Pending Request Badge):** Ready. No dependency on B001. B002 touches layout files (`app/admin/requests/layout.tsx`, `app/qa/(protected)/layout.tsx`) and calls an existing `getPendingRequestCount()` function. Nothing in B001 affects these files or patterns.
- **B003 (QA Panel Doc Actions):** Ready. No dependency on B001. B003 adds a `DELETE /api/documents/[id]` route and modifies `QADashboardClient.tsx`. B001 only touched `lib/sync.ts` and added a test file. No overlap or conflict.
- **Overall foundation:** Solid. B001 followed existing patterns well: pure function with no side effects, exported for testing, typed warnings integrated into the existing `SyncDiff` pipeline, informational warnings correctly separated from blocking warnings in `formatDiffReport()`. The `SyncWarningType` union provides a clean extension point for future validation checks without breaking existing consumers. The test file follows the project's `vitest` conventions (describe blocks per feature, `makeProduct` fixture factory, filtering warnings by type).

## Doc Updates Needed

- [ ] CLAUDE.md: Update B001 status from `ready` to `done` in the Batch Queue table (line ~approx "Current Sprint Context" section).
- [ ] Architecture.md: No changes needed. The existing "Business Rule Validation" description in the sync pipeline (Step 3, line 94) already covers `validateBusinessRules()`. The new checks are additive and non-blocking, so no architectural description changes are required.
- [ ] LESSONS.md: No new lessons. The null-safety issue flagged in the correctness review could become a lesson once fixed (defensive `.toLowerCase()` on JSON-sourced string fields), but that belongs in the correctness fix, not this integration review.
- [ ] B001 batch doc: Update status to `done`. Consider adding a "Post-Implementation Notes" section documenting the function signature divergence and the decision to keep `CANONICAL_UNIT_TYPES` in `sync.ts`.
