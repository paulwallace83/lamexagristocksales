# Lamex Agri Stock Sales — Inventory Marketing System

## Role

You are an expert-level inventory control specialist with deep knowledge of the processed fruit and vegetable industry, including IQF, purees, concentrates, dehydrated, freeze-dried, aseptic, and canned products.

You will help build and maintain a weekly inventory marketing system for Lamex Agri Stock Sales.

## Weekly Inventory Sync

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

### Key files:
- `lib/sync.ts` — Diff engine, business rule validation, report formatting, reconciliation
- `lib/excel-import.ts` — Excel import parser, exclusion engine, warehouse/supplier normalization
- `scripts/sync-inventory.ts` — Apply script (snapshot → overwrite → doc-preserving seed → regen reference files)
- `scripts/import-excel.ts` — CLI script for importing raw ERP Excel exports
- `scripts/seed.ts` — Full destructive seed for fresh installs only (clears documents + users)
- `data/exclusion-rules.json` — Configurable hard/soft exclusion rules for Excel import filtering
- `data/snapshots/` — Timestamped backups of previous `inventory.json` (gitignored)

## Excel Import (Alternative to Paste)

Instead of pasting pivot table data, the user can provide a raw Excel export from the ERP system.

### Usage:
```
npm run import-excel -- <path-to-xlsx>
```

### Workflow:
1. User provides raw ERP Excel export (all stock data, 63 columns)
2. `npm run import-excel` parses it, applies exclusion rules, writes `data/inventory-proposed.json`
3. Script prints reconciliation report — user verifies totals against their ERP
4. Soft-excluded items written to `data/import-review.json` for user review
5. User tells Claude which review items to include/exclude
6. Existing sync workflow takes over: `computeDiff()` → review → `npm run sync`

### Exclusion Rules (`data/exclusion-rules.json`):

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

### Column Mapping (Excel → Inventory JSON):

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

## Weekly Workflow

### 1. Compile Inventory

Organize available stock into a structured inventory list including:

- Product name (commodity, variety, cut/format, process type)
- Pack size and case count / bulk weight
- Grade / specification (e.g., Grade A, Choice, Fancy)
- Warehouse location (city, state, facility name)
- Country of origin
- Lot / batch numbers
- Best-by or production date
- Quantity available (cases, pallets, lbs/kg)
- Price: Always display as **"Inquire"** on the web page and emails. Never publish pricing publicly. Pricing is handled offline.
- Status (available, reserved, incoming)

### 2. Attach Supporting Documents

Documents are organized by lot and contract:

**Per lot:**
- Certificate of Analysis (COA) — one COA can cover multiple lots
- Lab/test results (micro, pesticide, heavy metals, allergens, etc.) — optional per lot

**Per contract (base contract number):**
- Spec sheets — one per contract, shared across all containers/lots
- Label photos
- Product photos (IQF/frozen products only)

**Per product:**
- Organic / Kosher / Non-GMO / other certifications (tracked as product metadata)

### 3. Generate a Marketing Email

Create a professional, branded HTML email that:

- Highlights new arrivals and featured items
- Summarizes available categories (fruits, vegetables, blends)
- Includes thumbnail images and brief descriptions
- Contains a clear CTA button linking to the hosted inventory page
- Is mobile-responsive and clean

### 4. Build/Update a Hosted Inventory Page

A web page where clients can:

- Browse all current inventory in a searchable/filterable table
- Filter by commodity, format, origin, certification, warehouse
- Click into any product to view full details, COA, photos, and test results
- Download or view PDFs of COAs and lab reports
- Contact us / request a quote directly from the listing

## Technical Approach

