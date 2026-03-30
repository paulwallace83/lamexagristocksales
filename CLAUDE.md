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
- **Documents:** Stored on filesystem and tracked in SQLite (`documents`, `document_lots` tables). Served via `GET /api/files/[...path]` route. Storage root determined by `RAILWAY_VOLUME_PATH` env var (falls back to `public/uploads/` locally).
- **Persistent data paths:** All runtime data (database, uploads, agent temp files) routed through `lib/paths.ts` which checks `RAILWAY_VOLUME_PATH` for production deployment.
- **Auth:** NextAuth.js with credentials provider and JWT sessions. Requires `AUTH_SECRET` in `.env.local`.
- **Hosting:** Railway with persistent volume. Domain: `www.lamexagrifoodsinventory.com`.

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
- **Do not label items as "expired", "for immediate use", "discounted", etc. based on BBD.** Past-BBD dates are highlighted with an amber label on product detail pages for buyer awareness, but no status language or removal logic is applied. Present all inventory uniformly in listings and emails.

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
- **COA auto-extraction:** When a COA is uploaded, Claude Haiku vision automatically extracts measurable parameters (brix, acidity, color, etc.) and stores them in the `coa_data` table. Extraction is fire-and-forget — the upload succeeds immediately. See the "COA Key Aspects" section for details.

### Document Hierarchy

Documents are associated at two distinct levels:

#### Lot-Level Documents
Stored in `{uploadsRoot}/{product-id}/lots/{lot-number}/{category}/` (locally: `public/uploads/...`, on Railway: `{RAILWAY_VOLUME_PATH}/uploads/...` — resolved via `lib/paths.ts`)

1. **COA** (Certificate of Analysis) — per lot. One COA can cover multiple lots (uploaded once, tagged to multiple lots via `document_lots` junction table).
2. **Pesticide / Test Results** — per lot. Optional — some lots may not have separate test results.

#### Contract-Level Documents
Stored in `{uploadsRoot}/{product-id}/contracts/{base-contract}/{category}/`

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

### Key Files

- `lib/documents.ts` — Document types, CRUD, status queries, upload directory resolution
- `lib/inventory.ts` — Core inventory types (Product, Listing, Lot, InventoryData)
- `lib/inventory-db.ts` — Query layer that reads products/listings/lots from SQLite
- `app/api/documents/[productId]/route.ts` — GET/DELETE document endpoints (auth required)
- `app/qa/page.tsx` — QA dashboard server component
- `app/qa/upload/[id]/page.tsx` — Per-product upload page

## COA Key Aspects

Extracted COA parameters (brix, acidity, color, clarity, ratio, defects, overripe, underripe, NTU, etc.) are displayed publicly on the product detail page next to each lot.

### Data Model

- **`coa_data`** table: `lot_id` (PK, FK → lots), `data` (JSON), `updated_at`, `updated_by`.
- `data` is a flexible JSON object — any key-value pair can be stored (e.g., `{"brix": 11.5, "color": "Light Amber"}`).
- Values are **single figures** (number or short string), never ranges.
- The field set is not fixed — unknown keys are title-cased automatically for display.

### Automatic Extraction

When a COA document is uploaded via `/api/upload` (QA portal) or via the agent's `upload_document`/`batch_upload_documents` tools, the file is sent to Claude Haiku vision (`claude-haiku-4-5-20251001`) for automatic parameter extraction. This happens fire-and-forget after the upload response — extraction failure does not block the upload. Works on both text-based PDFs and scanned images.

### Agent Tools

- `save_coa_data` — manually enter, correct, or supplement auto-extracted data. Requires `lotNumber`, `productId`, and `fields` (key-value object).
- `get_coa_backfill_status` — shows lots with COA documents on disk but no extracted `coa_data` row. Grouped by product with document and lot counts.
- `backfill_coa_data` — reads COA files from disk and re-extracts parameters via Claude Haiku vision. Document-centric: extracts once per unique document file, upserts to all linked lots. Accepts optional `lotNumbers` filter; processes up to 50 documents per call. `updatedBy` is set to `"backfill"`.

### Public Display

