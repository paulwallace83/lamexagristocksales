# Integration Review — B006

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B006-agent-sync-write-tools.md

## Critical (must fix before merge)

No critical integration issues found.

## Important (should fix, can be next batch)

- **[CLAUDE.md:116–120]** — Batch queue marks B006 as `in-progress` but the "In Progress" section says "Nothing active". These contradict each other within the same file. The "In Progress" section should list B006 as active, or at minimum not say "Nothing active" when the batch queue shows an active batch. This is the same doc structure used in previous batches — `CLAUDE.md` should be internally consistent.

## Minor (nice to have)

- **[lib/agent-tools.ts:949–988, cf. lines 681–692]** — `apply_sync` does not pre-validate that `inventory-proposed.json` or `inventory.json` exist before calling `applySync()`. If either is missing, `applySync()` throws and the agent returns a generic `"Sync failed"` with no actionable guidance. By contrast, `run_sync_diff` (lines 681–692) checks `existsSync()` for all 4 prerequisite files and returns specific messages like `"No inventory-proposed.json found. Save a proposed inventory first."` The B006 requirements explicitly acknowledge this as designed (EC1–EC3: generic error), and in practice the system prompt rule 14 enforces a workflow order (diff → apply) that ensures files exist before `apply_sync` is reached. Still, a pre-check would give better diagnostics if the agent deviates from the prescribed workflow or if a file is removed between steps.

- **[lib/agent-tools.ts:958–960]** — Snapshot path sanitisation uses `string.includes("data/snapshots/")` + `string.split().pop()`. This works but is fragile if the snapshot path format ever changes. A `path.relative(dataDir, snapshotPath)` or `path.basename()` would be more robust and self-documenting, matching how `save_proposed_inventory` returns a hardcoded relative path.

- **[lib/agent-tools.ts:968, lib/sync-apply.ts:52–57]** — `apply_sync` exposes `orphanedDocs` in its response, which includes `originalName` (user-supplied filenames). The `sync-apply.ts` file has a TODO on line 52: "When exposing SyncApplyResult via API, consider whether originalName should be sanitised." Now that `apply_sync` creates this API surface, the TODO should be resolved. Since agent responses go only to authenticated admin users, returning the original filename is acceptable — resolve the TODO by removing it or adding a comment noting that it's intentionally exposed to admin users only.

- **[lib/agent-tools.ts:961–978]** — The `apply_sync` response explicitly enumerates each field from `SyncApplyResult` rather than spreading the result. This is actually good practice (it controls exactly what's exposed), but note that `cleanedUp` and `referenceFilesRegenerated` are intentionally omitted — these are implementation details not useful to the agent. If `SyncApplyResult` gains new fields in future batches, they won't automatically appear in the agent response. This is the right default (explicit > implicit) but worth knowing.

## Sync Survival Check

- [x] New data uses lot numbers (not lot IDs) as stable keys — N/A, `apply_sync` delegates entirely to `applySync()` which handles lot re-linking. `get_reconciliation` is read-only against `inventory.json`.
- [x] New tables/columns added to the "preserved during sync" path (if applicable) — N/A, no schema changes.
- [x] Migration block in `lib/db.ts` for any schema changes — N/A, no schema changes.
- [x] No assumptions about lot ID stability — Neither tool references lot IDs directly.

## Future Batch Readiness

- **B007 (Sync dry-run)**: Ready. `apply_sync` calls `applySync()` with a simple options object (`SyncApplyOptions`). Adding a `dryRun?: boolean` flag to `SyncApplyOptions` and threading it through the `apply_sync` tool as an optional input parameter is a clean extension. The tool definition's `input_schema` currently has no parameters — B007 would add an optional `dryRun` boolean. The `applySync()` function would need to support rolling back the transaction when `dryRun` is true, returning the same `SyncApplyResult` structure for preview purposes.
- **Overall foundation**: Solid. With B006, the agent sync pipeline is complete end-to-end: `get_reference_data` → parse → `save_proposed_inventory` → `run_sync_diff` → resolve warnings → `apply_sync` → `get_reconciliation` → sign-off. System prompt rule 14 orchestrates all 10 steps. The only remaining E1 work is B007 (dry-run) which is an optional safety enhancement, not a blocker for using the sync workflow.

## Doc Updates Needed

- [ ] CLAUDE.md: Fix "In Progress" section to reflect B006 as active (currently says "Nothing active" while batch queue says B006 is `in-progress`). After merge: move B006 to completed, update test count, update batch queue.
- [ ] Architecture.md: No changes needed — no new routes, tables, or external integrations. The TDPAIB section already describes the tool-use loop and SSE streaming that `apply_sync` operates within.
- [ ] LESSONS.md: No new lessons — `apply_sync` reuses `applySync()` from B004 as designed, and `get_reconciliation` reuses `reconciliationReport()` from `lib/sync.ts`. No non-obvious decisions or gotchas discovered.
- [ ] agent_docs/agent-tdpaib.md: Already correctly updated — 24 tools (15 read-only, 9 action), capabilities section includes sync workflow, action tools list includes both new tools. No further changes needed.
- [ ] docs/epics.md: After merge, update E1 status to mark B006 as done (`B004+B005+B006+B008 done; B007 remaining`).
