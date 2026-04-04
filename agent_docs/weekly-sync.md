# Weekly Inventory Sync

Each week, the user provides ERP inventory data. The **preferred** method is uploading a CSV or Excel file; the fallback is pasting raw pivot table text.

### File Upload Path (Preferred)

1. **Upload** — User drags a `.csv`, `.xlsx`, or `.xls` file onto the agent chat
2. **Import** — Claude calls `import_inventory_file` which runs the file through the import pipeline: parses rows, applies exclusion rules, normalizes warehouses/suppliers, and writes `data/inventory-proposed.json` (plus `data/import-review.json` for soft-excluded items)
3. **Review stats** — Claude presents import stats (products, weight, exclusions, warnings) and review items
4. **Diff** — Claude runs `computeDiff()` from `lib/sync.ts` to compare proposed vs current `data/inventory.json`
5. **Resolve warnings** — User confirms COO for new suppliers, city/state for new warehouses, etc.
6. **Apply** — `apply_sync` (or `npm run sync` from CLI):
   - Snapshots current `inventory.json` → `data/snapshots/inventory-YYYY-MM-DD.json`
   - Overwrites `inventory.json` with approved data
   - Re-seeds SQLite (preserving documents + users)
   - Regenerates `suppliers.md` and `warehouses.md`
7. **Reconcile** — Claude presents a per-product totals table (quantity + weight) for the user to cross-check against the raw ERP data. Sync is not complete until reconciliation is signed off.

### Paste Path (Fallback)

1. **Parse** — Claude parses the raw pivot table into structured inventory (using `suppliers.json` and `warehouses.json` for auto-resolution of COO, city/state)
2. **Write proposed** — Claude writes the parsed data to `data/inventory-proposed.json`
3. Steps 4–7 same as file upload path above.

### Key files
- `lib/sync.ts` — Diff engine, business rule validation, report formatting, reconciliation
- `lib/excel-import.ts` — Excel/CSV import parser (`importExcel()` for file paths, `importFromBuffer()` for in-memory buffers), exclusion engine, warehouse/supplier normalization
- `lib/agent-tools.ts` — `import_inventory_file` tool (calls `importFromBuffer()` for agent file uploads)
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