Product detail page (`app/product/[id]/page.tsx`) shows a third line below each lot's quantity/weight/BBD row with compact navy-tinted pills for each available parameter. Only populated fields are rendered.

### Sync Preservation

COA data is exported (with lot numbers) before the sync transaction, deleted alongside `document_lots`, and re-linked after re-seed by matching lot numbers — same pattern as `relinkDocumentLots()`.

### Key Files

- `lib/coa-data.ts` — Types, query, upsert, export/relink, display formatting
- `lib/coa-extract.ts` — Claude vision extraction function
- `lib/agent-db.ts` — `getCoaBackfillStatus()`, `getCoaBackfillDocuments()` query functions for backfill
- `app/api/upload/route.ts` — Auto-extraction hook for QA portal COA uploads
- `lib/agent-tools.ts` — `save_coa_data`, `get_coa_backfill_status`, `backfill_coa_data` tool definitions and execution; auto-extraction hook for agent COA uploads (single and batch)
- `app/product/[id]/page.tsx` — Public display in `LotRow` component

## Public Inventory Page

- Products are **grouped by format** (IQF, Juice Concentrate, Puree) with collapsible section headers showing product count and total weight.
- **Cascading filters** — each filter dropdown shows only options available given the other active filters.
- Type labels display as "Organic" (green) or "Conventional" (gray) — no abbreviations, no icons.
- The "Organic" certification badge is not shown under product names (redundant with the Type column).
- Format column is not shown per row (redundant with format group headers).

## QA Dashboard

- `/qa` — Document dashboard with interactive status filter (All / Missing / Partial / Complete).
- **Organic/Conventional labels** shown inline next to each product name (green for Organic, gray for Conventional).
- **Status categories:**
  - **Complete** (green) — all required lot COAs and contract documents uploaded.
  - **Partial** (amber) — some documents uploaded but not all required docs present.
  - **Missing** (red) — no documents uploaded at all.
- **Columns:** Product, Lot COAs, Heavy Metals, Pesticide, Contract Specs, Contract Labels, Contract Photos, Status, Action.
- **Heavy Metals column** — shows lot coverage for Juice Concentrate products (expected: heavy metal test per lot). Shows "N/A" for other product types.
- **Pesticide column** — shows lot coverage for Organic products (expected: pesticide test per lot). Shows "N/A" for non-organic products. Juice Concentrate products show heavy metals instead (even if organic).
- Lot pills reflect overall product status: green if product complete, amber if partial, red if lot has no COA.
- Lot pills show `BBD: YYYY-MM-DD` — expired BBDs highlighted in amber, matching the public product detail page.
- Coverage numbers (e.g., "3/14") use amber when partial (some but not all).
- Filter is client-side only — does not persist across page loads.
- **Expand-to-view documents:** Click any product row chevron (▶) to expand an inline panel showing all uploaded documents grouped by category (COA, Test Results, Specs, Labels, Photos). Documents are lazy-loaded from `GET /api/documents/{productId}` and cached client-side. Each document shows filename (clickable link), lot number, BBD (with amber highlight if expired), and contract reference. Products with no documents show "No documents uploaded" with a link to the upload page. Only one product can be expanded at a time.

### File Upload Security

- Maximum file size: **50 MB**.
- Allowed MIME types: PDF, JPEG, PNG, GIF, WebP.
- All document API endpoints require authentication with QA or reviewer role.

## Discount & Clearance Inventory

A separate inventory section for discounted stock — insurance claims, expired items, overstock, damaged goods. These items live independently from the main weekly sync.

### Data Model

- **`data/discount-inventory.json`** — Persistent JSON file for discount items (source of truth for fresh installs).
- **`discount_items`** SQLite table — Runtime storage, **preserved during weekly sync** (same pattern as `documents` and `users`).
- Each discount item has: product details, warehouse/supplier/COO, quantity/weight, reason, notes, asking price, and status.
- `productId` is **optional** — links to a main inventory product when the stock overlaps, null for standalone items.
- `status`: `active` (on the public page), `sold` (soft-deleted), `missing` (flagged during sync validation).
- `reason` categories: `insurance-claim`, `expired`, `overstock`, `damaged`, `other`.
- `askingPrice` is a free-form string (e.g., "$0.45/lb", "Make Offer") — this is the **exception** to the "always show Inquire" rule for regular inventory.