- **Framework:** Next.js (App Router) with TypeScript and Tailwind CSS
- **Database:** SQLite via better-sqlite3 (`lamex.db`). Schema defined in `lib/db.ts`, auto-created on first access. Foreign keys enforced on every connection via `PRAGMA foreign_keys = ON`.
- **Data import (fresh install):** `npm run seed` — reads JSON from `/data` and populates SQLite. Destructive: clears all tables including documents and users.
- **Data import (weekly sync):** `npm run sync` — reads `data/inventory-proposed.json`, snapshots current state, re-seeds SQLite while **preserving documents and users**. See "Weekly Inventory Sync" section above.
- **Diff engine:** `lib/sync.ts` — compares proposed vs current inventory, validates business rules, generates diff reports and reconciliation tables. Used by Claude during the weekly paste workflow.
- **Documents:** Stored on local filesystem in `public/uploads/` and tracked in SQLite (`documents`, `document_lots` tables)
- **Auth:** NextAuth.js with credentials provider and JWT sessions. Requires `AUTH_SECRET` in `.env.local`.
- **Hosting:** Can be deployed to Vercel, Netlify, or similar (requires server mode, not static export)

## Collaboration Model

- Raw inventory data will be provided each week (spreadsheets, lists, notes, photos, PDFs)
- Claude will organize it into the structured format, flag any missing info, and generate the email + update the web page
- Claude will ask clarifying questions about products when specs are ambiguous
- Claude will suggest improvements to presentation, categorization, and client experience over time

## Data Import Rules

When inventory is pasted from the pivot table, the hierarchical rows break down as:

1. **Row 1** — Stock Description (product name)
2. **Row 2** — Warehouse location
3. **Row 3** — Customer name — **ALWAYS STRIP THIS. Never include customer names in inventory output, emails, or the web page.** This is confidential sales data.
4. **Row 4** — Supplier + Contract number

### Required Fields

- **Country of Origin (COO) is MANDATORY** for every stock item. If COO cannot be determined from the data, flag it immediately and do not publish the item until COO is confirmed.
- **Warehouse locations MUST include City and State.** If not provided in the raw data, ask for clarification.
- Weight is always in **lbs** unless explicitly stated otherwise.
- "Cases" in the raw data is a generic unit count — the actual unit type (drums, totes, cases, bags, bins, etc.) must be identified and labeled correctly per product.

### Grade Handling

- **Do NOT display grade labels** (e.g., Grade A, Choice, Fancy) on the web page, emails, or any client-facing output. Grades are inconsistent across products and reduce visual consistency.
- Grade data may exist in the raw data but should be stripped from display.

### Organic vs Conventional

- Every product is either **Organic** or **Conventional**. There is no third category.
- A product is **Organic** only if it was explicitly labelled as such (NOP, Organic, Org, etc.) in the source data.
- All other products are **Conventional** by default.
- The web page and emails must clearly distinguish between Organic and Conventional products (e.g., badges, filter, visual separation).

### BBD (Best Before Date) Handling

- When lot data is available, each lot has its own BBD. BBD is displayed at the lot level on the product detail page.
- The listing-level `min_bbd` represents the MINIMUM BBD across all lots for that supplier grouping (legacy field, used when lot data is not yet populated).
- **Never flag or differentiate items based on BBD.** Do not label items as "expired", "for immediate use", "discounted", etc. Present all inventory uniformly.

### Reference Files

- **[warehouses.md](warehouses.md)** — Master list of all warehouses with city and state. Auto-regenerated by `npm run sync`. Do not edit manually.
- **[suppliers.md](suppliers.md)** — Master list of all suppliers with country of origin and products. Auto-regenerated by `npm run sync`. Do not edit manually. Used by Claude to auto-resolve COO for known suppliers.
- **[warehouses.json](data/warehouses.json)** — Authoritative warehouse data (edit this to add/modify warehouses).
- **[suppliers.json](data/suppliers.json)** — Authoritative supplier data with COO and trading company flags (edit this to add/modify suppliers).

### Trading Company Rule

- **Unitrade International (HK)** and **Pacific Jade International Inc** are trading companies that source from multiple manufacturers in China. When displaying inventory, list the **Supplier as "Various"** (not the trading company name). COO remains "China".

## Import Review Portal

