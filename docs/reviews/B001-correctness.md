# Correctness Review — B001

**Reviewer:** Fresh agent session  
**Date:** 2026-04-01  
**Batch:** docs/batches/B001-sync-data-quality.md

## Summary

Reviewed `lib/sync.ts` (full file, 762 lines) and `tests/sync-validation.test.ts` (full file, 301 lines). All 76 tests pass. `npx tsc --noEmit` is clean. The implementation covers all 7 acceptance criteria. Two bugs found in null-safety handling of the unit-type change detection path.

## Critical (must fix before merge)

- **lib/sync.ts:513 — `prev.toLowerCase()` crashes when current product has `unitType: null` at runtime.** The `prev` value comes from `currentUnitTypes.get(product.id)` which maps product IDs to `p.unitType`. The `Product` interface types `unitType` as `string`, but JSON-sourced data can contain `null` at runtime. The guard `prev !== undefined` does NOT catch `null` — so `null.toLowerCase()` throws a TypeError. Triggered by: a product in the current inventory file having `"unitType": null`. Fix: change guard to `if (prev != null && prev !== undefined && ...)` or use `if (prev && ...)`, consistent with the null-safe pattern already used on line 495.

- **lib/sync.ts:513 — `product.unitType.toLowerCase()` crashes when proposed product has `unitType: null` at runtime.** Same issue, other side of the comparison. The unit type validation block (line 495) safely handles null/undefined via `(product.unitType || "").trim()`, but the change detection block (line 513) calls `.toLowerCase()` directly on `product.unitType` without a null guard. Triggered by: a proposed product with `"unitType": null` in JSON while the same product exists in current inventory. Fix: use `(product.unitType || "").toLowerCase()` to match the defensive pattern already used 18 lines above.

## Important (should fix, can be next batch)

None found.

## Minor (nice to have)

- **lib/sync.ts:527-533 — Duplicate detection key uses `|` separator, which could cause false collisions if field values contain `|`.** The grouping key is built by joining `commodity|format|specification|organic` with `|`. If a commodity or format value ever contained a literal `|` character, two unrelated products could produce the same key. Extremely unlikely with real inventory data, but a safer approach would use `JSON.stringify([...])` or a separator that cannot appear in product field values (e.g. `\x00`).

- **lib/sync.ts:529 — `specification: null` and `specification: ""` are treated as identical for duplicate grouping.** The code maps both to `""` via `(product.specification ?? "").toLowerCase()`. The batch doc (line 98) specifies "both null, or both non-null and equal". Strictly, a product with `specification: null` and one with `specification: ""` should not be considered duplicates under that rule. In practice the distinction is unlikely to matter since empty-string specs are rare, but it is a deviation from the stated acceptance criteria.
