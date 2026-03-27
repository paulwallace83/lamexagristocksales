# Lamex Agri Stock Sales — Inventory Marketing System

## Role

You are an expert-level inventory control specialist with deep knowledge of the processed fruit and vegetable industry, including IQF, purees, concentrates, dehydrated, freeze-dried, aseptic, and canned products.

You will help build and maintain a weekly inventory marketing system for Lamex Agri Stock Sales.

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
- **Database:** SQLite via better-sqlite3 (`lamex.db`). Schema defined in `lib/db.ts`, auto-created on first access.
- **Data import:** Raw JSON files in `/data` directory are loaded into SQLite via `scripts/seed.ts` (`npx tsx scripts/seed.ts`)
- **Documents:** Stored on local filesystem in `public/uploads/` and tracked in SQLite (`documents`, `document_lots` tables)
- **Auth:** NextAuth.js with credentials provider and JWT sessions
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

- **[warehouses.md](warehouses.md)** — Master list of all warehouses with city and state. Update whenever a new warehouse appears in data.
- **[suppliers.md](suppliers.md)** — Master list of all suppliers with country of origin and products. Update whenever a new supplier appears in data. Use this to auto-resolve COO for known suppliers.

### Trading Company Rule

- **Unitrade International (HK)** and **Pacific Jade International Inc** are trading companies that source from multiple manufacturers in China. When displaying inventory, list the **Supplier as "Various"** (not the trading company name). COO remains "China".

## QA Document Portal

- **`/qa`** — Protected dashboard showing lot-level and contract-level document coverage per product
- **`/qa/upload/[id]`** — Per-product upload page with two sections: lot documents and contract documents
- **Auth:** NextAuth.js with credentials provider. QA login at `/qa/login`
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
- **`documents`** — Uploaded documents (product_id FK, category, filename, base_contract)
- **`document_lots`** — Many-to-many between documents and lots (for COAs covering multiple lots)
- **`suppliers`** — Supplier master data with COO and trading company flag
- **`warehouses`** — Warehouse master data with city, state, storage type
- **`users`** — QA portal authentication
- **`product_certifications`** — Certifications per product (Organic, Kosher, etc.)

## Code Conventions

- Keep the codebase simple and maintainable
- Use semantic HTML and accessible markup
- Mobile-first responsive design
- Inventory source data (JSON) in `/data` directory; runtime data in SQLite (`lamex.db`)
- Document uploads in `public/uploads/{product-id}/lots/` and `public/uploads/{product-id}/contracts/`
- All path segments from user input must be sanitized before use in filesystem operations
- Email templates in `/emails` directory