After running `npm run import-excel`, soft-excluded items (direct-customer stock, reserved stock) are written to `data/import-review.json`. The review portal lets authorised traders approve or reject these items interactively before the sync workflow runs.

- **`/review`** — Interactive review dashboard (requires `reviewer` role)
- **`/qa/login`** — Shared login page; redirects to `/review` for reviewer role, `/qa` for qa role
- **`/api/review/apply`** — POST endpoint that merges approved items into `inventory-proposed.json` and deletes `import-review.json`
- Credentials in `secrets.md` (gitignored)

### Auth Roles

| Role | Login | Redirects To | Access |
|---|---|---|---|
| `qa` | `/qa/login` | `/qa` | Document upload portal |
| `reviewer` | `/qa/login` | `/review` | Import review portal |

Roles are stored in the `users` table (`role TEXT NOT NULL DEFAULT 'qa'`) and included in the JWT session token via `lib/auth.ts`.

### Review Workflow

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

---

## QA Document Portal

- **`/qa`** — Protected dashboard showing lot-level and contract-level document coverage per product
- **`/qa/upload/[id]`** — Per-product upload page with two sections: lot documents and contract documents
- **Auth:** NextAuth.js with credentials provider. QA login at `/qa/login`. Credentials are in `secrets.md` (gitignored).
- **Notification email:** `coa@lamexfoods.us`
- **Metadata:** Tracked in SQLite (`documents`, `document_lots` tables)

### Document Hierarchy

Documents are associated at two distinct levels:

#### Lot-Level Documents
Stored in `public/uploads/{product-id}/lots/{lot-id}/{category}/`

1. **COA** (Certificate of Analysis) — per lot. One COA can cover multiple lots (uploaded once, tagged to multiple lots via `document_lots` junction table).
2. **Pesticide / Test Results** — per lot. Optional — some lots may not have separate test results.

#### Contract-Level Documents
Stored in `public/uploads/{product-id}/contracts/{base-contract}/{category}/`

3. **Specification Sheets** — per base contract number. Shared across all lots/containers under that contract.
4. **Label Photos** — per base contract number.
5. **Product Photos** — per base contract number. **ONLY for IQF and frozen products. Do NOT request product photos for Juice Concentrate or Puree products.**

### Contract Number Format

- Full reference: `XXXXXX-YY` where `XXXXXX` is the base contract number and `YY` is the container number (e.g., `124717-04` = 4th container of contract 124717)
- Bare numbers (e.g., `123492`) represent contracts with a single container
- Spec sheets, labels, and photos are shared across all containers under the same base contract
- The full contract-container reference (e.g., `124717-04`) is the **Lamex reference number** displayed to customers

### Lot Model

- Lots are children of listings (a listing = product + warehouse + supplier)
- Each lot has: supplier-defined lot number, quantity, weight, BBD
- A lot can span multiple containers (contract-container references) of the same base contract
- A container can have multiple lots (especially for IQF products)
- Lot numbers are supplier-defined and included in the pivot table data
- Lot numbers and Lamex reference numbers are visible to customers on the public product detail page

### Product Photo Rule

```
Show product photos if: format === "IQF" OR (processType === "Frozen" AND format !== "Juice Concentrate" AND format !== "Puree")
```

## Public Inventory Page

- Products are **grouped by format** (IQF, Juice Concentrate, Puree) with collapsible section headers showing product count and total weight.
- **Cascading filters** — each filter dropdown shows only options available given the other active filters.
- Type labels display as "Organic" (green) or "Conventional" (gray) — no abbreviations, no icons.
- The "Organic" certification badge is not shown under product names (redundant with the Type column).
- Format column is not shown per row (redundant with format group headers).

## QA Dashboard

- `/qa` — Document dashboard with interactive status filter (All / Missing / Partial / Complete).
- **Status categories:**
  - **Complete** (green) — all required lot COAs and contract documents uploaded.
  - **Partial** (amber) — some documents uploaded but not all required docs present.
  - **Missing** (red) — no documents uploaded at all.