### Entry Methods

1. **Lot Picker (Admin UI)**: `/admin/discount` (requires `reviewer` role) — select a product, check the lots to move, set reason/notes/price with per-lot overrides, submit. All lot data (qty, weight, BBD, contracts) is auto-populated from the database. Uses `POST /api/discount/batch` with `addDiscountItemsFromLots()`.
2. **Claude via chat**: User describes the discount item → Claude calls `addDiscountItem()` or `addDiscountItemsFromLots()` from `lib/discount.ts`.

### Lot-Level Deduction

Discount items are **full lot-level moves** — the specified lot is removed from regular inventory so it only appears in the Discount & Clearance section.

**Immediate deduction:** When a discount item is created (via lot picker or Claude chat), `deductDiscountLots()` runs immediately. The lot is removed from SQLite right away — no sync needed.

**Sync deduction:** During `npm run sync` or `npm run seed`, the deduction re-runs after the ERP data is loaded (since the ERP re-sends the same lots each week):

1. Finds all active discount items with both `productId` AND `lotNumber`
2. Looks up the matching lot in the `lots` table
3. **Deletes the lot** from regular inventory (lots, lot_contracts, document_lots)
4. **Subtracts** the lot's quantity and weight from the parent listing
5. If a listing has no remaining lots and zero quantity → **removes the listing**
6. If a product has no remaining listings → **removes the product** from the public page

**Duplicate guard:** A lot that is already in active discount cannot be added again. The batch function checks for existing active discount items with the same `productId` + `lotNumber`.

**Restoration:** `restoreToInventory()` permanently deletes the discount item and immediately re-inserts the lot into regular inventory from `inventory.json` — all within a single transaction.

**Claude chat workflow for lot moves:**
- User says: "Move lot 0000748642 from Banana IQF to discount — insurance claim, asking $0.30/lb"
- Claude looks up the lot data (quantity, weight, BBD, contracts) from current inventory
- Claude creates the discount item with `productId`, `lotNumber`, and all lot details
- The lot is **immediately deducted** from regular inventory

### Weekly Sync Validation

After deduction, the sync validates remaining active discount items:

- **Lot-linked items** (`productId` + `lotNumber`): Handled by the deduction step. If the lot wasn't found in the ERP data, status is set to `missing`.
- **Product-linked items** (no `lotNumber`): Checks if the product + warehouse/supplier listing still exists. If not found, status is set to `missing`.
- **Standalone items** (`productId` null): Checks for overlap with regular inventory. Flags overlaps for review.
- Reports are printed to console during sync.

### Public Display

- Discount items appear on the main inventory page as a collapsible **"Discount & Clearance"** section with amber/gold accent, below the main format groups (IQF, JC, Puree).
- Section is **collapsed by default** and **hidden when empty**.
- Not included in the main filter dropdowns or inventory stats.
- Reason badges are color-coded: Insurance Claim (blue), Expired (amber), Overstock (gray), Damaged (red).

### Key Files

- `lib/discount.ts` — Types, CRUD functions, JSON sync, validation logic
- `data/discount-inventory.json` — Persistent JSON data
- `app/api/discount/route.ts` — GET/POST endpoints (auth required)
- `app/api/discount/[id]/route.ts` — GET/PATCH/DELETE endpoints (auth required)
- `app/api/discount/batch/route.ts` — Batch lot-to-discount endpoint (auth required)
- `app/admin/discount/` — Lot picker UI (layout, page, DiscountFormClient)
- `components/DiscountSection.tsx` — Public display component

## AI Assistant — Top Dog Paul's AI Brain (TDPAIB)

An embedded Claude-powered chat interface for QA and operations staff. Branded as "TDPAIB" (hover reveals full name). Accessible at `/admin/agent` — requires `qa` or `reviewer` role. Completely separated from the public customer view.

### Capabilities

