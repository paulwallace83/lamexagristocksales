# Retrospective — B007

## Summary

Clean, narrow implementation. The dry-run logic is a 30-line early-return branch in `applySync()` that reuses all existing preflight validation and adds no new dependencies, DB tables, or schema changes. The agent tool follows the established `apply_sync`/`run_sync_diff` patterns closely. One process issue — B005/B006 had not been merged to `main`, which required an unplanned merge + rebase mid-implementation. No code issues above a 7 threshold.

## Acceptance Criteria Status

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `applySync({ dryRun: true })` returns result with `dryRun: true` and all counts | PASS | Early return at line 165–195 of `lib/sync-apply.ts` |
| 2 | `inventory.json` unchanged after dry-run | PASS | Tested: byte-identical read-back assertion in `sync-apply.test.ts` |
| 3 | No snapshot created after dry-run | PASS | Tested: `readdirSync(snapshots)` is empty |
| 4 | SQLite unchanged after dry-run | PASS | Tested: `getDb()` not called |
| 5 | Lock acquired and released during dry-run | PASS | Tested: lock file absent after completion |
| 6 | `npm run sync -- --dry-run` prints `[DRY RUN]` summary | PASS | Lines 23–33 of `scripts/sync-inventory.ts` |
| 7 | `dry_run_sync` agent tool returns `{ dryRun: true, result: {...} }` | PASS | Tested in `agent-sync-tools.test.ts` |
| 8 | `dry_run_sync` does NOT require confirmation (read-only) | PASS | Not in rule 1 confirmation list, not in `REVIEWER_ONLY_TOOLS` |
| 9 | `npx tsc --noEmit` clean | PASS | 0 errors |

## File-by-File Review

### lib/sync-apply.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - The dry-run `deductionReport` at line 189 is a hardcoded literal `{ lotsRemoved: 0, listingsEmptied: 0, productsRemoved: 0, missing: 0, details: [] }`. If `DeductionReport` gains new required fields in a future batch, this will cause a TypeScript error — which is the correct failure mode (caught at build time). Not a bug, but worth noting.
  - Dry-run lot counts iterate `l.lots || []` without deduplication. Real sync deduplicates lots with the same `lotNumber` within a listing (the `findLot`/`updateLot` pattern at lines 346–365). This means dry-run `lotCount` may be higher than the actual post-sync `lotCount` if a listing contains duplicate lot numbers. Accepted trade-off per planning decision — dry-run reports "input counts."
- **Suggested Refactoring:**
  - The dry-run return object (lines 176–194) is 19 lines of hardcoded zeros/empties. Could extract a `dryRunResult()` helper, but since there's only one call site and the explicitness aids review, the inline approach is fine.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - A product with `listings: null` (rather than `undefined` or missing) would crash on `p.listings || []` — but this matches the real sync path's identical pattern, so it's not a regression.
- **Sync survival:** No new data stored. The dry-run is stateless.
- **Data privacy:** The return contains only counts and placeholder strings. No customer names, pricing, or sensitive fields.
- **Client/server boundary:** `lib/sync-apply.ts` is server-only (imports `better-sqlite3` via `./db`). No client import risk.
- **Path safety:** No user-derived path segments in the dry-run branch. All paths come from `options.proposedPath` etc., which are constructed by the caller.

### scripts/sync-inventory.ts
- **Confidence:** 10/10
- **Uncertainties:** None.
- **Suggested Refactoring:** None — the `process.argv.includes("--dry-run")` pattern is simple and correct. No arg parsing library needed.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - `--dry-run` anywhere in argv will match (e.g., `npm run sync -- --other --dry-run`). This is fine — there are no other flags.
  - The `process.exit(0)` on line 32 means the error handler's `process.exit(1)` is never reachable for dry-run success. Correct behaviour.
- **Data privacy:** CLI output contains only counts. No sensitive data.

### lib/agent-tools.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - The `dry_run_sync` tool pre-validates file existence (lines 1006–1011), then `applySync()` performs its own preflight validation internally. This means a missing `suppliers.json` or `warehouses.json` would NOT be caught by the pre-validation — it would be caught inside `applySync()` and returned as a generic "Dry-run failed" message. The pre-validation only covers the two files the user directly controls (`inventory-proposed.json` and `inventory.json`). This is the same gap identified in B006-D1 for `apply_sync`, but the user-facing error is "Dry-run failed" which is actionable enough given the tool is read-only.
- **Suggested Refactoring:**
  - The `dry_run_sync` case (lines 1001–1039) duplicates the path construction logic from `apply_sync` (lines 962–964): `const dataDir = join(process.cwd(), "data"); const proposedPath = ...; const inventoryPath = ...;`. These four lines are identical. A shared helper (e.g., `getSyncPaths()`) would reduce duplication. However, the same pattern is used by `run_sync_diff` and `get_reconciliation` too — this is a pre-existing pattern inherited from B005/B006, not a new shortcut.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - If `applySync({ dryRun: true })` throws a non-Error object, `err instanceof Error` returns false, `msg` is empty, lock-conflict branch is skipped, generic "Dry-run failed" returned. Correct fallthrough.
- **Sync survival:** No data stored.
- **Data privacy:** Tool returns only counts. No sensitive fields in the response.
- **Client/server boundary:** Executes inside `executeTool()` which runs server-side only.
- **Path safety:** No user input in the paths — all derived from `process.cwd()` + hardcoded filenames.

