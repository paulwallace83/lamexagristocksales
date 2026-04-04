# Integration Review — B005

**Reviewer:** Fresh agent session
**Date:** 2026-04-03
**Batch:** docs/batches/B005-requirements.md

## Critical (must fix before merge)

_None._

## Important (should fix, can be next batch)

- **`lib/agent-tools.ts` (TOOL_DEFINITIONS array, lines 325-352)** — The TOOL_DEFINITIONS array mixes read and action tools in the trailing block: `get_reference_data` (read), `save_proposed_inventory` (action), `run_sync_diff` (read). The existing pattern in the array is imperfect (e.g., `get_coa_backfill_status` at line 273 is wedged between action tools), so B005 is not making this worse — but all prior batches (B008) appended tools at the end in the same way. In contrast, the `executeTool` switch statement correctly groups the new tools: `get_reference_data` and `run_sync_diff` are placed in the read-only section (after `get_coa_backfill_status`, before `get_new_arrivals`), while `save_proposed_inventory` is placed in the action section. The `executeTool` placement is correct and consistent. The TOOL_DEFINITIONS ordering is a pre-existing inconsistency that B005 inherits but does not worsen. Should be addressed in a future refactor batch if the definitions array is ever reorganized.

- **`CLAUDE.md` (line 100)** — Test count reads "91 tests" but the suite now has 101 tests (10 new from B005: 2 `get_reference_data`, 5 `save_proposed_inventory`, 3 `run_sync_diff`). Must be updated before merge to maintain doc accuracy. This count was 91 as of B004; the B005 additions were not reflected.

- **`agent_docs/agent-tdpaib.md` (Capabilities section, lines 7-17)** — The capabilities bullet list was NOT updated with the new sync workflow capability. The Architecture section was correctly updated (tool count 22, action tools list), but the Capabilities section still ends at "New arrivals" and does not mention "Weekly sync workflow: read reference data, save proposed inventory, run sync diff." This is the same gap noted in the B005 retro (line 95). Should match the pattern of the other capability bullets. For comparison: B008 added both a capability bullet ("New arrivals") and the architecture update.

## Minor (nice to have)

- **`lib/agent-tools.ts` (`get_reference_data`, line 643-652)** — The `get_reference_data` tool reads `suppliers.json` and `warehouses.json` using `readFileSync` with a single try/catch around both reads. If `suppliers.json` reads successfully but `warehouses.json` fails, the error message says "Failed to read reference data" without indicating which file. The existing `get_import_review` tool (line 624-635) has a similar single-catch pattern, so this is consistent, but less informative than the separate existence checks in `run_sync_diff` (which checks `inventory.json` and `inventory-proposed.json` individually). Not a functional issue — the error message still includes the underlying `fs` error text.

- **`lib/agent-tools.ts` (`run_sync_diff`, lines 654-675)** — The `run_sync_diff` tool checks for the existence of `inventory-proposed.json` and `inventory.json` before calling `computeDiff()`, but does not check for `suppliers.json` or `warehouses.json`. If either is missing, `computeDiff()` will throw via its internal `safeReadJson()`, which is caught by the try/catch on line 668. This works but produces a less user-friendly error message ("Diff computation failed: Cannot read suppliers...") compared to the explicit "No inventory-proposed.json found. Save a proposed..." messages. Compare with `applySync()` in `lib/sync-apply.ts` (line 147-159) which checks all prerequisite files before proceeding. Low impact since the catch still handles it correctly.

- **`tests/agent-sync-tools.test.ts` (fs mock scope)** — The `vi.mock("fs")` on lines 41-49 replaces `readFileSync`, `writeFileSync`, and `existsSync` for the entire test file. The pre-existing B008 tests (`get_new_arrivals`, `clear_new_arrivals`) do not call `fs` functions, so there is no interference today. However, if a future batch adds tests for `get_import_review` (which reads `import-review.json` via `readFileSync`) to this file, the global `fs` mock could cause unexpected behavior unless carefully configured per-test. The existing `sync-apply.test.ts` avoids this problem by using real filesystem operations in a temp directory. This is a latent fragility, not a current bug.

- **`tests/agent-sync-tools.test.ts` (`vi.clearAllMocks` vs `vi.resetAllMocks`)** — All describe blocks use `vi.clearAllMocks()` in `beforeEach`, which clears call history but does NOT reset `mockImplementation`. A `readFileSync.mockImplementation(...)` set in one `it()` block persists into subsequent tests within the same file. Currently every test that needs a specific implementation sets its own, so there is no cross-contamination. However, the existing `sync-apply.test.ts` uses `vi.restoreAllMocks()` (line 137), which is the safer pattern. Both approaches exist in the codebase, so this is a pre-existing inconsistency, but worth noting for future test additions.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — `get_reference_data` reads static JSON files (suppliers/warehouses). `save_proposed_inventory` writes `inventory-proposed.json` which is a working file consumed and deleted by sync. `run_sync_diff` is read-only. No lot ID dependencies anywhere.
- [x] New tables/columns added to the "preserved during sync" path (if applicable) — No new tables or columns. No schema changes.
- [x] Migration block in `lib/db.ts` for any schema changes — No schema changes; no migration needed.
- [x] No assumptions about lot ID stability — None of the three tools reference lot IDs at all.

## Future Batch Readiness

- **B006 (Agent sync write tools — `apply_sync`)**: Ready. The system prompt rule 14h already says "tell the user the proposed inventory is ready to apply" — this is the forward reference for B006's `apply_sync` tool. `run_sync_diff` produces the diff report that the user will review before approving. `save_proposed_inventory` writes the file that `applySync()` in `lib/sync-apply.ts` expects. The `applySync()` library is already tested and stable from B004. B006 needs to: (a) add an `apply_sync` tool definition, (b) wire it to call `applySync()`, (c) add system prompt guidance for the apply step, (d) handle the confirmation requirement. The foundation is solid.
- **Overall foundation**: Solid. The three new tools fit cleanly into existing infrastructure. No new routes, no schema changes, no client-side code. The `computeDiff()` and `formatDiffReport()` functions from `lib/sync.ts` are well-tested and reused without modification. The `writeFileSync` call in `save_proposed_inventory` matches the pattern of how `import-excel.ts` writes the same file.

## Doc Updates Needed

- [x] CLAUDE.md: Update test count from "91 tests" to "101 tests" (line 100). Update "In Progress" section to reflect B005 completion once merged (currently shows `in-progress` which is correct for the branch).
- [x] Architecture.md: No changes needed. The new tools do not add new routes, tables, or external integrations.
- [x] LESSONS.md: No new lessons. The batch was a clean application of existing patterns with no surprises or gotchas discovered.
- [x] agent_docs/agent-tdpaib.md: Add a "Weekly sync workflow" capability bullet to the Capabilities section (lines 7-17) for consistency with the Architecture section update.
