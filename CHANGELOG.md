# Changelog

All notable changes to the Lamex Agri Stock Sales inventory system are documented here.
This project follows [Semantic Versioning](https://semver.org/).

---

## [0.7.0] — 2026-03-27

### Added
- **Excel import pipeline** — `npm run import-excel -- <path>` ingests raw ERP Excel exports (63-column format), applies configurable exclusion rules, writes `inventory-proposed.json` and `import-review.json`
- **`lib/excel-import.ts`** — Excel parser, product description parser, warehouse/supplier fuzzy normalizer, exclusion engine
- **`scripts/import-excel.ts`** — CLI wrapper with reconciliation report printed to console
- **`data/exclusion-rules.json`** — Configurable hard/soft exclusion rules (customer blocklist, branded-product patterns, non-inventory patterns, direct-customer keywords)
- **Import Review Portal** (`/review`) — interactive web UI for approving soft-excluded inventory items before sync
  - `app/review/page.tsx` — server component groups items by customer/product/warehouse
  - `app/review/ReviewClient.tsx` — client component with checkboxes, Select All / Direct Only / Clear buttons, live running totals (units + lbs), and submit
  - `app/review/layout.tsx` — auth guard (reviewer role only); redirects others to `/qa/login`
  - `app/api/review/apply/route.ts` — POST endpoint merges approved items into `inventory-proposed.json`, deletes `import-review.json`
  - `app/api/auth/redirect/route.ts` — role-based post-login redirect (`reviewer` → `/review`, `qa` → `/qa`)
- **Role-based authentication** — `users` table gains `role TEXT NOT NULL DEFAULT 'qa'`; roles included in JWT session token
  - `reviewer` role: access to import review portal
  - `qa` role: access to QA document portal
- **`xlsx` npm package** — Excel parsing dependency (CJS, loaded via `createRequire` workaround for ESM project)

### Changed
- **`lib/auth.ts`** — JWT and session callbacks extended to include `role`; TypeScript module augmentation for `Session` and `JWT` types
- **`lib/db.ts`** — `users` table schema includes `role` column; migration guard (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) for existing databases
- **`scripts/seed.ts`** — `INSERT INTO users` now includes `role` column
- **`app/qa/login/page.tsx`** — post-login redirect now goes to `/api/auth/redirect` for role-based routing; title updated to "Lamex Agri Portal"
- **`data/users.json`** — added `role` field to QA user; added reviewer user (`paul@lamexfoods.us`)
- **`data/warehouses.json`** — added Kres Coldstore (Vineland, NJ, Frozen)
- **`data/suppliers.json`** — added Frigodar SARL (Morocco, Strawberry IQF) and Alterra SA (Greece, Peach IQF)
- **`package.json`** — added `xlsx` dependency and `import-excel` npm script
- **`CLAUDE.md`** — documented Excel import workflow, exclusion rules, column mapping (`Qty_Weight_Net_Bal` as canonical weight), reconciliation target, non-inventory patterns, and review portal

### Fixed
- **ERP weight reconciliation** — switched weight field from `Qty_Weight` to `Qty_Weight_Net_Bal`; removed status filter so included + review + hard-excluded weights equal ERP total exactly
- **Pear JC duplicate products** — `normalizeSpec()` now normalises `70 Bx` → `70 Brix` so product IDs are stable across spec variants
- **Blackberry Puree ID** — comma-separated parser now handles compound format+spec tokens (e.g., `"Puree Seedless"`)
- **Treko double-space** — supplier name normalisation collapses multiple spaces before fuzzy-matching

### Security
- **File-based lock** (`data/.review-lock`) prevents concurrent `/api/review/apply` submissions; stale lock (>30 s) auto-cleared
- **Atomic write** — `inventory-proposed.json` written to `.tmp` then `renameSync`'d to prevent partial-write corruption
- **Input validation** — `body.include` array values validated as non-negative integers; NaN/float rejected
- **NaN propagation fix** — `Number()` coercion with `|| 0` fallback in both `excel-import.ts` and `apply/route.ts`
- **Null safety** — `parseDescription()` guards against empty `desc`/`specField` with early return

---

## [0.6.0] — 2026-03-27

### Added
- **Weekly inventory sync system** — Claude-assisted workflow for diffing pasted pivot table data against current inventory, presenting change reports, and applying approved updates
- **`lib/sync.ts`** — Diff engine with `computeDiff()`, `validateBusinessRules()`, `formatDiffReport()`, `reconciliationReport()`, and `generateProductId()` functions
- **`scripts/sync-inventory.ts`** — Apply script that snapshots current state, overwrites inventory.json, re-seeds SQLite while preserving documents and users, and regenerates reference markdown files
- **`data/snapshots/`** — Timestamped backup directory for pre-sync inventory.json copies (gitignored)
- **`secrets.md`** — Gitignored credentials file for QA portal and auth secrets, referenced from CLAUDE.md and workflow docs
- **`.env.local`** — NextAuth `AUTH_SECRET` environment variable (was missing, blocking QA portal login)
- **`npm run sync`** script in package.json
- **Reconciliation report** — per-product totals table (quantity + weight) presented after sync for user sign-off
- **Preflight validation** — all JSON files validated before any mutations during sync
- **Snapshot verification** — file size checked after snapshot copy; sync aborts if snapshot fails
- **Inventory.json recovery** — if file copy fails mid-sync, automatic restore from snapshot

### Changed
- **QA portal password** — reset to new credentials stored in `secrets.md`
- **`scripts/seed.ts`** — fixed FK delete order (documents before products), added `|| []` safety for certifications, added comment directing to sync script for weekly use
- **`lib/db.ts`** — `getDb()` now enforces `PRAGMA foreign_keys = ON` on every connection as a safety net against prior crash states
- **`suppliers.md`** and **`warehouses.md`** — now auto-generated by sync script; marked "do not edit manually"

### Fixed
- **PRAGMA foreign_keys crash safety** — sync script wraps FK disable/enable in `try/finally` so foreign keys are always re-enabled even if the transaction throws
- **Orphaned document_lots** — sync script now clears `document_lots` before deleting lots, preventing stale FK references to non-existent lot IDs
- **FK constraint error on seed** — `seed.ts` delete order fixed: `document_lots` → `documents` before `products` (was failing when documents existed in the database)
- **Missing AUTH_SECRET** — QA portal login was silently failing due to missing `.env.local`; now created and documented

### Security
- **Code review performed** on `lib/sync.ts` and `scripts/sync-inventory.ts`
- **Null-safe array access** throughout sync engine — handles missing `products`, `listings`, `certifications`, `contracts` arrays
- **JSON parse error handling** — descriptive error messages with file context instead of raw stack traces
- **Listing key collision fix** — changed from `|||` delimiter to `JSON.stringify()` for composite key safety
- **COO inference** — new suppliers now check listing data for already-set country of origin
- **File operation error handling** — snapshot and inventory.json copy failures caught and reported; sync aborts cleanly

---

## [0.5.0] — 2026-03-27

### Added
- **Lot-level document management** — COAs and test results are now uploaded and tracked per lot, not per product
- **Contract-level document management** — spec sheets, labels, and photos are uploaded per base contract number, shared across all containers/lots under that contract
- **Multi-lot COA tagging** — when uploading a COA, QA can tag it to multiple lots covered by the same document
- **`lots` table** — stores per-lot detail (lot_number, quantity, weight_lbs, bbd) as children of listings
- **`lot_contracts` junction table** — many-to-many between lots and contract-container references
- **`document_lots` junction table** — many-to-many between documents and lots
- **`specs` document category** — new category for specification sheets (per contract)
- **`base_contract` column on documents** — links contract-level docs to their base contract number
- **`LotCOAUpload` component** — specialized upload widget with multi-lot selector for COA documents
- **Lot display on product detail page** — customers see lot numbers, Lamex reference numbers, per-lot quantities/weights/BBDs
- **Contract documents section** on product detail page — grouped by base contract
- **`extractBaseContract()` helper** — strips container suffix from contract references (e.g., `124717-04` → `124717`)
- **Path traversal protection** — all user-provided path segments sanitized, resolved path checked against uploads root

### Changed
- **QA dashboard** — now shows lot COA coverage (e.g., "2/5") and contract doc coverage instead of flat per-product counts
- **QA upload page** — redesigned with two sections: lot-level documents and contract-level documents
- **Upload API** — accepts `lotIds` and `baseContract` form fields, routes files to lot/contract sub-paths
- **Documents API** — GET returns lot associations, DELETE handles lot/contract storage paths
- **File storage paths** — changed from `public/uploads/{product-id}/{category}/` to `public/uploads/{product-id}/lots/{lot-id}/{category}/` and `public/uploads/{product-id}/contracts/{base-contract}/{category}/`
- **`Listing` interface** — now includes `id` field and `lots: Lot[]` array
- **Aggregate functions** (`getTotalQuantity`, `getTotalWeight`) — use lot-level data when available, fall back to listing-level
- **`getDocumentStatus()`** — reports completeness at lot level and contract level separately
- Product detail page gracefully degrades when lots are not yet populated

---

## [0.4.0] — 2026-03-26

### Changed
- **Migrated data layer from JSON files to SQLite** — all inventory, supplier, warehouse, document, and user data now stored in `lamex.db` via better-sqlite3
- **Seed script** (`scripts/seed.ts`) reads JSON files from `/data` and populates SQLite
- **Query functions** (`lib/inventory-db.ts`) replaced JSON file reads with SQL queries
- Schema auto-created on first database access via `lib/db.ts`

---

## [0.3.0] — 2026-03-26 6:03 PM EST

### Added
- **QA Upload Portal** (`/qa`) — authenticated dashboard for document management
- **Per-product upload pages** (`/qa/upload/[id]`) with drag-and-drop file uploads
- **NextAuth.js authentication** with credentials provider and JWT sessions
- **Document categories:** COA, Pesticide/Test Results, Label Photos, Product Photos
- **Product photo rule:** photos only requested for IQF/frozen products, not juice concentrate or puree
- **API routes** for file upload (`POST /api/upload`), document listing (`GET /api/documents/[id]`), and deletion (`DELETE /api/documents/[id]`)
- **Public product detail pages** now display uploaded documents with download links
- **Document metadata tracking** via structured data (initially JSON, later migrated to SQLite)
- **QA user account** system with hashed passwords
- Updated CLAUDE.md with QA portal documentation and product photo rules

### Changed
- Switched from static export (`output: "export"`) to server mode to support API routes

---

## [0.2.0] — 2026-03-26 5:48 PM EST

### Added
- **Lamex Agri Foods branding** — logo in header, Food Group 60th anniversary logo in footer
- **Brand color scheme** — navy `#1a2b5f` primary, blue `#4a90c4` accent (replaces green)
- **Organic/Conventional type column** — dedicated column in inventory table with consistent badge placement
- **Type filter dropdown** — filter by Organic, Conventional, or All (replaces checkbox)
- **Clear all filters** button — appears when any filter is active

### Changed
- Removed grade labels (Grade A, etc.) from all views for visual consistency
- Every product now explicitly labeled as either Organic or Conventional
- Updated CLAUDE.md with grade handling rules and organic/conventional classification

### Fixed
- Image optimization error with static export (`images: { unoptimized: true }`)

---

## [0.1.0] — 2026-03-26 5:18 PM EST

### Added
- **Next.js web application** with TypeScript and Tailwind CSS
- **Inventory listing page** (`/`) with searchable, filterable table
  - Filters: Commodity, Format, Origin, Warehouse State, text search
  - Desktop table view and mobile card view (responsive)
- **Product detail pages** (`/product/[id]`) with warehouse listings, supplier info, COO, pack sizes
- **Contact/quote request page** (`/contact`) with pre-populated product field and mailto form
- **14 products** in initial inventory across 7 commodities:
  - Apple JC (Organic + Medium Acid), Banana IQF, Blackberry IQF (Conventional + NOP Organic), Blackberry Puree, Dark Sweet Cherries IQF, Grapes IQF, Kiwi JC, Lemon JC Organic, Mango IQF, Pear JC Aseptic, Pineapple Puree, Pomegranate JC
- **8 warehouse locations** across NJ, CA, TX, FL
- **15 suppliers** from 9 countries (Turkey, China, South Africa, Ecuador, Chile, Serbia, Italy, Argentina, Peru, Thailand)
- Structured JSON data files (`data/inventory.json`, `data/suppliers.json`, `data/warehouses.json`)
- Reference documentation (`suppliers.md`, `warehouses.md`)
- Project specification and business rules (`CLAUDE.md`)

### Business Rules Implemented
- Pricing always displayed as "Inquire" — never published
- Customer names stripped from all output
- Country of Origin mandatory on every product
- Trading companies (Unitrade, Pacific Jade) displayed as "Various"
- BBD dates shown uniformly — never flagged or differentiated
- Warehouse locations always include city and state

---

## [0.0.1] — 2026-03-26 3:35 PM EST

### Added
- Initial repository setup
- `CLAUDE.md` project specification document
