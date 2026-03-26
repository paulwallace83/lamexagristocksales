# Changelog

All notable changes to the Lamex Agri Stock Sales inventory system are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
- **Document metadata tracking** via `data/documents.json`
- **QA user account** system with hashed passwords (`data/users.json`)
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
