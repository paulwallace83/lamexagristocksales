# Weekly Inventory Sync

Each week, the user pastes raw pivot table data in chat. Claude processes it through this workflow:

1. **Parse** — Claude parses the raw pivot table into structured inventory (using `suppliers.json` and `warehouses.json` for auto-resolution of COO, city/state)
2. **Write proposed** — Claude writes the parsed data to `data/inventory-proposed.json`
3. **Diff** — Claude runs `computeDiff()` from `lib/sync.ts` to compare proposed vs current `data/inventory.json`
4. **Present report** — Claude shows additions, removals, changes, and any warnings (missing COO, unknown warehouses, etc.)
5. **Resolve warnings** — User confirms COO for new suppliers, city/state for new warehouses, etc.
6. **Apply** — `npm run sync` (runs `scripts/sync-inventory.ts`):
   - Snapshots current `inventory.json` → `data/snapshots/inventory-YYYY-MM-DD.json`
   - Overwrites `inventory.json` with approved data
   - Re-seeds SQLite (preserving documents + users)
   - Regenerates `suppliers.md` and `warehouses.md`
7. **Reconcile** — Claude presents a per-product totals table (quantity + weight) for the user to cross-check against the raw pivot data. Sync is not complete until reconciliation is signed off.

### Key files
- `lib/sync.ts` — Diff engine, business rule validation, report formatting, reconciliation
- `lib/excel-import.ts` — Excel import parser, exclusion engine, warehouse/supplier normalization
- `scripts/sync-inventory.ts` — Apply script (snapshot → overwrite → doc-preserving seed → regen reference files)
- `scripts/import-excel.ts` — CLI script for importing raw ERP Excel exports
- `scripts/seed.ts` — Full destructive seed for fresh installs only (clears documents + users)
- `data/exclusion-rules.json` — Configurable hard/soft exclusion rules for Excel import filtering
- `data/snapshots/` — Timestamped backups of previous `inventory.json` (gitignored)

## Pivot Table Row Structure

When inventory is pasted from the pivot table, the hierarchical rows break down as:

1. **Row 1** — Stock Description (product name)
2. **Row 2** — Warehouse location
3. **Row 3** — Customer name — **ALWAYS STRIP THIS. Never include customer names in inventory output, emails, or the web page.** This is confidential sales data.
4. **Row 4** — Supplier + Contract number

## Excel Import (Alternative to Paste)

Instead of pasting pivot table data, the user can provide a raw Excel export from the ERP system.

```
npm run import-excel -- <path-to-xlsx>
```

**Workflow:**
1. User provides raw ERP Excel export (all stock data, 63 columns)
2. `npm run import-excel` parses it, applies exclusion rules, writes `data/inventory-proposed.json`
3. Script prints reconciliation report — user verifies totals against their ERP
4. Soft-excluded items written to `data/import-review.json` for user review
5. User tells Claude which review items to include/exclude
6. Existing sync workflow takes over: `computeDiff()` → review → `npm run sync`

### Exclusion Rules (`data/exclusion-rules.json`)

**Hard exclusions** (always filtered, never public):
- Trader Joe's stock — customer contains "TRADER JOES"
- Sam's Club stock — customer contains "SAM'S WEST"
- Scoopable Acai for PFG — product "Scoopable Acai" + customer "PERFORMANCE FOOD GROUP"
- Branded/private-label products — description contains "Trader Joe's -", "Member's Mark -", etc.
- Zero/negative weight rows

**Soft exclusions** (presented to user for case-by-case review):
- Direct-customer stock — named customers (Kraft, Zentis, etc.) not tagged "SOLD TO BULK STOCK"
- Reserved stock

**Sensitive fields** (NEVER included in any output):
- All pricing, costs, finance columns
- Customer names, trader codes, logistics contacts, internal refs

### Column Mapping (Excel → Inventory JSON)

| Excel Column | Maps To |
|---|---|
| `Stock_Description` | Parsed into product name, commodity, format, specification |
| `Stock_Specification` | Additional spec + organic indicators |
| `Stock_Contract` | `listing.contracts[]` |
| `Stock_Contract_Supplier` | `listing.supplier` (with trading company rule) |
| `Stock_Cold_Store` | `listing.warehouse` (normalized to `warehouses.json`) |
| `Stock_Origin_Country` | `listing.countryOfOrigin` (normalized) |
| `Stock_ArrivalDate` | `listing.arrived` (Excel serial → ISO date) |
| `Stock_BestBefore` | `listing.minBBD` |
| `Qty_Cases` | `listing.quantity` |
| `Qty_Weight_Net_Bal` | `listing.weightLbs` — **canonical weight field**; matches ERP total across all statuses |
| `SML_LotNumber` | `lot.lotNumber` |

### Reconciliation Target

The ERP reconciliation figure is the sum of `Qty_Weight_Net_Bal` across **all rows** (all statuses, all customers). The import script prints a breakdown of included + review + hard-excluded weights that must add up to this total.

### Non-Inventory Patterns

Rows with descriptions matching `nonInventoryPatterns` in `exclusion-rules.json` are silently dropped (zero weight, not counted in any reconciliation bucket). Current patterns:
- `"DFRM "` — prepayment/finance rows from Teno Norte, not true stock

## Import Review Portal

After running `npm run import-excel`, soft-excluded items are written to `data/import-review.json`. The review portal lets authorised traders approve or reject these items interactively.

- **`/review`** — Interactive review dashboard (requires `reviewer` role)
- **`/qa/login`** — Shared login page; redirects to `/review` for reviewer role, `/qa` for qa role
- **`/api/review/apply`** — POST endpoint that merges approved items into `inventory-proposed.json` and deletes `import-review.json`

**Review Workflow:**
1. Run `npm run import-excel -- <path>` — writes `data/import-review.json`
2. Open `/review` (login with reviewer credentials)
3. Check/uncheck items — running totals (units + lbs) update live
4. Click **Apply Selected** — approved items merged into `inventory-proposed.json`, review file cleared
5. Continue with normal sync: `computeDiff()` → review → `npm run sync`

### Key Files
- `app/review/page.tsx` — Server component reads `import-review.json`, groups by customer
- `app/review/ReviewClient.tsx` — Client component with checkbox UI and submit
- `app/review/layout.tsx` — Auth guard (reviewer role only)
- `app/api/review/apply/route.ts` — Merge logic with file lock, atomic write, input validation
- `app/api/auth/redirect/route.ts` — Role-based post-login redirect

## Reference Files

- **[warehouses.md](../warehouses.md)** — Master list of all warehouses. Auto-regenerated by `npm run sync`. Do not edit manually.
- **[suppliers.md](../suppliers.md)** — Master list of all suppliers with COO and products. Auto-regenerated by `npm run sync`. Do not edit manually. Used by Claude to auto-resolve COO for known suppliers.
- **[warehouses.json](../data/warehouses.json)** — Authoritative warehouse data (edit to add/modify).
- **[suppliers.json](../data/suppliers.json)** — Authoritative supplier data with COO and trading company flags (edit to add/modify).

### Trading Company Rule
**Unitrade International (HK)** and **Pacific Jade International Inc** are trading companies that source from multiple manufacturers in China. When displaying inventory, list the **Supplier as "Various"** (not the trading company name). COO remains "China".
