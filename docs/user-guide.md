# Lamex Agri Stock Sales — User Guide

This guide covers all workflows for operating the Lamex Agri Stock Sales inventory marketing system. It is written for internal use and can be published to a front-page wiki.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Weekly Inventory Sync](#weekly-inventory-sync)
3. [Excel Import Alternative](#excel-import-alternative)
4. [Import Review Portal](#import-review-portal)
5. [Discount & Clearance Inventory](#discount--clearance-inventory)
6. [QA Document Portal](#qa-document-portal)
7. [Public Inventory Page](#public-inventory-page)
8. [AI Assistant](#ai-assistant)
9. [Marketing Email](#marketing-email)
10. [Admin Reference](#admin-reference)

---

## System Overview

The application is a web-based inventory marketing system for Lamex Agri Stock Sales, built to publish processed fruit and vegetable inventory (IQF, purees, concentrates) to a customer-facing page with supporting documentation.

### Key Concepts

| Term | Definition |
|------|-----------|
| **Product** | A commodity + format combination (e.g., "Strawberry IQF", "Apple Juice Concentrate") |
| **Listing** | A product at a specific warehouse + supplier. Tracks quantity, weight, and arrival date |
| **Lot** | A batch within a listing, identified by the supplier's lot number. Each lot has its own quantity, weight, BBD, and contract references |
| **Contract** | A Lamex reference number in the format `XXXXXX-YY` (base contract + container number) |
| **COA** | Certificate of Analysis — required per lot for QA compliance |
| **BBD** | Best Before Date — tracked per lot |
| **COO** | Country of Origin — mandatory for every listing |

### User Roles

| Role | Access | Login |
|------|--------|-------|
| **Public** | View inventory, product details, download documents | No login required |
| **QA** | Upload documents (COAs, specs, labels, photos) | `/qa/login` |
| **Reviewer** | Approve import review items, manage discount inventory | `/qa/login` (redirects to `/review`) |

### Data Flow

```
ERP Export → Excel Import / Chat Paste → Proposed JSON → Diff Review → Sync → SQLite → Public Page
                                                                          ↓
                                                              Discount Deduction (removes claimed lots)
```

---

## Weekly Inventory Sync

This is the primary workflow for updating the public inventory each week.

### Option A: Paste in Chat (Recommended)

**When to use:** You have pivot table data copied from the ERP or a formatted spreadsheet.

**Steps:**

1. **Paste the raw data** into the Claude chat. Include all stock descriptions, warehouse locations, suppliers, quantities, and weights.

2. **Claude parses the data** and resolves:
   - Suppliers → matched against `suppliers.json` for COO and trading company rules
   - Warehouses → matched against `warehouses.json` for city/state
   - Customer names → **stripped automatically** (never published)
   - Product descriptions → parsed into commodity, format, specification, variety

3. **Claude writes `data/inventory-proposed.json`** with the structured data.

4. **Claude runs the diff** comparing proposed vs current inventory and presents a report showing:
   - New products added
   - Products removed
   - Quantity/weight changes
   - New suppliers or warehouses (requiring your input for COO / city+state)
   - Any warnings (missing COO, ambiguous data)

5. **You review and approve** (or request corrections).

6. **Claude runs `npm run sync`** which:
   - Snapshots current inventory to `data/snapshots/`
   - Overwrites `inventory.json` with approved data
   - Re-seeds SQLite (preserving documents and users)
   - Deducts any active discount lots from regular inventory
   - Validates remaining discount items
   - Regenerates `suppliers.md` and `warehouses.md`

7. **Claude presents a reconciliation report** — per-product totals (quantity + weight) for you to cross-check against the raw pivot data.

8. **You sign off** on reconciliation. Sync is complete.

### Handling New Suppliers

If a supplier is not in `suppliers.json`, Claude will ask you for:
- Country of Origin (mandatory)
- Whether it's a trading company (if yes, display name defaults to "Various")

The supplier is added to `suppliers.json` before sync proceeds.

### Handling New Warehouses

If a warehouse is not in `warehouses.json`, Claude will ask you for:
- City and State (mandatory)

The warehouse is added to `warehouses.json` before sync proceeds.

### Rollback

If something goes wrong, copy any snapshot from `data/snapshots/` back to `data/inventory.json` and run `npm run seed`.

---

## Excel Import Alternative

**When to use:** You have a raw Excel export from the ERP system (the full 63-column report).

### Steps

1. **Place the Excel file** anywhere accessible on the server.

2. **Run the import:**
   ```
   npm run import-excel -- /path/to/export.xlsx
   ```

3. **The script processes the file:**
   - Applies exclusion rules (see below)
   - Writes included items to `data/inventory-proposed.json`
   - Writes soft-excluded items to `data/import-review.json`
   - Prints a reconciliation report

4. **Verify the reconciliation** — the script shows a breakdown of:
   - Included weight (goes to proposed inventory)
   - Review weight (soft-excluded, pending your approval)
   - Hard-excluded weight (permanently filtered)
   - Total must match the ERP total

5. **Review soft-excluded items** at `/review` (see Import Review Portal below).

6. **Continue with normal sync:** Claude runs `computeDiff()`, you review, then `npm run sync`.

### Exclusion Rules

| Rule Type | What Gets Filtered | Action |
|-----------|-------------------|--------|
| **Hard: Customer** | Trader Joe's, Sam's Club stock | Always removed, never shown |
| **Hard: Branded** | Products labeled "Trader Joe's -", "Member's Mark -", etc. | Always removed |
| **Hard: Combo** | Scoopable Acai for Performance Food Group | Always removed |
| **Hard: Zero weight** | Rows with zero or negative net balance | Always removed |
| **Soft: Direct customer** | Named customer not tagged "SOLD TO BULK STOCK" | Sent to review portal |
| **Soft: Reserved** | Stock marked as "Reserved" | Sent to review portal |

### Sensitive Fields

The following ERP columns are **never included** in any output: all pricing, costs, customer names, trader codes, logistics contacts, internal references.

---

## Import Review Portal

**URL:** `/review` (requires reviewer login)

**Purpose:** After an Excel import, soft-excluded items (direct-customer stock, reserved stock) are presented for case-by-case approval.

### Steps

1. **Log in** at `/qa/login` with reviewer credentials. You'll be redirected to `/review`.

2. **Review items** grouped by customer and product:
   - **Direct Customer Stock** (blue indicator) — allocated to a named customer
   - **Reserved Stock** (amber indicator) — marked as reserved in ERP

3. **Select items to include** using checkboxes. Quick-select buttons:
   - "Select All" — check everything
   - "Direct Only" — check only direct-customer items
   - "Clear" — uncheck all

4. **Review running totals** in the sticky footer (selected count, total weight).

5. **Click "Apply Selected"** — approved items are merged into `inventory-proposed.json`, and processed items are removed from the review file.

6. **Continue with sync** — the normal diff → review → `npm run sync` workflow proceeds.

---

## Discount & Clearance Inventory

For stock that needs to be marketed at a discount — insurance claims, expired items, overstock, damaged goods.

### Key Concepts

- Discount items are **lot-level moves** — specific lots are taken out of regular inventory and placed in the discount section.
- The ERP keeps sending these lots each week. The sync pipeline **automatically deducts** them so they only appear in Discount & Clearance.
- Each discount item has a **reason** (insurance claim, expired, overstock, damaged, other), optional **notes**, and an optional **asking price**.
- Discount items **persist across weekly syncs** — they are not overwritten.

### Adding Discount Items

#### Method 1: Tell Claude in Chat (Recommended)

Say something like:

> "Move lot 0000748642 from Banana IQF Slices to discount — insurance claim, water damage to outer packaging, product intact. Asking $0.30/lb."

Claude will:
1. Look up the lot in current inventory (quantity, weight, BBD, contracts)
2. Create a discount item linked to the product with all the lot details
3. The lot is **immediately deducted** from regular inventory — no sync/seed needed

You can also move multiple lots at once:

> "Move lots TN4-25142 and TN5-25156 from Grapes IQF to discount — both expired, asking $0.25/lb."

#### Method 2: Lot Picker (Admin UI)

1. Go to `/admin/discount` (requires reviewer login)
2. **Select a product** from the dropdown — all lots are shown grouped by warehouse/supplier
3. **Check the lots** you want to move — each lot shows lot number, quantity, weight, BBD, and contracts
4. **Set shared defaults** — reason, notes, and asking price (applied to all selected lots)
5. **Optionally customize per lot** — click "Edit" on any selected lot to override the reason, notes, or price for that specific lot
6. **Click "Move X Lots to Discount"** — lots are immediately deducted from regular inventory

The lot picker looks up all data from the database (quantity, weight, contracts, warehouse, etc.) so you don't need to type anything manually — just select and submit.

### How Lot Deduction Works

Lots are deducted from regular inventory in two ways:

**Immediately** — when a discount item is created via the lot picker or Claude chat, the lot is deducted from SQLite right away. The public page reflects the change on next page load.

**During sync/seed** — when `npm run sync` or `npm run seed` runs, the deduction step re-applies for all active discount items (since the ERP data re-populates the lot each week):

1. Regular inventory is loaded into SQLite as normal
2. **Deduction step runs:** For each active discount item with a product ID and lot number:
   - The matching lot is found in SQLite and **deleted** from regular inventory
   - The parent listing's quantity and weight are reduced
   - If a listing has no remaining lots, it's removed entirely
   - If a product has no remaining listings, it's removed from the public page
3. **Validation step runs:** Discount items without matching lots are flagged as "missing"

### Managing Discount Items

| Action | How |
|--------|-----|
| **Mark as sold** | Admin UI → click "Mark Sold", or tell Claude |
| **Restore to inventory** | Admin UI → click "Restore" on an active item — permanently deletes the discount entry and immediately restores the lot to regular inventory. Or tell Claude: "Restore disc-001 to regular inventory" |
| **Reactivate** | Admin UI → click "Reactivate" on sold/missing items |
| **Update details** | Tell Claude to update notes, price, or reason |
| **View status** | Admin UI shows active, sold, and missing items |

### Reason Categories

| Reason | When to Use |
|--------|------------|
| **Insurance Claim** | Product involved in an insurance claim (damage, loss) |
| **Expired** | Past best-before date but product quality is acceptable |
| **Overstock** | Excess stock that needs to move quickly |
| **Damaged** | Packaging or product damage (not insurance) |
| **Other** | Anything else — describe in notes |

### Public Display

Discount items appear on the main inventory page in a collapsible **"Discount & Clearance"** section with amber/gold styling, below the regular format groups. The section is:
- **Collapsed by default** — customers must click to expand
- **Hidden when empty** — no section shown if there are no active discount items
- **Separate from main filters** — not included in commodity/format/origin filter counts
- Price column shows the asking price (or "Inquire" if not set)

---

## QA Document Portal

**URL:** `/qa` (requires QA or reviewer login)

**Purpose:** Upload and track Certificates of Analysis, spec sheets, labels, test results, and product photos.

### Document Hierarchy

| Level | Document Types | Shared Across |
|-------|---------------|---------------|
| **Per Lot** | COA, Test Results (pesticide, micro, etc.) | One COA can cover multiple lots |
| **Per Contract** | Spec Sheets, Label Photos, Product Photos | All containers under the same base contract |

### QA Dashboard (`/qa`)

The dashboard shows document coverage for every product:

| Status | Meaning | Badge Color |
|--------|---------|------------|
| **Complete** | All required lot COAs and contract documents uploaded | Green |
| **Partial** | Some documents uploaded but not all requirements met | Amber |
| **Missing** | No documents uploaded at all | Red |

Use the status filter (All / Missing / Partial / Complete) to focus on products that need attention.

### Uploading Documents

1. From the QA dashboard, click a product name to open its upload page (`/qa/upload/[id]`)
2. **Lot Documents section:** Upload COAs and test results per lot
   - Each lot shows its lot number, contract references, and current COA status
   - One COA can be tagged to multiple lots if it covers them
3. **Contract Documents section:** Upload spec sheets, labels, and product photos per base contract
   - Spec sheets and labels are shared across all containers of a contract
   - **Product photos are only required for IQF and frozen products** — not for Juice Concentrate or Puree

### Upload Limits

- Maximum file size: **50 MB**
- Allowed file types: PDF, JPEG, PNG, GIF, WebP
- All uploads require QA or reviewer authentication

---

## Public Inventory Page

**URL:** `/` (no login required)

### Layout

1. **Hero section** — title and description
2. **Stats bar** — total products, total weight, origin countries, warehouse locations
3. **Filters** — search, commodity, type (Organic/Conventional), format, origin, warehouse state
4. **Inventory table** — grouped by format (IQF, Juice Concentrate, Puree) with collapsible sections. Country of origin columns display flag emojis alongside country names.
5. **Discount section** — collapsible amber section for clearance items (below main inventory)

### Filters

Filters are **cascading** — each dropdown only shows options that are available given the other active filters. For example, selecting "IQF" as format narrows the commodity dropdown to only commodities that have IQF products.

### Product Detail Pages

Click any product name to see full details:
- All listings (warehouse locations) with supplier and COO (with country flag emoji)
- Per-lot data: lot number, quantity, weight, BBD, contract references
- Downloadable documents: COAs, test results, spec sheets
- Past-BBD dates are highlighted in amber

### What Customers See

- **Pricing:** Always shows "Inquire" for regular inventory. Discount items may show an asking price.
- **Customer names:** Never displayed — all customer data is stripped during import.
- **Grades:** Not displayed on the public page (inconsistent across products).
- **Type labels:** "Organic" (green badge) or "Conventional" (gray badge).

---

## AI Assistant (TDPAIB)

**URL:** `/admin/agent` (requires QA or reviewer login)

**Purpose:** Top Dog Paul's AI Brain (TDPAIB) — a conversational AI interface that lets you upload documents, query inventory, and manage stock using plain language instead of navigating forms manually.

### Getting Started

1. Log in at `/qa/login` with your QA or reviewer credentials
2. Click **AI Assistant** in the navigation bar
3. Type a question or drag-and-drop a file into the chat window

### What You Can Do

| Task | Example |
|------|---------|
| **Upload a COA** | Drag in the PDF and say "Upload this COA to the correct lots" — the assistant reads the document, finds matching lot numbers, and proposes the upload |
| **Batch upload COAs** | Drag in multiple COA PDFs at once — the assistant reads all files, presents a single matching table, and uploads them all after one confirmation. Works for 24+ files in one turn |
| **Upload a test result** | Drag in a third-party lab report (SGS, Eurofins, GFL) — the assistant recognizes it as a test result (not a COA) and matches to the correct lots |
| **Upload a spec sheet** | Attach the PDF and say "This is a spec sheet" — the assistant looks for contract numbers and matches to the right product |
| **Check document coverage** | "What products are missing COAs?" or "Which products are missing test results?" |
| **Query inventory** | "List all products" (includes discount items) or "How much mango do we have?" |
| **Move lots to discount** | "Move lot TN4-25142 from Grapes IQF to discount — expired, asking $0.25/lb" |
| **Restore discount items** | "Restore disc-001 to regular inventory" |
| **Backfill COA data** | "What COAs need backfill?" — the assistant scans for COA documents missing extracted data, shows a summary, and re-extracts parameters in bulk after your confirmation |
| **Check import review** | "Are there any items pending review from the last import?" |
| **Check sync status** | "When was the last inventory sync?" |

### File Upload

- **Drag-and-drop** files directly into the chat window, or click the paperclip icon
- Multiple files can be attached to a single message
- **Batch upload:** When you attach multiple files, the assistant reads all of them, extracts lot/contract numbers from each, and presents a consolidated matching table. You confirm once and all files upload in one batch — no per-file confirmation needed. This handles large shipments (24+ COAs) efficiently.
- Files persist across conversation turns (30 min expiry) — you can upload a file, discuss it, and confirm the upload in a follow-up message
- Maximum file size: 50 MB per file
- Supported types: PDF, JPEG, PNG, GIF, WebP
- **COA auto-extraction:** When a COA is uploaded (single or batch), key parameters (brix, acidity, color, etc.) are automatically extracted via Claude vision and displayed on the product detail page. The upload succeeds immediately — extraction runs in the background.

### COA vs Test Result

The assistant automatically distinguishes COAs from test results:
- **COA** = issued by the supplier/manufacturer
- **Test result** = issued by a third-party lab (SGS, Eurofins, GFL, Bureau Veritas, etc.)
- Even if a file is named "COA", if it's from a third-party lab, the assistant categorizes it as a test result
- If a supplier's COA contains heavy metal or pesticide data within it, it stays as a COA and the assistant notes the test data is included

### Confirmation Model

The assistant **always asks for your approval** before taking any action that modifies data (uploading documents, batch uploading documents, creating discount items, restoring items, backfilling COA data). It will describe exactly what it intends to do and wait for your explicit "yes" before proceeding. For batch uploads, the assistant presents a single table showing all proposed matches — you confirm or correct the entire table before any files are uploaded.

### Limitations

- The assistant cannot modify code or system configuration
- It cannot run the weekly sync or seed scripts directly
- It cannot delete documents or inventory records
- Conversations are saved to SQLite and persist across page reloads. Use the history dropdown to resume previous conversations.

---

## Marketing Email

The marketing email composer generates and sends weekly inventory update emails to your buyer list.

### Accessing the Composer

Navigate to `/admin/email` (requires Reviewer role). The "Email" link appears in the admin navigation bar.

### Workflow

1. **Review product badges.** The Compose tab shows all products grouped by format. Each product has two toggle badges:
   - **New** (green) — auto-set by the weekly sync when a product appears for the first time. Cleared and recalculated on each sync.
   - **Featured** (blue) — manually toggled by you. Persists across syncs.

2. **Preview the email.** Click the Preview tab to see a live rendering of the email as recipients will see it. The preview updates automatically when you toggle badges. New Arrivals and Featured Items sections only appear when products have those badges.

3. **Enter recipients.** In the Send panel, type or paste email addresses separated by commas or newlines. Duplicates are automatically removed.

4. **Send.** Click "Send Email" to dispatch via Resend. The subject line is editable (defaults to "Lamex Agri Foods — Weekly Inventory Update"). A success or error message appears after sending.

### Email Content

The email includes:
- Navy header with company logo
- Stats bar (product count, total weight, origins, warehouses)
- New Arrivals section (green, only if flagged products exist)
- Featured Items section (blue, only if flagged products exist)
- Inventory by Category table (IQF, Juice Concentrate, Puree with counts and weights)
- "View Full Inventory" button linking to the public site
- Footer with company info and contact details

### Requirements

- `RESEND_API_KEY` must be set in `.env.local`
- The sending domain (`lamexfoods.us`) must be verified in the Resend dashboard
- `NEXT_PUBLIC_SITE_URL` should be set to the production URL for correct CTA links and logo display

---

## Admin Reference

### npm Scripts

| Command | Purpose | Destructive? |
|---------|---------|-------------|
| `npm run dev` | Start dev server on port 3000 | No |
| `npm run build` | Build Next.js for production (DB auto-seeds if empty at runtime) | No |
| `npm run build:fresh` | Full destructive seed + build | **Yes — clears documents + users** |
| `npm run seed` | Full destructive seed from JSON files | **Yes — clears documents + users** |
| `npm run sync` | Weekly inventory sync (preserves docs + users) | Partial (inventory only) |
| `npm run import-excel -- <path>` | Import ERP Excel export | No (writes proposed files) |
| `npm run update-pricing` | Fetch current Anthropic API pricing | No |
| `npm start` | Start production server | No |

### Data Files

| File | Purpose | Editable? |
|------|---------|-----------|
| `data/inventory.json` | Current inventory (source of truth) | Via sync only |
| `data/inventory-proposed.json` | Proposed inventory for next sync | Generated by import/Claude |
| `data/import-review.json` | Soft-excluded items pending review | Generated by import |
| `data/discount-inventory.json` | Discount/clearance items | Via admin UI or Claude |
| `data/suppliers.json` | Supplier master data | Edit to add/modify suppliers |
| `data/warehouses.json` | Warehouse master data | Edit to add/modify warehouses |
| `data/exclusion-rules.json` | Import exclusion rules | Edit to change filtering |
| `data/documents.json` | Document records for seeding | Auto-generated |
| `data/users.json` | User accounts for seeding | Edit to add/modify users |
| `data/snapshots/` | Timestamped inventory backups | Auto-generated, gitignored |

### Database

SQLite database at `lamex.db`. Key tables:

- `products`, `listings`, `lots` — inventory hierarchy
- `documents`, `document_lots` — uploaded files and lot associations
- `discount_items` — discount/clearance inventory (preserved during sync)
- `product_flags` — marketing flags (new_arrival, featured) per product (preserved during sync)
- `users` — authentication accounts (preserved during sync)
- `suppliers`, `warehouses` — reference data (rebuilt during sync)

### Environment

- `AUTH_SECRET` in `.env.local` — required for NextAuth.js session encryption
- `ANTHROPIC_API_KEY` in `.env.local` — required for the AI Assistant agent portal
- `RESEND_API_KEY` in `.env.local` — required for sending marketing emails
- `NEXT_PUBLIC_SITE_URL` in `.env.local` — public site URL for email CTA links and logo (defaults to `https://www.lamexagrifoodsinventory.com`)
- Credentials stored in `secrets.md` (gitignored, never committed)

### Key URLs

| URL | Purpose | Auth Required |
|-----|---------|--------------|
| `/` | Public inventory page | No |
| `/product/[id]` | Product detail page | No |
| `/contact` | Contact / request quote | No |
| `/qa` | QA document dashboard | QA or Reviewer |
| `/qa/upload/[id]` | Document upload page | QA or Reviewer |
| `/qa/login` | Login page (routes by role) | No |
| `/review` | Import review portal | Reviewer |
| `/admin/discount` | Discount inventory admin | Reviewer |
| `/admin/email` | Marketing email composer | Reviewer |
| `/admin/agent` | AI Assistant chat | QA or Reviewer |
