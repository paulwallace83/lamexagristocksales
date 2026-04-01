# B001 Requirements — Sync Data Quality: Unit Type Validation & Duplicate Detection

## Unit Type Validation

- [ ] `CANONICAL_UNIT_TYPES` constant defined with lowercase values: `cases`, `lbs`, `kgs`, `pallets`, `drums`, `totes`, `bags`, `boxes`, `mt`
- [ ] When a product's `unitType` (case-insensitive) is not in the canonical set, `validateBusinessRules()` returns a warning with `type: "invalid-unit-type"` and `requiresAction: false`
- [ ] Warning message includes the product name, product ID, and the invalid value
- [ ] When `unitType` is in the canonical set (any casing), no warning is produced
- [ ] Error state: `unitType` is empty string or missing — treated as invalid, produces warning

## Unit Type Change Detection

- [ ] `validateBusinessRules()` accepts an optional `current?: InventoryData` parameter
- [ ] When `current` is provided and a product exists in both current and proposed with a different `unitType` (case-insensitive), a warning is returned with `type: "unit-type-changed"` and `requiresAction: false`
- [ ] Warning message includes the product name, old value, and new value
- [ ] When `current` is not provided (undefined), no change-detection warnings are produced
- [ ] When a product exists only in proposed (new product), no change warning is produced
- [ ] When `unitType` is the same (case-insensitive), no change warning is produced

## Duplicate Product Detection

- [ ] Two or more products sharing the same `commodity + format + specification + organic` (all case-insensitive, specification null-safe) produce a single warning with `type: "probable-duplicate"` and `requiresAction: false`
- [ ] Warning message lists all product IDs and names in the duplicate group
- [ ] Three products in one group produce one warning, not two or three
- [ ] Products with same commodity + format but different specification produce no warning
- [ ] Products with same commodity + format + specification but different `organic` produce no warning

## Type System

- [ ] `SyncWarningType` union updated: `"ambiguous-unit-type"` removed, `"invalid-unit-type"`, `"unit-type-changed"`, `"probable-duplicate"` added
- [ ] No existing code references `"ambiguous-unit-type"` (grep confirms)

## Integration

- [ ] `computeDiff()` passes `current` inventory data to `validateBusinessRules()`
- [ ] Existing blocking checks (COO, warehouse) are unchanged and pass their current tests
- [ ] New warnings render under "Informational" section in `formatDiffReport()` output (no code change needed — existing logic handles `requiresAction: false`)

## Tests — `tests/sync-validation.test.ts`

- [ ] Invalid unit type value → warning returned
- [ ] Unit type change detected → warning with old and new values
- [ ] Unit type unchanged and valid → no warning
- [ ] Two products with same commodity/format/spec/organic → duplicate warning
- [ ] Two products with same commodity/format but different spec → no warning
- [ ] Three products in duplicate group → single warning (not two)
- [ ] Existing COO/warehouse checks still produce correct warnings (regression)
- [ ] `npm test` passes with all new tests green
- [ ] `npx tsc --noEmit` clean
