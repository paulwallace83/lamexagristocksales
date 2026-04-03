# Retrospective — B004

## Summary

Clean extraction with high fidelity to the original script. The core `applySync()` function is structurally sound — lock semantics, error handling, and the try/finally PRAGMA pattern are all correct. Two issues need attention: the CLI wrapper uses `require()` instead of ES imports (minor), and a pre-existing bug was discovered where the sync script never re-inserts lots into the `lots` table after clearing it, causing `relinkDocumentLots()` and `relinkCoaData()` to silently orphan all re-links.

## File-by-File Review

### lib/sync-apply.ts
- **Confidence:** 8/10
- **Uncertainties:**
  - The TOCTOU race in `acquireLock()` (`existsSync` then `writeFileSync` is not atomic). Two processes could both see no lock and both proceed. Acceptable for single-node Railway, but if multi-process sync is ever introduced this would need `fs.openSync` with `O_CREAT | O_EXCL`.
  - `readJson()` returns `any` — no runtime validation of the parsed JSON shape beyond array checks. Malformed product objects (missing `id`, null `listings`) would throw mid-transaction with unclear errors.
- **Suggested Refactoring:**
  - The seeding transaction (lines 195–325) is ~130 lines of dense insert logic. Could be extracted into a `seedFromInventory(db, inventory, suppliers, warehouses)` helper, but this adds no functional value for B004 — it just reduces the function length. Worth considering when the seed logic itself needs modification.
  - `regenerateSuppliersMd` and `regenerateWarehousesMd` use `process.cwd()` for output paths. When called from a route handler (B006), `process.cwd()` should still be correct on Railway, but this assumption should be verified during B006.
- **Shortcuts Taken:**
  - No lot insertion logic — faithfully matches the original script, which also omits it. See "Pre-existing Issue" below.
  - Reference file generators write to `process.cwd()` rather than accepting an output path parameter. Fine for now; may need parameterisation for B006.
- **Unhandled Edge Cases:**
  - Stale lock file from a crashed process: the lock file persists forever. No TTL or PID-liveness check. A human would need to manually delete `data/.sync-lock`. The lock contains PID + timestamp for debugging, but no automatic recovery.
  - If `suppliers.json` or `warehouses.json` is missing entirely (not malformed, but absent), `readJson` throws a file-not-found error that doesn't clearly indicate which file. The error message includes the path, but could be more user-friendly.

### scripts/sync-inventory.ts
- **Confidence:** 7/10
- **Uncertainties:**
  - **Output ordering differs from original on partial failure.** The original prints progress messages inline as work happens ("Preflight validating..." → does validation → "All files valid"). The wrapper prints all output after `applySync()` returns. For success: identical. For mid-sync crashes: the original would show partial progress; the wrapper shows only the error. This is arguably better UX (no misleading "All files valid" before a crash), but it's not identical.
  - **Lines 25-27 use `require("fs")` and `require("path")`** inside the try block to get `statSync` and `basename`. These should be ES module imports at the top of the file. This is a code quality issue — it works, but it's inconsistent with the rest of the file.
- **Suggested Refactoring:**
  - Replace `require("fs")` and `require("path")` with top-level ES imports.
  - The discount validation count on line 117 (`vr.validated + vr.missing + vr.overlaps.length`) reconstructs the active item count from the report. The original used `activeDiscountItems.length` directly. Both should produce the same number (each item maps to exactly one action), but the original is more direct. Consider adding `totalChecked` to `ValidationReport` in a future batch.
- **Shortcuts Taken:**
  - Accepted non-identical output ordering for the failure path — a deliberate trade-off.
- **Unhandled Edge Cases:**
  - If `statSync(result.snapshotPath)` fails (file deleted between applySync and the wrapper reading it), the wrapper crashes. Extremely unlikely but not handled.

### tests/sync-apply.test.ts
- **Confidence:** 7/10
- **Uncertainties:**
  - The happy path test uses a very coarse DB mock — `prepare()` returns the same mock statement regardless of SQL. This verifies the function doesn't crash, but doesn't verify correct SQL execution order or parameters. It's a smoke test, not a thorough integration test.
  - The mock `transaction` returns the function directly (line 119: `vi.fn((fn) => fn)`), which means the function body runs immediately but NOT inside an actual SQLite transaction. This is the expected mocking pattern, but it means the test can't catch transaction isolation bugs.