- **Document matching:** Upload a COA, spec sheet, label, or product photo via drag-and-drop or file picker → Claude reads the document, extracts lot numbers / contract numbers / product names, proposes matches against inventory, and uploads after explicit user confirmation.
- **Batch document upload:** Drop multiple files (24+) at once → Claude reads all files, extracts lot/contract numbers, presents a single consolidated matching table, and uploads all after one confirmation. Uses `batch_lot_lookup` and `batch_upload_documents` tools to complete within 3–4 iterations regardless of file count.
- **Test result recognition:** Third-party lab reports (SGS, Eurofins, GFL, etc.) are automatically categorized as `test-results`, not `coa`, regardless of filename. If a supplier's COA contains HM/pesticide data, it stays as `coa` and the agent notes the test data is included.
- **Inventory queries:** Answer questions about current stock (including discount items in overview), document coverage (COA + test result gaps), and import review status.
- **Discount management:** Move lots to Discount & Clearance or restore them, via conversation.
- **COA data management:** Review, correct, or supplement auto-extracted COA parameters (brix, acidity, color, etc.) via `save_coa_data` tool. COA data is auto-extracted on upload but the agent can fix incorrect values or add missing fields.
- **COA data backfill:** Scan for COA documents that were uploaded before auto-extraction existed (or where extraction failed), and re-extract parameters in bulk. Uses `get_coa_backfill_status` to show scope, then `backfill_coa_data` to process up to 50 documents per call.
- **Import review:** View soft-excluded items from the last Excel import.
- **Markdown responses:** Agent output renders with full markdown support (tables, bold, headers, lists, blockquotes).
- **True streaming:** Responses stream token-by-token via the Anthropic streaming API.

### Test Result Rules

- Every **Juice Concentrate** lot should have a **heavy metal** test result.
- Every **Organic** product lot should have a **pesticide** test result.
- The QA dashboard shows separate **Heavy Metals** and **Pesticide** columns with per-lot coverage.
- The agent's `get_document_status` tool includes `expectedTest` and `missingTestLots` per product.

### Architecture

- Claude runs server-side via `@anthropic-ai/sdk` with streaming (`messages.stream()`), 17 tools (11 read-only, 6 action).
- Action tools (`upload_document`, `batch_upload_documents`, `create_discount_item`, `restore_discount_item`, `save_coa_data`, `backfill_coa_data`) require conversational confirmation from the user before execution — enforced via system prompt.
- COA auto-extraction fires on both single and batch uploads via the agent (same Claude Haiku vision pipeline as the QA upload route).
- Files are uploaded in-band with the chat message (multipart form data) and persisted to a per-user temp directory (`.agent-uploads/{user}/`) so they survive across conversation turns (auto-cleaned after 30 min).
- Responses stream via SSE with tool activity indicators. Max 10 tool-use iterations per request with a user-visible warning if the limit is reached.
- Requires `ANTHROPIC_API_KEY` in `.env.local`.

### Conversation Persistence

Agent chat sessions are saved to SQLite and survive page reloads.

- **Auto-save:** After each assistant response completes, the conversation is saved (fire-and-forget).
- **Conversation list:** Dropdown in the header bar shows recent conversations (up to 20) with relative timestamps.
- **Resume:** Click a conversation to reload the full message history and continue where you left off.
- **New chat:** "+" button clears state and shows starter prompts.
- **Delete:** Per-conversation delete from the history dropdown.
- **Storage:** Only `apiHistory` (plain `{role, content}` pairs) is persisted — tool events are transient.
- **File names:** Stored for display (file chips on user messages), but actual files use the 30-min temp system.
- **Ownership:** Conversations are scoped by user email — users can only see/modify their own.
- **Preserved during weekly sync** (`npm run sync`). **Cleared during full seed** (`npm run seed`).

### Key Files

- `lib/agent-db.ts` — Agent-specific DB queries (lot lookup, contract lookup, product search, sync info, test-result coverage)
- `lib/agent-tools.ts` — Tool definitions and server-side execution logic
- `lib/conversations.ts` — Conversation persistence CRUD (create, list, load, save messages, delete)
- `app/api/agent/chat/route.ts` — Streaming SSE endpoint with agentic tool-use loop (max 10 iterations)
- `app/api/agent/conversations/route.ts` — List + create conversation endpoints
- `app/api/agent/conversations/[id]/route.ts` — Get + delete conversation endpoints
- `app/api/agent/conversations/[id]/messages/route.ts` — Save messages endpoint
- `app/admin/agent/layout.tsx` — Auth guard (qa OR reviewer role), full-viewport fixed layout
- `app/admin/agent/page.tsx` — Server component shell
- `app/admin/agent/AgentChat.tsx` — Client chat UI with file attachments, drag-and-drop, streaming, and conversation persistence
- `app/admin/agent/MarkdownMessage.tsx` — Markdown renderer for assistant messages

