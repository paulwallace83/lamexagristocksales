# B004 — Requirements Checklist

## Library Function (`lib/sync-apply.ts`)

- [ ] Exports `SyncApplyOptions` type with fields: `proposedPath: string`, `inventoryPath: string`, `dataDir: string`
- [ ] Exports `SyncApplyResult` type with fields: `snapshotPath`, `productCount`, `listingCount`, `contractCount`, `warehouseCount`, `supplierCount`, `documentsPreserved`, `orphanedDocs`, `relinkReport`, `coaRelinkReport`, `deductionReport`, `validationReport`, `newArrivals`, `cleanedUp`, `referenceFilesRegenerated`
- [ ] Exports `applySync(options: SyncApplyOptions): SyncApplyResult`
- [ ] `applySync()` never calls `process.exit()` — throws `Error` with descriptive message on unrecoverable failure
- [ ] `applySync()` never calls `console.log()` or `console.error()` — library is silent
- [ ] `applySync()` acquires a file lock (`data/.sync-lock`) at entry
- [ ] Lock file contains PID and timestamp for debugging stale locks
- [ ] If lock already exists, throws `Error` with message containing `"Sync already in progress"`
- [ ] Lock is released in a `finally` block — guaranteed cleanup even on error
- [ ] Lock is NOT deleted when another process owns it (concurrent lock test)

## Preflight Validation

- [ ] Throws if `proposedPath` does not exist, with message containing `"inventory-proposed.json"`
- [ ] Throws if `inventoryPath` does not exist
- [ ] Parses proposed JSON, `suppliers.json`, `warehouses.json` — throws on malformed JSON
- [ ] Throws if proposed JSON missing `products` array
- [ ] Throws if `suppliers.json` missing `suppliers` array
- [ ] Throws if `warehouses.json` missing `warehouses` array
- [ ] All JSON parsing happens before any mutations (fail-fast)

## Snapshot

- [ ] Creates snapshot at `data/snapshots/inventory-YYYY-MM-DD.json`
- [ ] Handles multiple syncs per day with sequential suffix (`-2`, `-3`, etc.)
- [ ] Verifies snapshot is non-empty after copy
- [ ] Returns `snapshotPath` in result

## Apply + Seed

- [ ] Copies proposed → inventory.json
- [ ] On copy failure: restores inventory.json from snapshot, then throws
- [ ] Exports COA data before lots are deleted
- [ ] Sets `PRAGMA foreign_keys = OFF` before transaction
- [ ] Restores `PRAGMA foreign_keys = ON` in `finally` block
- [ ] Clears and re-inserts: metadata, warehouses, suppliers, supplier_products, products, certifications, listings, listing_contracts
- [ ] Preserves: documents, users, discount_items, conversations, api_usage, document_requests, product_flags
- [ ] Returns correct counts: `productCount`, `listingCount`, `contractCount`, `warehouseCount`, `supplierCount`
- [ ] Returns `documentsPreserved` count
- [ ] Detects and returns `orphanedDocs` array (documents whose product was removed)

## Re-linking

- [ ] Calls `relinkDocumentLots()` — returns result in `relinkReport`
- [ ] Calls `relinkCoaData()` with exported data — returns result in `coaRelinkReport`
- [ ] `coaRelinkReport` is `{ linked: 0, orphaned: 0 }` when no COA data existed

## New Arrivals

- [ ] Compares snapshot product IDs vs proposed product IDs
- [ ] Calls `setNewArrivals()` with new product IDs
- [ ] Returns `newArrivals: string[]` (the new product IDs)
- [ ] Non-fatal: if snapshot comparison fails, returns empty array (does not throw)

## Reference File Regeneration

- [ ] Regenerates `suppliers.md` with correct table format
- [ ] Regenerates `warehouses.md` with correct table format
- [ ] Returns `referenceFilesRegenerated: true` on success

## Discount Processing

- [ ] Calls `deductDiscountLots()` — returns result in `deductionReport`
- [ ] Calls `validateDiscountItems()` only when active discount items exist
- [ ] Returns `validationReport: ValidationReport | null` (`null` when no active items)

## Cleanup

- [ ] Deletes `proposedPath` after successful sync
- [ ] Returns `cleanedUp: true` on successful delete, `false` if delete fails
- [ ] Delete failure is non-fatal (does not throw)

## CLI Wrapper (`scripts/sync-inventory.ts`)

- [ ] Calls `applySync()` with correct paths
- [ ] Produces identical terminal output to current script (same emojis, wording, structure)
- [ ] Calls `process.exit(1)` on caught error
- [ ] No direct DB access — all logic delegated to `applySync()`

## Tests (`tests/sync-apply.test.ts`)

- [ ] Happy path: mock fs + getDb, verify result has all fields with correct types
- [ ] Missing proposed file: verify throws with message containing `"inventory-proposed.json"`
- [ ] Concurrent lock: pre-existing lock file → throws `"Sync already in progress"`, lock file preserved
- [ ] Lock cleanup on error: mock DB to throw → verify lock file removed after error

## Build + CI

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm test` passes (all existing + new tests)
- [ ] No unrelated changes introduced