- **Suggested Refactoring:**
  - Add a test for malformed JSON input (e.g., `"not json"` as suppliers.json content) to exercise the `readJson` error path.
  - Add a test for empty products array (`{ products: [] }`) to verify the function handles zero-product sync gracefully.
- **Shortcuts Taken:**
  - Temp directories in `/tmp` are created but never cleaned up (only the lock file is removed in `afterEach`). Low severity — CI containers are ephemeral and dev `/tmp` is cleaned on reboot.
  - Only 4 tests covering the happy path, lock, and error scenarios. No test for the snapshot sequential naming, reference file generation, or discount validation path.
- **Unhandled Edge Cases:**
  - No test for `validationReport !== null` (when active discount items exist).
  - No test for new arrivals detection (snapshot vs proposed comparison).

### docs/batches/B004-requirements.md
- **Confidence:** 9/10
- **Uncertainties:** None — documentation file.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** N/A.

### CLAUDE.md (batch queue status change only)
- **Confidence:** 10/10 — single-line status change from `ready` to `in-progress`.

## Lamex-Specific Checks

| Check | Result |
|-------|--------|
| **Sync survival** | No new lot-ID-dependent data. The extraction preserves the existing lot-number-based re-linking pattern. No regression. |
| **Data privacy** | No customer names, pricing, or sensitive ERP fields in any output. `SyncApplyResult` contains only structural counts and reports. |
| **Client/server boundary** | `lib/sync-apply.ts` imports `better-sqlite3` transitively via `getDb()`. Server-only — no client component imports it. |
| **Path safety** | No user-derived path segments. All paths constructed from `options.dataDir` (set by caller). Reference file generators use `process.cwd()` — same as the original. |

## Items Needing Immediate Attention

1. **CLI wrapper uses `require()` instead of ES imports** (scripts/sync-inventory.ts lines 25-27). Confidence 7/10 — works but is inconsistent. Should be fixed before merge.

## Items for Future Batches

1. **Pre-existing: Sync script does not re-insert lots.** The original `scripts/sync-inventory.ts` deletes from `lots` and `lot_contracts` (line 159-160 of the original) but never re-inserts them. `autoSeed()` in `lib/db.ts` (lines 317-342) DOES insert lots from `inventory.json` (which contains `l.lots` arrays), but autoSeed only runs on first DB creation. After every weekly sync, the `lots` and `lot_contracts` tables are **empty**. This means `relinkDocumentLots()` and `relinkCoaData()` always find zero matching lots and report everything as orphaned. This is NOT a B004 regression — the gap has existed since the sync script was written. Should be addressed in a future batch by adding lot insertion to the seed transaction in `applySync()`.

2. **Lock file stale recovery.** If the process crashes after acquiring the lock but before the `finally` runs (e.g., `kill -9`), the lock file persists forever. Consider adding a TTL check or PID-liveness verification for the route-handler use case in B006.

3. **`process.cwd()` in reference file generators.** When `applySync()` is called from a route handler (B006), verify that `process.cwd()` resolves correctly on Railway. May need to accept an output directory parameter.

## LESSONS.md Candidates

1. **Sync script has never inserted lots.** After weekly sync, the `lots` and `lot_contracts` tables are empty. `autoSeed()` handles lots but only runs on first DB creation. `relinkDocumentLots()` and `relinkCoaData()` query the `lots` table and will orphan everything when it's empty. Any future work on lot-level features after sync (COA re-linking, document-lot associations) depends on fixing this gap. This is a pre-existing issue, not introduced by any batch.

2. **`acquireLock` must be called BEFORE the `try` block**, not inside it. If it throws (lock exists), the `finally` block must NOT run `releaseLock` — otherwise it deletes another process's lock. The test in `sync-apply.test.ts` ("throws when lock already exists" + "lock file preserved") catches regressions if someone moves the call inside `try`.
