# B007 — Requirements: Sync Dry-Run Mode

**Source:** [B007-sync-dry-run.md](B007-sync-dry-run.md)
**Date:** 2026-04-04

---

## Functional

- [ ] F1: `SyncApplyOptions` accepts `dryRun?: boolean`
- [ ] F2: `SyncApplyResult` includes `dryRun: boolean` field
- [ ] F3: `applySync({ dryRun: true })` returns a result with `dryRun: true` and all count fields populated (productCount, listingCount, contractCount, lotCount, warehouseCount, supplierCount)
- [ ] F4: After a dry-run, `inventory.json` is byte-identical to before the call
- [ ] F5: After a dry-run, no snapshot file is created in `data/snapshots/`
- [ ] F6: After a dry-run, the SQLite database is untouched (`getDb()` never called)
- [ ] F7: After a dry-run, no reference files are regenerated (no `suppliers.md` / `warehouses.md` writes)
- [ ] F8: After a dry-run, `inventory-proposed.json` is NOT deleted (cleanup skipped)
- [ ] F9: Dry-run acquires and releases the sync lock (prevents concurrent dry-run + real sync)
- [ ] F10: `npm run sync -- --dry-run` prints a `[DRY RUN]` prefixed summary and exits 0
- [ ] F11: `npm run sync` (without flag) behaviour is unchanged — `result.dryRun === false`
- [ ] F12: `dry_run_sync` agent tool returns `{ dryRun: true, result: { productCount, ... } }`
- [ ] F13: `dry_run_sync` does NOT require user confirmation (read-only)
- [ ] F14: `dry_run_sync` is accessible to both `qa` and `reviewer` roles (not in `REVIEWER_ONLY_TOOLS`)
- [ ] F15: `dry_run_sync` pre-validates that `inventory-proposed.json` and `inventory.json` exist, returning specific error messages if not (addresses B006-D1 pattern)
- [ ] F16: System prompt updated — suggests dry-run before apply when user seems uncertain (rule 14 addition)
- [ ] F17: System prompt preamble mentions `dry_run_sync` in the sync workflow capability list

## Error Handling

- [ ] EH1: Dry-run with missing `inventory-proposed.json` throws descriptive error ("No proposed inventory found...")
- [ ] EH2: Dry-run with missing `inventory.json` throws descriptive error
- [ ] EH3: Dry-run with malformed JSON throws "Invalid JSON" error
- [ ] EH4: Dry-run with missing `suppliers.json` / `warehouses.json` throws "File not found" error
- [ ] EH5: Dry-run with lock already held throws "Sync already in progress"
- [ ] EH6: `dry_run_sync` agent tool returns `{ error: "..." }` with specific message when proposed file missing
- [ ] EH7: `dry_run_sync` agent tool returns `{ error: "Sync already in progress" }` when lock held
- [ ] EH8: `dry_run_sync` agent tool returns `{ error: "Dry-run failed" }` for unexpected errors (no internal paths exposed)
- [ ] EH9: Lock is always released in `finally` block, even when dry-run throws

## Edge Cases

- [ ] EC1: Dry-run with zero products in proposed file — returns `productCount: 0` (or throws if products array check fails — matches real sync behaviour with "missing 'products' array")
- [ ] EC2: Proposed inventory with products but no listings — `listingCount: 0`, `lotCount: 0`, `contractCount: 0`
- [ ] EC3: `--dry-run` flag position in argv doesn't matter (`npm run sync -- --dry-run` and any future ordering)
- [ ] EC4: Multiple concurrent dry-runs — second one gets "Sync already in progress" (same as real sync)
- [ ] EC5: Dry-run while `inventory-proposed.json` has missing `products` array — throws same error as real sync

## Tests

### sync-apply.test.ts — Dry-run suite

- [ ] T1: Dry-run does not call `copyFileSync` or `writeFileSync` for snapshot/inventory
- [ ] T2: Dry-run returns counts matching proposed JSON fixture (productCount, listingCount, contractCount, lotCount)
- [ ] T3: Dry-run result has `dryRun: true`
- [ ] T4: Dry-run does not call `getDb()`
- [ ] T5: Dry-run lock file does not exist after completion (acquired and released)
- [ ] T6: Existing happy-path test still passes with `dryRun: false` on result

### agent-sync-tools.test.ts — dry_run_sync tool

- [ ] T7: `dry_run_sync` returns `dryRun: true` and counts from mocked `applySync`
- [ ] T8: `dry_run_sync` returns specific error when `inventory-proposed.json` missing
- [ ] T9: `dry_run_sync` returns "Sync already in progress" when lock held

### Build

- [ ] T10: `npx tsc --noEmit` clean (no type errors)
- [ ] T11: `npm test` — all tests pass (existing + new)