### Security

- Auth required: `qa` or `reviewer` role (same as existing QA/admin pages)
- File validation: same 50 MB limit and MIME type checks as `/api/upload`
- Path traversal protection: same `getUploadDir()` + `resolve().startsWith()` pattern
- Per-user temp file isolation: uploaded files scoped by user email, auto-expire after 30 min
- Product existence validated before document upload
- Error messages sanitized — internal errors logged server-side, generic messages sent to client
- Link URL validation — only `http://` and `https://` URLs rendered as clickable links in markdown
- No public routes or links — the agent is invisible to customers
- Claude system prompt prohibits discussing customer names, pricing, or internal references
- Claude system prompt rule 9: must report tool errors to user (never silently claim success after a failed tool call)
- Fuzzy file matching in `upload_document`: when Claude invents a filename that doesn't match the `fileMap` key, the tool falls back to substring and lot-number matching. Path traversal is still enforced via `resolve().startsWith()` on the final filepath.
- Conversation message validation: role must be "user" or "assistant", content capped at 500KB, max 200 messages per save

### API Usage Tracking

Tracks per-request token usage and cost for the agent chat.

- **Token capture:** After each Anthropic API call in the tool loop, `input_tokens`, `output_tokens`, and cache tokens are accumulated. One `api_usage` row is recorded per user request (summing all iterations).
- **Cost calculation:** Server-side, using rates from `data/api-pricing.json`.
- **Stats bar:** Compact bar above the chat area showing daily/monthly/yearly call count and cost. Refreshes automatically after each response.
- **Pricing updates:** Run `npm run update-pricing` to fetch current rates from the Anthropic pricing docs page. Falls back gracefully if the page structure changes.
- **Preserved during weekly sync.** Cleared during full seed.

#### Key Files

- `data/api-pricing.json` — Per-model token rates (manually or script-updated)
- `scripts/update-pricing.ts` — Fetches and parses Anthropic pricing page
- `lib/api-usage.ts` — Record usage, calculate cost, query stats
- `app/api/agent/usage/route.ts` — GET stats endpoint
- `app/admin/agent/UsageStatsBar.tsx` — Stats bar component

## Marketing Email

Weekly HTML marketing emails sent to buyers via Resend, highlighting current inventory, new arrivals, and featured items.

### Workflow

1. **Auto-detection:** During `npm run sync`, new products (IDs in proposed but not in snapshot) are auto-flagged as `new_arrival` in the `product_flags` table.
2. **Compose:** Admin visits `/admin/email` (reviewer role only), sees all products with toggleable "New" and "Featured" badges.
3. **Preview:** Live email preview in an iframe (loads from `GET /api/email/preview`).
4. **Send:** Enter recipient emails (comma or newline separated), click Send. `POST /api/email/send` renders the HTML and dispatches via Resend.

### Product Flags

- `product_flags` SQLite table tracks `new_arrival` and `featured` flags per product.
- **Preserved during weekly sync** (not in the DELETE list).
- `new_arrival` flags are replaced each sync (old ones cleared, new ones set by sync script).
- `featured` flags are manual and persist across syncs.

### Email Template

- Self-contained HTML with inline CSS and table-based layout (Outlook compatible).
- Sections: navy header with logo, stats bar, new arrivals (green), featured items (blue), category summary by format, CTA button, footer.
- No product photos — text/badge layout only.
- Price always "Inquire".
- Rendered by `renderEmailHtml()` in `lib/email-template.ts`.

### Configuration

- `RESEND_API_KEY` in `.env.local` (required for sending).
- `NEXT_PUBLIC_SITE_URL` in `.env.local` (for CTA links and logo URL; defaults to `https://www.lamexagrifoodsinventory.com`).
- Branding constants in `emails/config.ts`.

