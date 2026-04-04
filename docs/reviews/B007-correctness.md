# Correctness Review — B007

**Reviewer:** Fresh agent session
**Date:** 2026-04-04
**Batch:** docs/batches/B007-requirements.md

## Verification

- `npm test` — 125 tests passed (6 test files)
- `npx tsc --noEmit` — clean, no type errors

## Critical (must fix before merge)

None found.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **[lib/agent-tools.ts:1031–1038] `dry_run_sync` catch block — generic "Dry-run failed" for missing reference files** — When `suppliers.json` or `warehouses.json` are missing, `applySync()` throws a descriptive `"File not found: ..."` error. The `dry_run_sync` handler catches this and returns the generic `{ error: "Dry-run failed" }`. The user has no way to know *which* file is missing. The handler already pattern-matches `"Sync already in progress"` — a similar match for `msg.startsWith("File not found")` could return `"Dry-run failed: a required reference file is missing"` without exposing internal paths. Low priority since this scenario (missing suppliers/warehouses) is rare in practice.

- **[lib/agent-tools.ts:1006–1011 vs 962–968] Asymmetric pre-validation between `dry_run_sync` and `apply_sync`** — `dry_run_sync` has explicit `existsSync` pre-checks returning user-friendly errors (per F15), while `apply_sync` delegates to `applySync()` which throws on missing files, caught as generic "Sync failed". This is by design (B007 addresses B006-D1), but the inconsistency means a user calling `apply_sync` with a missing proposed file gets a less helpful error than calling `dry_run_sync`. Consider backporting the same pre-validation to `apply_sync` in a future batch.

## Detailed Checklist

### Functional Requirements

| Req | Status | Notes |
|-----|--------|-------|
| F1: `SyncApplyOptions.dryRun` | Pass | `lib/sync-apply.ts:51` |
| F2: `SyncApplyResult.dryRun` | Pass | `lib/sync-apply.ts:62` |
| F3: `applySync({ dryRun: true })` returns counts | Pass | Dry-run block at `lib/sync-apply.ts:165–195` counts products, listings, contracts, lots, warehouses, suppliers correctly |
| F4: `inventory.json` unchanged after dry-run | Pass | Dry-run returns before `copyFileSync` at line 226. Test `T1` in `sync-apply.test.ts` byte-compares before/after. |
| F5: No snapshot created | Pass | Dry-run returns before `mkdirSync`/`copyFileSync` at lines 198–222. Test verifies empty snapshots dir. |
| F6: `getDb()` never called | Pass | Dry-run returns before `getDb()` at line 244. Test `T4` verifies mock not called. |
| F7: No reference files regenerated | Pass | `referenceFilesRegenerated: false` in dry-run return. Returns before lines 464–466. |
| F8: `inventory-proposed.json` NOT deleted | Pass | Dry-run returns before `unlinkSync(proposedPath)` at line 489. Test verifies file exists after. |
| F9: Lock acquired and released | Pass | `acquireLock()` at line 136 runs before dry-run check. `finally` at line 514 always calls `releaseLock()`. Test verifies lock file absent after dry-run. |
| F10: `--dry-run` CLI flag | Pass | `scripts/sync-inventory.ts:17` — `process.argv.includes("--dry-run")`. Prints `[DRY RUN]` prefix and exits 0. |
| F11: Normal sync returns `dryRun: false` | Pass | `lib/sync-apply.ts:496`. Existing test updated to check at `sync-apply.test.ts:230`. |
| F12: Agent tool returns `{ dryRun, result }` | Pass | `lib/agent-tools.ts:1020–1029`. Test verifies structure. |
| F13: No confirmation required | Pass | `dry_run_sync` absent from rule 1 confirmation list in system prompt. |
| F14: Accessible to `qa` role | Pass | `dry_run_sync` absent from `REVIEWER_ONLY_TOOLS` set. Test explicitly verifies qa access. |
| F15: Pre-validates file existence | Pass | `lib/agent-tools.ts:1006–1011` checks both files with specific messages before calling `applySync()`. |
| F16: System prompt suggests dry-run | Pass | Step g2 added at `route.ts:58`. |
| F17: Preamble updated | Pass | "dry-run validation" added to capabilities list at `route.ts:26`. |

### Error Handling

| Req | Status | Notes |
|-----|--------|-------|
| EH1: Missing proposed → descriptive error | Pass | `lib/sync-apply.ts:141–145` throws before dry-run check |
| EH2: Missing inventory → descriptive error | Pass | `lib/sync-apply.ts:146–148` |
| EH3: Malformed JSON → error | Pass | `readJson()` at lines 121–127 catches `JSON.parse` failures |
| EH4: Missing suppliers/warehouses → error | Pass | `readJson()` at lines 151–152 throws "File not found" |
| EH5: Lock held → error | Pass | `acquireLock()` at line 136 throws "Sync already in progress" |
| EH6: Agent tool — proposed missing | Pass | `lib/agent-tools.ts:1006–1007` returns specific message |
| EH7: Agent tool — lock held | Pass | `lib/agent-tools.ts:1033` pattern-matches and returns specific message |
| EH8: Agent tool — unexpected error | Pass | `lib/agent-tools.ts:1037` returns generic "Dry-run failed", no path exposure. Test verifies no `/internal/` in response. |
| EH9: Lock released in finally | Pass | `lib/sync-apply.ts:514–516` — `finally { releaseLock(dataDir) }` covers both success and error paths. Test verifies lock absent after error. |

### Edge Cases

| Req | Status | Notes |
|-----|--------|-------|
| EC1: Zero products | Pass | `Array.isArray([])` is true → loop skips → `productCount: 0` returned |
| EC2: Products with no listings | Pass | `p.listings \|\| []` → empty → `listingCount: 0` |
| EC3: `--dry-run` flag position | Pass | `process.argv.includes()` checks any position |
| EC4: Concurrent dry-runs | Pass | Lock mechanism is shared — second call gets "Sync already in progress" |
| EC5: Missing products array | Pass | `!Array.isArray(inventory.products)` check at line 154 runs before dry-run branch |

### Counting Accuracy

Verified that dry-run counts match real-sync counting methodology:
- **productCount**: `inventory.products.length` — identical in both paths
- **listingCount**: `(l.lots || []).length` sum vs `listingCount++` per listing — identical
- **contractCount**: `(l.contracts || []).length` sum vs `contractCount++` per contract — identical
- **lotCount**: `(l.lots || []).length` sum vs `lotCount++` per lot entry — identical (both count raw entries, including duplicates)
- **warehouseCount**: `warehouses.warehouses.length` — identical in both paths
- **supplierCount**: `suppliers.suppliers.length` — identical in both paths
