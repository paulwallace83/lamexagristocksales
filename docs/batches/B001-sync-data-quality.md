# B001 — Sync Data Quality: Unit Type Validation & Duplicate Detection

**Epic:** E2 — Data Quality: Sync Validation Completions
**Status:** `done`
**Estimated size:** Medium (2–3 hours agent time)

---

## Goal

Extend `validateBusinessRules()` in `lib/sync.ts` to catch two classes of data quality problem that currently pass through sync silently:

1. **Unit type anomalies** — a product's `unitType` changes between syncs, or contains a value outside the known canonical set (e.g., a typo like "case" instead of "Cases")
2. **Probable duplicate products** — two products have the same commodity + format + specification but different IDs, suggesting an ERP data entry inconsistency

Both checks should produce `SyncWarning` entries (non-blocking by default) that appear in the diff report under the existing "Informational Warnings" section. They must not block sync on their own — Paul decides whether to act.

---

## Background

`validateBusinessRules()` currently checks only:
- COO presence (blocking)
- Warehouse city/state completeness (blocking)

The function is in `lib/sync.ts` ~line 448. It receives `proposed: Product[]` and `current: Product[]` and returns `SyncWarning[]`. The `SyncWarning` type is:

```ts
{ type: string; productId?: string; message: string; requiresAction: boolean }
```

Warnings are rendered in `formatDiffReport()` into the Markdown output — blocking warnings go under "⚠️ Blocking Warnings", informational under "ℹ️ Informational Warnings".

---

## Scope

### In scope
- New check: unit type anomaly detection (value outside canonical set OR changed since last sync)
- New check: probable duplicate product detection (same commodity + format + spec + organic, different ID)
- Both checks: `requiresAction: false` (informational, non-blocking)
- Unit test coverage for both new checks
- Canonical unit type list defined as a constant in `lib/sync.ts` (or a dedicated `lib/validation-rules.ts`)

### Out of scope
- Lot-level validation (quantity/weight sanity, BBD checks) — separate batch
- Contract number format validation — separate batch
- Any UI changes to `/review` portal
- Modifying the reconciliation report

---

## Acceptance Criteria

1. When a product's `unitType` is not in the canonical set, `validateBusinessRules()` returns a warning identifying the product and the invalid value.
2. When a product's `unitType` has changed from the previous sync, `validateBusinessRules()` returns a warning identifying the product, the old value, and the new value.
3. When two or more products share the same `commodity + format + specification + organic` but have different IDs, `validateBusinessRules()` returns a single warning listing all matching products.
4. All new warnings have `requiresAction: false`.
5. Existing blocking checks (COO, warehouse) are unchanged and still pass their current tests.
6. Unit tests in `tests/sync-validation.test.ts` cover:
   - Invalid unit type value → warning returned
   - Unit type change detected → warning returned
   - Unit type unchanged and valid → no warning
   - Two products with same commodity/format/spec/organic → duplicate warning
   - Two products with same commodity/format but different spec → no warning
   - Three products in duplicate group → single warning (not two)
7. `npm test` passes with all new tests green.

---

## Canonical Unit Type Set

Define these as the valid values. Source: current inventory data patterns.

```ts
const CANONICAL_UNIT_TYPES = new Set([
  "Cases",
  "Lbs",
  "Kgs",
  "Pallets",
  "Drums",
  "Totes",
  "Bags",
  "Boxes",
  "MT",       // Metric Tonnes
]);
```

> **Note for agent:** Before finalising this list, run a quick check across `data/inventory.json` to find all distinct `unitType` values currently in use. Add any legitimate values found. The goal is to flag typos and genuine anomalies, not block valid unit types.

---

## Duplicate Detection Logic

Two products are "probable duplicates" if ALL of the following match:
- `commodity` (case-insensitive)
- `format` (case-insensitive)
- `specification` — both null, or both non-null and equal (case-insensitive)
- `organic` (boolean match)

A `variety` difference is NOT sufficient to exclude them from duplicate consideration — variety should ideally be a field within the same product, not a separate product ID.

Group duplicates and produce one warning per group (not one per pair).

---

## Files to Touch

| File | Change |
|------|--------|
| `lib/sync.ts` | Add unit type check and duplicate check inside `validateBusinessRules()`. Add `CANONICAL_UNIT_TYPES` constant (or import from new file). |
| `tests/sync-validation.test.ts` | New test file. Tests for both new checks. Mock `../lib/db` if needed. |

Do **not** modify:
- `lib/inventory.ts` — types are fine as-is
- `scripts/sync-inventory.ts` — no changes needed
- `data/exclusion-rules.json` — not the right place for these rules

---

## Test File Bootstrap

```ts
import { describe, it, expect } from "vitest";
// validateBusinessRules is not currently exported — check if it needs to be exported
// or test via a wrapper. If it is not exported, export it from lib/sync.ts first.
import { validateBusinessRules } from "../lib/sync";
import type { Product } from "../lib/inventory";

// Minimal product fixture
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "apple-iqf",
    product: "Apple IQF",
    commodity: "Apple",
    category: "Frozen",
    format: "IQF",
    processType: "Frozen",
    specification: null,
    variety: null,
    grade: null,
    organic: false,
    certifications: [],
    packSize: "20 lb",
    unitType: "Cases",
    listings: [],
    ...overrides,
  } as Product;
}
```

---

## Definition of Done

- [ ] `validateBusinessRules()` is exported (or a thin exported wrapper exists for testing)
- [ ] Unit type canonical check implemented and tested
- [ ] Unit type change-detection implemented and tested
- [ ] Duplicate product detection implemented and tested
- [ ] All 7 acceptance criteria pass
- [ ] `npm test` green
- [ ] `npx tsc --noEmit` clean