### Key Files

- `emails/config.ts` — Branding constants (colors, logo URL, from address, default subject)
- `lib/product-flags.ts` — CRUD for product_flags table
- `lib/email-template.ts` — HTML email renderer
- `lib/email-send.ts` — Resend sending wrapper
- `app/admin/email/` — Admin composer UI (layout, page, EmailComposerClient)
- `app/api/email/flags/route.ts` — GET/POST product flags
- `app/api/email/preview/route.ts` — GET rendered email HTML
- `app/api/email/send/route.ts` — POST send via Resend

## Document Request Workflow

COA, test results, and specification sheets are **restricted** — not publicly downloadable. Customers see availability badges on product pages. Document requests are integrated into the unified product enquiry flow — not a separate form.

### Restricted Categories

- `coa` — Certificates of Analysis
- `test-results` — Heavy metals, pesticide, and other lab reports
- `specs` — Specification sheets

**Remain public:** `labels` (label photos), `photos` (product photos)

### Unified Product Enquiry Flow

Product pages have a single "Request Quote" button linking to `/contact?productId={id}&product={name}`. The contact page renders a unified enquiry form:

1. Customer fills in contact info (name, company, email, phone, message).
2. If the product has restricted documents, an "Also request product documents" toggle reveals per-lot/contract checkboxes for COA, test results, and spec sheets.
3. `POST /api/enquiries` always sends a sales notification email to `sales@lamexfoods.us`.
4. If documents were selected, also creates a `document_requests` record and sends QA notification to `coa@lamexfoods.us` — concurrent workflow.
5. Rate limited: 5 requests per email per hour (in-memory for all enquiries + DB-based for doc requests).
6. General enquiries (no `productId`) show a product text input and no document section.

### Admin Review

- `/admin/requests` — Review queue (requires `qa` or `reviewer` role).
- Status filter tabs: All | Pending | Approved | Rejected | Sent.
- Click into a request to see requester info, requested documents with file availability, and approve/reject form.
- **Approve:** Gathers matching files from disk, emails them to the customer via Resend as attachments, updates status to `sent`.
- **Reject:** Updates status with optional notes.
- If email delivery fails after approval, status stays `approved` (not `sent`) so QA can retry.

### File Serving Restriction

The `/api/files/[...path]` route checks for restricted category names in the path segments. If found, requires `qa` or `reviewer` session. Returns 404 (not 403) for unauthorized access to avoid revealing file existence.

### Database

- `document_requests` table — preserved during weekly sync, cleared during full seed.
- Fields: id, product_id, requester_name, requester_company, requester_email, requester_phone, message, requested_docs (JSON), status (pending/approved/rejected/sent), created_at, reviewed_at, reviewed_by, notes.

### Key Files

- `lib/document-requests.ts` — Types, CRUD, rate limiting, pending count
- `lib/document-request-emails.ts` — Sales notification, QA notification, customer approval email templates
- `lib/email-send.ts` — `sendEmailWithAttachments()` for Resend attachment support
- `app/api/enquiries/route.ts` — POST (public) — unified enquiry endpoint
- `app/api/document-requests/route.ts` — GET (auth) — admin list endpoint
- `app/api/document-requests/[id]/route.ts` — GET + PATCH (auth) — admin review
- `app/api/products/[id]/available-docs/route.ts` — Public GET (no file URLs)
- `app/contact/EnquiryForm.tsx` — Unified customer enquiry form with optional doc request
- `app/admin/requests/` — Admin review queue (layout, page, [id]/page, ReviewFormClient)

## Security Hardening

### HTTP Security Headers

Configured in `next.config.ts` via the `headers()` function:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables camera, microphone, geolocation
- `Strict-Transport-Security` — forces HTTPS (1 year, includeSubDomains)
- `Content-Security-Policy` — restricts resource loading to same origin; `frame-ancestors 'none'`

### CSRF Protection

`middleware.ts` validates the `Origin` header on all non-GET requests to `/api/*`. If the Origin host doesn't match the request Host, the request is rejected with 403. Requests without an Origin header (server-to-server, curl) pass through since they can't carry SameSite=Lax cookies.