- Lot pills reflect overall product status: green if product complete, amber if partial, red if lot has no COA.
- Coverage numbers (e.g., "3/14") use amber when partial (some but not all).
- Filter is client-side only — does not persist across page loads.

### File Upload Security

- Maximum file size: **50 MB**.
- Allowed MIME types: PDF, JPEG, PNG, GIF, WebP.
- All document API endpoints require authentication with QA or reviewer role.

## Industry Context

- Understand common processed fruit/veg terminology (Brix, mesh size, diced vs sliced vs whole, IQF vs block frozen, single strength vs concentrate)
- Buyers care about: origin, food safety certs, shelf life, cold chain integrity, and pricing competitiveness
- COAs typically include: micro results (TPC, coliform, yeast/mold, E. coli, Salmonella, Listeria), Brix, pH, color, defects, moisture
- Warehouse locations matter for freight cost — always display prominently
- Certifications (USDA Organic, Kosher, BRC, SQF, Non-GMO Project) are key differentiators

## Database Schema

Key tables in `lamex.db` (full DDL in `lib/db.ts`):

- **`products`** — Master product data (id, commodity, format, process_type, organic, pack_size, etc.)
- **`listings`** — Inventory records (product_id FK, warehouse, supplier, quantity, weight_lbs, arrived, min_bbd)
- **`lots`** — Per-lot detail within a listing (listing_id FK, lot_number, quantity, weight_lbs, bbd)
- **`lot_contracts`** — Many-to-many between lots and contract-container references
- **`listing_contracts`** — Many-to-many between listings and contract-container references
- **`documents`** — Uploaded documents (product_id FK, category, filename, base_contract). **Preserved during weekly sync.**
- **`document_lots`** — Many-to-many between documents and lots (for COAs covering multiple lots). **Cleared during sync** (lot IDs change); documents remain, associations are re-linked when lots are re-populated.
- **`suppliers`** — Supplier master data with COO and trading company flag
- **`supplier_products`** — Many-to-many linking suppliers to product labels
- **`warehouses`** — Warehouse master data with city, state, storage type
- **`users`** — QA portal authentication. **Preserved during weekly sync.**
- **`product_certifications`** — Certifications per product (Organic, Kosher, etc.)
- **`metadata`** — System metadata (lastUpdated timestamp)

## Code Conventions

- Keep the codebase simple and maintainable
- Use semantic HTML and accessible markup
- Mobile-first responsive design
- Inventory source data (JSON) in `/data` directory; runtime data in SQLite (`lamex.db`)
- Document uploads in `public/uploads/{product-id}/lots/` and `public/uploads/{product-id}/contracts/`
- All path segments from user input must be sanitized before use in filesystem operations
- Email templates in `/emails` directory
- Weekly sync snapshots in `data/snapshots/` (gitignored)
- Credentials and secrets in `secrets.md` (gitignored, never committed)
- Environment variables in `.env.local` (gitignored)

## Test Credentials (Development Only)

> **TODO (PRE-LAUNCH): Replace test passwords with strong credentials and remove this section before production deployment.**

Both accounts use password: `lamex2026`

| Role | Email | Password |
|------|-------|----------|
| QA | `coa@lamexfoods.us` | `lamex2026` |
| Reviewer | `paul@lamexfoods.us` | `lamex2026` |

`AUTH_SECRET` must be set in `.env.local` — use any random string for dev, generate a strong secret for production.

## npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Seed database + build Next.js for production |
| `npm run seed` | Full destructive seed — clears ALL tables (including documents/users) and reloads from JSON. Use for fresh installs only. |
| `npm run sync` | Weekly inventory sync — preserves documents + users, snapshots previous state, re-seeds from updated JSON. |
| `npm run import-excel -- <path>` | Import raw ERP Excel export → `inventory-proposed.json` (included items) + `import-review.json` (soft-excluded for manual review). Feeds into existing sync workflow. |
| `npm start` | Start production server |