### app/api/agent/chat/route.ts
- **Confidence:** 10/10
- **Uncertainties:** None.
- **Suggested Refactoring:** None. The step numbering (`g2`) is unconventional but clear. Renumbering all subsequent steps would be a larger diff for no functional benefit.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None. The "seems uncertain" language is intentionally vague — Claude can apply judgement here, and the worst case is suggesting a harmless read-only tool.
- **Data privacy:** No new privacy concerns. All existing rules (customer name stripping, pricing restrictions) are unchanged.

### tests/sync-apply.test.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - The "no snapshot created" assertion (lines 425–428) checks `readdirSync(join(dataDir, "snapshots"))`. The `makeTmpDir()` helper creates `snapshots/` as an empty subdirectory in `beforeEach`. If a prior non-dry-run test ran in the same `dataDir` and left a snapshot file, this assertion would fail. But `dataDir` is unique per test (uses `Date.now()` + random suffix), so cross-test contamination is impossible.
  - The dry-run tests read real files from the temp directory (not mocked fs). This is correct — we're testing the actual `applySync()` function, not a mock. But it means these tests are marginally slower than the mocked agent tool tests. Acceptable for 4 tests.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:**
  - No test for dry-run with a multi-product fixture (e.g., 3 products, mixed listings with and without lots). The single-product fixture with 2 lots covers the counting logic. A multi-product test would be nice but is not required.

### tests/agent-sync-tools.test.ts
- **Confidence:** 9/10
- **Uncertainties:**
  - The happy path test (line 471) provides a full `SyncApplyResult` mock with all fields typed explicitly. This is better than the B006 `apply_sync` test which casts to `any` (addressing B006-D4 for the new tool). However, the `deductionReport.details` is typed as an empty array `[]` — if `DeductionDetail` type changes, this wouldn't catch it. Acceptable since the dry-run result is all zeros anyway.
  - The `existsSync` mock in the "returns error when inventory.json is missing" test (line 519) checks `p.endsWith("inventory.json")`. This would also match `"inventory-proposed.json"` since that string ends with `"inventory.json"` as a substring? No — `"inventory-proposed.json".endsWith("inventory.json")` returns `false` because `endsWith` is an exact suffix match. The mock is correct.
- **Suggested Refactoring:** None.
- **Shortcuts Taken:** None.
- **Unhandled Edge Cases:** None identified.

### CLAUDE.md
- **Confidence:** 10/10
- **Uncertainties:** None. Sprint context updated. Test count will need updating after this batch is complete (currently 115 in the file, actual is 125).

## Cross-Cutting Concerns

- **Error handling:** `dry_run_sync` agent tool logs errors server-side via `console.error` and returns generic "Dry-run failed" to the client. Lock conflict is forwarded as a specific string (no sensitive content). The `applySync()` library function throws structured errors that are caught in the `finally` block (lock always released). No stack traces or filesystem paths leak.
- **Loading & empty states:** N/A — no UI changes in this batch.
- **Auth & roles:** `dry_run_sync` is not in `REVIEWER_ONLY_TOOLS`, so both `qa` and `reviewer` can call it. This is intentional — the tool is read-only. Tested explicitly in the "accessible to qa role" test case.
- **Audit logging:** No formal audit log exists in the system. Dry-run creates no artifacts (no snapshot, no DB changes). The `api_usage` table records the agent request that triggered the dry-run tool call.
- **Validation:** `dry_run_sync` takes no input parameters — nothing to validate. The `--dry-run` CLI flag is a boolean presence check.
- **TypeScript:** `npx tsc --noEmit` passes clean. No new `any` types in production code. Tests use `as any` on `executeTool` return values (consistent with all existing agent tool tests).

## Items Needing Immediate Attention

None. All criteria PASS. All files rated 9+.

## Items for Future Batches

1. **Dry-run lot count vs real sync lot count divergence** — Dry-run counts raw lot entries from JSON without deduplication. Real sync deduplicates lots with the same `lotNumber` within a listing. If a user's data contains duplicate lot numbers, the dry-run will report a higher `lotCount` than the actual sync. Consider adding a note to the CLI output or agent response clarifying "lots (before dedup)". Low priority — duplicate lots are rare.

2. **Shared `getSyncPaths()` helper** — `dry_run_sync`, `apply_sync`, `run_sync_diff`, and `save_proposed_inventory` all construct identical `dataDir`/`proposedPath`/`inventoryPath` variables from `process.cwd()`. A shared helper would reduce 4 instances of the same 3 lines. Cosmetic — not blocking.

3. **Pre-validation for `suppliers.json`/`warehouses.json` in agent tools** — Neither `dry_run_sync` nor `apply_sync` pre-validates the existence of `suppliers.json` and `warehouses.json`. A missing reference file results in a generic "Dry-run failed" / "Sync failed" error. Adding explicit checks would give the user a more actionable error message. This is the same issue as B006-D1 (partially addressed — `inventory-proposed.json` and `inventory.json` are now pre-validated, but reference files are not).

4. **Test count in CLAUDE.md** — The test count should be updated to 125 when the batch is closed. Currently shows 115.

## Lessons Learned

No new lessons. The batch was a minimal addition to an existing, well-structured function. The only process hiccup was discovering that B005/B006 hadn't been merged to `main` — resolved with a straightforward merge + rebase. The dry-run pattern (early return after shared preflight) is a clean approach that requires no new test infrastructure and doesn't complicate the real sync path.
