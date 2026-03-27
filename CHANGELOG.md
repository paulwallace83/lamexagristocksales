# Changelog

All notable changes to the Lamex Agri Stock Sales inventory system are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
