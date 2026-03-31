# Discount & Clearance Inventory

A separate inventory section for discounted stock — insurance claims, expired items, overstock, damaged goods. These items live independently from the main weekly sync.

## Data Model

- **`data/discount-inventory.json`** — Persistent JSON file for discount items (source of truth for fresh installs).
- **`discount_items`** SQLite table — Runtime storage, **preserved during weekly sync**.
- Each discount item has: product details, warehouse/supplier/COO, quantity/weight, reason, notes, asking price, and status.
- `productId` is **optional** — links to a main inventory product when the stock overlaps, null for standalone items.
- `status`: `active` (on the public page), `sold` (soft-deleted), `missing` (flagged during sync validation).
- `reason` categories: `insurance-claim`, `expired`, `overstock`, `damaged`, `other`.
- `askingPrice` is a free-form string (e.g., "$0.45/lb", "Make Offer") — this is the **exception** to the "always show Inquire" rule for regular inventory.

## Entry Methods

1. **Lot Picker (Admin UI)**: `/admin/discount` (requires `reviewer` role) — select a product, check the lots to move, set reason/notes/price with per-lot overrides, submit. Uses `POST /api/discount/batch` with `addDiscountItemsFromLots()`.
2. **Claude via chat**: User describes the discount item → Claude calls `addDiscountItem()` or `addDiscountItemsFromLots()` from `lib/discount.ts`.

## Lot-Level Deduction

Discount items are **full lot-level moves** — the specified lot is removed from regular inventory so it only appears in the Discount & Clearance section.

**Immediate deduction:** When a discount item is created, `deductDiscountLots()` runs immediately. The lot is removed from SQLite right away — no sync needed.

**Sync deduction:** During `npm run sync` or `npm run seed`, the deduction re-runs after the ERP data is loaded (since the ERP re-sends the same lots each week):
1. Finds all active discount items with both `productId` AND `lotNumber`
2. Looks up the matching lot in the `lots` table
3. **Deletes the lot** from regular inventory (lots, lot_contracts, document_lots)
4. **Subtracts** the lot's quantity and weight from the parent listing
5. If a listing has no remaining lots and zero quantity → **removes the listing**
6. If a product has no remaining listings → **removes the product** from the public page

**Duplicate guard:** A lot that is already in active discount cannot be added again.

**Restoration:** `restoreToInventory()` permanently deletes the discount item and immediately re-inserts the lot into regular inventory from `inventory.json` — all within a single transaction.

**Claude chat workflow for lot moves:**
- User says: "Move lot 0000748642 from Banana IQF to discount — insurance claim, asking $0.30/lb"
- Claude looks up the lot data (quantity, weight, BBD, contracts) from current inventory
- Claude creates the discount item with `productId`, `lotNumber`, and all lot details
- The lot is **immediately deducted** from regular inventory

## Weekly Sync Validation

After deduction, the sync validates remaining active discount items:
- **Lot-linked items** (`productId` + `lotNumber`): If the lot wasn't found in the ERP data, status is set to `missing`.
- **Product-linked items** (no `lotNumber`): Checks if the product + warehouse/supplier listing still exists. If not found, status is set to `missing`.
- **Standalone items** (`productId` null): Checks for overlap with regular inventory. Flags overlaps for review.

## Public Display

- Discount items appear on the main inventory page as a collapsible **"Discount & Clearance"** section with amber/gold accent, below the main format groups (IQF, JC, Puree).
- Section is **collapsed by default** and **hidden when empty**.
- Not included in the main filter dropdowns or inventory stats.
- Reason badges are color-coded: Insurance Claim (blue), Expired (amber), Overstock (gray), Damaged (red).

## Key Files

- `lib/discount.ts` — Types, CRUD functions, JSON sync, validation logic
- `data/discount-inventory.json` — Persistent JSON data
- `app/api/discount/route.ts` — GET/POST endpoints (auth required)
- `app/api/discount/[id]/route.ts` — GET/PATCH/DELETE endpoints (auth required)
- `app/api/discount/batch/route.ts` — Batch lot-to-discount endpoint (auth required)
- `app/admin/discount/` — Lot picker UI (layout, page, DiscountFormClient)
- `components/DiscountSection.tsx` — Public display component
