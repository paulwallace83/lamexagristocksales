# Correctness Review — B004

**Reviewer:** Fresh agent session
**Date:** 2026-04-02
**Batch:** `docs/batches/B004-extract-sync-apply-lib.md`

## Critical (must fix before merge)

None found

## Important (should fix, can be next batch)

- **[lib/sync-apply.ts:340–353 — new arrivals try/catch]** — If `setNewArrivals()` throws (e.g. DB error), the catch block on line 351 overwrites `newArrivals` with `[]`, losing the successfully detected new arrival IDs. The CLI then reports "No new arrivals detected" when arrivals *were* detected but couldn't be flagged. The original script logged `"⚠️ Could not detect new arrivals: {error}"` — a more accurate message. Triggered by any DB failure during `setNewArrivals()`. Fix: move `setNewArrivals(newArrivals)` outside the try/catch, or add a second try/catch around it that does *not* overwrite `newArrivals`:
  ```ts
  // detect
  try {
    const snapshot = readJson(snapshotPath);
    const previousIds = new Set(…);
    newArrivals = inventory.products.map(…).filter(…);
  } catch {
    newArrivals = [];
  }
  // flag (separate try — don't lose detection data)
  try {
    if (newArrivals.length > 0) setNewArrivals(newArrivals);
  } catch {
    // Non-fatal — arrivals detected but not flagged
  }
  ```

- **[scripts/sync-inventory.ts — CLI output not identical on failure (AC #6)]** — The acceptance criteria says "produces identical terminal output." On success the text matches. On failure, the original showed progressive output up to the failure point (e.g., `"Preflight ✅"` → `"Snapshot saved"` → `"❌ DB error"`). The new CLI wrapper calls `applySync()` first then logs everything — so on failure, only `"❌ {error message}"` appears with no prior progress lines. Triggered by any mid-sync error. Fix: accept this as a known behavioural change and update AC #6 to say "identical terminal output on success," or restructure the CLI wrapper to emit progress before calling `applySync()` (adds complexity for limited value).

- **[lib/sync-apply.ts:356–363 — reference file regeneration failure swallowed]** — `regenerateSuppliersMd` and `regenerateWarehousesMd` are wrapped in a blanket try/catch that silently swallows errors and sets `referenceFilesRegenerated = false`. The original had **no** try/catch — write failures (disk full, permission denied) would crash the sync, making the problem immediately visible. The library now hides these errors with no mechanism for the caller to see *what* went wrong. Triggered by write permission errors or disk-full conditions. Fix: either let these errors propagate (matching original behaviour — the sync data is already committed at this point), or capture the error message in the result object so the CLI can log it.

- **[lib/sync-apply.ts:445,474 — `process.cwd()` hardcoded for reference files]** — `regenerateSuppliersMd` and `regenerateWarehousesMd` write to `process.cwd()/suppliers.md` and `process.cwd()/warehouses.md`. The library is parameterised via `SyncApplyOptions.dataDir` for all other paths, but reference files bypass this. When called from a route handler (the stated purpose of this extraction), `process.cwd()` resolves to the same place in the current Next.js/Railway setup, so this works today — but it makes the function less portable than the rest of its interface suggests. Triggered by invoking from a non-standard working directory. Fix: derive from a `rootDir` option or compute relative to `dataDir` parent.

## Minor (nice to have)

- **[lib/sync-apply.ts:91–98 — `readJson` error message]** — If `suppliers.json` or `warehouses.json` is missing, the error says `"Failed to parse JSON: {path}"` when the actual error is ENOENT. The ENOENT message from `readFileSync` is included in the string so it's not truly misleading — but a dedicated existence check before `readJson` (as done for `proposedPath` and `inventoryPath`) would produce a clearer error.

- **[lib/sync-apply.ts:72–78 — TOCTOU race in acquireLock]** — `existsSync()` → `writeFileSync()` is not atomic. A concurrent process could create the lock between the check and the write. The batch doc explicitly calls this out as acceptable for single-node Railway. No fix needed for current architecture.

---

## Tooling results

- `npx tsc --noEmit` — **clean** (no errors)
- `npm test` — **86 tests passed** (6 test files, including `tests/sync-apply.test.ts` with 4 new tests)
