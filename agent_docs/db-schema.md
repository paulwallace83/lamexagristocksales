# Database Schema

SQLite via better-sqlite3 (`lamex.db`). Full DDL in `lib/db.ts`. Foreign keys enforced on every connection via `PRAGMA foreign_keys = ON`.

## Tables

| Table | Description | Sync Behaviour |
|---|---|---|
| `products` | Master product data (id, commodity, format, process_type, organic, pack_size, etc.) | Re-seeded each sync |
| `listings` | Inventory records (product_id FK, warehouse, supplier, quantity, weight_lbs, arrived, min_bbd) | Re-seeded each sync |
| `lots` | Per-lot detail within a listing (listing_id FK, lot_number, quantity, weight_lbs, bbd) | Re-seeded each sync |
| `lot_contracts` | Many-to-many between lots and contract-container references | Re-seeded each sync |
| `listing_contracts` | Many-to-many between listings and contract-container references | Re-seeded each sync |
| `documents` | Uploaded documents (product_id FK, category, filename, base_contract, lot_numbers JSON) | **Preserved during sync** |
| `document_lots` | Many-to-many between documents and lots | Re-linked via `relinkDocumentLots()` |
| `suppliers` | Supplier master data with COO and trading company flag | Re-seeded each sync |
| `supplier_products` | Many-to-many linking suppliers to product labels | Re-seeded each sync |
| `warehouses` | Warehouse master data with city, state, storage type | Re-seeded each sync |
| `users` | QA portal authentication | **Preserved during sync** |
| `product_certifications` | Certifications per product (Organic, Kosher, etc.) | Re-seeded each sync |
| `discount_items` | Discount/clearance inventory (insurance claims, expired, overstock) | **Preserved during sync** |
| `product_flags` | Marketing flags per product (new_arrival, featured) | **Preserved during sync**; `new_arrival` auto-resets |
| `metadata` | System metadata (lastUpdated timestamp) | Updated each sync |
| `conversations` | Agent chat session headers (user_email, title, timestamps) | **Preserved during sync** |
| `conversation_messages` | Agent chat messages (role, content, file_names). CASCADE deletes with parent. | **Preserved during sync** |
| `api_usage` | Per-request token usage and cost (model, tokens, iterations, cost_usd) | **Preserved during sync** |
| `document_requests` | Customer document requests with status workflow (pending/approved/rejected/sent) | **Preserved during sync** |
| `coa_data` | Extracted COA key aspects per lot (lot_id PK, data JSON, updated_at, updated_by) | Re-linked via `relinkCoaData()` |

## Sync/Seed Notes

- **`npm run seed`** — Full destructive seed. Clears ALL tables including documents and users. Fresh installs only.
- **`npm run sync`** — Weekly sync. Preserves: documents, document_lots (re-linked), users, discount_items, product_flags, conversations, conversation_messages, api_usage, document_requests, coa_data (re-linked).
- **`relinkDocumentLots()`** — After re-seed, lot IDs change. Documents store lot number strings in `documents.lot_numbers`; this function matches them to new lot IDs.
- **`relinkCoaData()`** — Same pattern as document_lots re-linking, but for COA extracted parameters.

## Auth Roles

| Role | Login | Redirects To | Access |
|---|---|---|---|
| `qa` | `/qa/login` | `/qa` | Document upload portal |
| `reviewer` | `/qa/login` | `/review` | Import review portal + admin tools |

Roles stored in `users` table (`role TEXT NOT NULL DEFAULT 'qa'`) and included in JWT session via `lib/auth.ts`.
