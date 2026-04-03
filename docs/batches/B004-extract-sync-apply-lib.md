# B004 — Extract Sync-Apply Library Function

**Epic:** E1 — Operational Efficiency: Agent-Powered Sync
**Status:** `ready`
**Estimated size:** Medium (2–3 hrs)

---

## Goal

Extract the sync-apply logic from the CLI script (`scripts/sync-inventory.ts`) into a reusable library function that can be called from both the CLI and a route handler. This is the foundation for agent-powered sync — without it, the only way to apply a sync is via `npx tsx scripts/sync-inventory.ts`.

---

## Background

`scripts/sync-inventory.ts` currently does everything inline: preflight validation, snapshot, file copy, SQLite re-seed, document re-linking, COA re-linking, new arrival detection, reference file regeneration, discount deduction, and cleanup. It uses `process.exit()` on failure and `console.log()` for progress — neither of which work from a route handler.

The script needs to be split into:
1. **`lib/sync-apply.ts`** — A pure function `applySync()` that performs steps 1–7 (preflight through cleanup), returns a structured result object, and throws on unrecoverable failure instead of calling `process.exit()`.
2. **`scripts/sync-inventory.ts`** — Becomes a thin CLI wrapper that calls `applySync()` and formats the result for the terminal.

The existing imports in `scripts/sync-inventory.ts` (`exportCoaData`, `relinkCoaData`, `relinkDocumentLots`, `setNewArrivals`, `deductDiscountLots`, `validateDiscountItems`, `getDiscountItems`) all move into `lib/sync-apply.ts`.

---

## Scope

### In scope
- New `lib/sync-apply.ts` with `applySync()` function
- Structured `SyncApplyResult` return type capturing everything the CLI currently logs (snapshot path, re-seed counts, re-link reports, deduction report, validation report, new arrivals, orphaned docs)
- Simple file-based mutex (`data/.sync-lock`) to prevent concurrent syncs — check at entry, remove at exit (including on error)
- Refactored `scripts/sync-inventory.ts` that calls `applySync()` and prints the result
- Unit test verifying `applySync()` result structure with mocked DB/filesystem

### Out of scope
- New agent tools (B005/B006)
- Route handler for sync (B006)
- Dry-run mode (B007)
- Any UI changes

---

## Acceptance Criteria

1. `lib/sync-apply.ts` exports `applySync(options: SyncApplyOptions): SyncApplyResult`.
2. `SyncApplyOptions` accepts `{ proposedPath: string; inventoryPath: string; dataDir: string }`.
3. `SyncApplyResult` contains: `snapshotPath`, `productCount`, `listingCount`, `contractCount`, `warehouseCount`, `supplierCount`, `documentsPreserved`, `orphanedDocs`, `relinkReport`, `coaRelinkReport`, `deductionReport`, `validationReport`, `newArrivals`, `cleanedUp`.
4. `applySync()` never calls `process.exit()` — throws an `Error` with a descriptive message on unrecoverable failure.
5. `applySync()` acquires a file lock (`data/.sync-lock`) at entry and releases it in a `finally` block. If the lock already exists, it throws `"Sync already in progress"`.
6. `scripts/sync-inventory.ts` produces identical terminal output to today when run via `npm run sync`.
7. `npm run sync` still works end-to-end (existing behaviour preserved).
8. `npx tsc --noEmit` clean.

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/sync-apply.ts` | New file — `applySync()`, `SyncApplyResult`, `SyncApplyOptions` types, file lock logic |
| `scripts/sync-inventory.ts` | Refactor to thin CLI wrapper calling `applySync()` + formatting output |
| `tests/sync-apply.test.ts` | New test — verify result structure, lock behaviour, error on missing proposed file |

**Do not modify:**
- `lib/sync.ts` — diff engine is unchanged
- `lib/db.ts` — no schema changes
- `data/inventory.json` — only `npm run sync` (via `applySync()`) writes this

---

## Test Plan

`tests/sync-apply.test.ts`:

- **Happy path:** Mock `fs` and `getDb()`. Call `applySync()` with valid paths. Verify result has all expected fields with correct types.
- **Missing proposed file:** Call with non-existent `proposedPath`. Verify it throws with message containing `"inventory-proposed.json"`.
- **Concurrent lock:** Write a lock file before calling `applySync()`. Verify it throws `"Sync already in progress"`. Verify lock file is not deleted (it belongs to the "other" process).
- **Lock cleanup on error:** Mock the DB transaction to throw. Verify the lock file is removed after the error (the failing process cleans up its own lock).

Bootstrap:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
```

---

## Notes

- The lock file approach is simple and fits the single-node Railway architecture. No need for a database lock or Redis.
- `PRAGMA foreign_keys = OFF` / `ON` must remain in the same pattern (set outside transaction, restored in `finally`). This is preserved in the extracted function.
- The `readJson` helper currently calls `process.exit(1)` — replace with `throw new Error(...)` in the library version.
- Keep the `console.log` calls in `scripts/sync-inventory.ts` (the CLI wrapper), not in `lib/sync-apply.ts`. The library function should be silent.

---

## Definition of Done

- [ ] `lib/sync-apply.ts` exports `applySync()` with typed result
- [ ] `scripts/sync-inventory.ts` is a thin wrapper, identical output
- [ ] File lock prevents concurrent syncs
- [ ] `npm run sync` works end-to-end
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` clean
- [ ] No unrelated changes introduced