### Key Files

- `middleware.ts` — CSRF origin validation middleware
- `next.config.ts` — Security headers configuration
- `lib/country-flags.ts` — Country name → flag emoji mapping (shared by inventory table and product detail page)
- `scripts/migrate-lot-dirs.ts` — One-time migration: renames upload directories from lot-ID to lot-number format, backfills `lot_numbers` column

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
- **`documents`** — Uploaded documents (product_id FK, category, filename, base_contract, lot_numbers JSON). **Preserved during weekly sync.** The `lot_numbers` column stores stable lot number strings so documents can be re-linked after re-seed.
- **`document_lots`** — Many-to-many between documents and lots (for COAs covering multiple lots). **Re-linked during sync/seed** via `relinkDocumentLots()` — lot IDs change on each seed, but lot numbers (stored in `documents.lot_numbers`) are matched to fresh IDs.
- **`suppliers`** — Supplier master data with COO and trading company flag
- **`supplier_products`** — Many-to-many linking suppliers to product labels
- **`warehouses`** — Warehouse master data with city, state, storage type
- **`users`** — QA portal authentication. **Preserved during weekly sync.**
- **`product_certifications`** — Certifications per product (Organic, Kosher, etc.)
- **`discount_items`** — Discount/clearance inventory (insurance claims, expired, overstock). **Preserved during weekly sync.**
- **`product_flags`** — Marketing flags per product (new_arrival, featured). **Preserved during weekly sync.** `new_arrival` flags auto-reset each sync.
- **`metadata`** — System metadata (lastUpdated timestamp)
- **`conversations`** — Agent chat session headers (user_email, title, timestamps). **Preserved during weekly sync.**
- **`conversation_messages`** — Agent chat messages (role, content, file_names). CASCADE deletes with parent conversation. **Preserved during weekly sync.**
- **`api_usage`** — Per-request token usage and cost (model, input/output/cache tokens, iterations, cost_usd). **Preserved during weekly sync.**
- **`document_requests`** — Customer document requests with status workflow (pending/approved/rejected/sent). **Preserved during weekly sync.**
- **`coa_data`** — Extracted COA key aspects per lot (lot_id PK, data JSON, updated_at, updated_by). Flexible JSON stores any parameter (brix, acidity, color, etc.). **Preserved during weekly sync** via `exportCoaData()`/`relinkCoaData()` — same lot-number matching pattern as `document_lots`.

## Code Conventions

- Keep the codebase simple and maintainable
- Use semantic HTML and accessible markup
- Mobile-first responsive design
- Inventory source data (JSON) in `/data` directory; runtime data in SQLite (`lamex.db`)
- Document uploads in `public/uploads/{product-id}/lots/{lot-number}/` and `public/uploads/{product-id}/contracts/{base-contract}/`
- All path segments from user input must be sanitized before use in filesystem operations
- Email templates in `/emails` directory
- Weekly sync snapshots in `data/snapshots/` (gitignored)
- Credentials and secrets in `secrets.md` (gitignored, never committed)
- Environment variables in `.env.local` (gitignored)

## Credentials

- All credentials are stored in `secrets.md` (gitignored — never committed).
- `AUTH_SECRET` must be set in `.env.local` — use any random string for dev, generate a strong secret for production.
- **Never commit plaintext passwords to version control.**

## npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Build Next.js for production (no seed — DB auto-seeds from JSON if empty at runtime) |
| `npm run build:fresh` | Full destructive seed + build (for fresh installs where you want to reset all data before building) |
| `npm run seed` | Full destructive seed — clears ALL tables (including documents/users) and reloads from JSON. Use for fresh installs only. |
| `npm run sync` | Weekly inventory sync — preserves documents + users, snapshots previous state, re-seeds from updated JSON. |
| `npm run import-excel -- <path>` | Import raw ERP Excel export → `inventory-proposed.json` (included items) + `import-review.json` (soft-excluded for manual review). Feeds into existing sync workflow. |
| `npm run update-pricing` | Fetch current Anthropic pricing and update `data/api-pricing.json` |
| `npm start` | Start production server |
