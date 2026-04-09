# LESSONS.md — Hard-Won Project Knowledge

Accumulated lessons from building Lamex Agri Stock Sales. Read this before making changes — it records what worked, what broke, and the non-obvious decisions behind the code.

---

## Data Model & Sync

### COA data must be exported by lot number, not lot ID
**What happened:** During weekly sync, all lot IDs change because the entire `lots` table is rebuilt from the ERP. Any FK reference to a lot ID becomes stale.
**Pattern:** `exportCoaData()` saves `{lotNumber, productId, data}` before the transaction. `relinkCoaData()` re-inserts using lot numbers to find fresh IDs. Same pattern for `document_lots` and `relinkDocumentLots()`.
**Risk if ignored:** Silent data loss — coa_data rows inserted but pointing at wrong lots.

### Discount lot deduction must run after every seed/sync
**What happened:** The ERP re-sends discount lots every week because it doesn't know they've been moved to clearance. Without deduction, discount lots reappear in regular inventory.
**Pattern:** After seed/sync, `deductDiscountLots()` runs immediately to remove active discount lots from `lots`, `lot_contracts`, `document_lots`, and adjusts parent listing qty/weight.
**Risk if ignored:** Same lot appears both in public inventory and Discount & Clearance section.

### Never use `npm run seed` during a sync
**What happened:** `seed.ts` is destructive — it clears documents, users, conversations, coa_data, discount_items. `sync.ts` preserves all of these.
**Rule:** `npm run seed` is for fresh installs only. All weekly updates go through `npm run sync`.

### Lot numbers are supplier-defined strings, not auto-incremented IDs
Lot numbers (e.g., `25AJCA207B`) come from the supplier and appear in COA documents. They must be preserved as-is. Do not slugify or normalise lot numbers — they are used as the stable key for re-linking documents and COA data after each sync.

### The sync seed must insert lots — `autoSeed()` only runs on first DB creation
**What happened:** The original `scripts/sync-inventory.ts` (and `lib/sync-apply.ts` before B004 refactor) deleted `lots` and `lot_contracts` but never re-inserted them. Only `autoSeed()` in `lib/db.ts` handles lot insertion — and it only runs when the `products` table is empty (first deploy). After every weekly sync, `lots` was empty. This caused `relinkDocumentLots()`, `relinkCoaData()`, and `deductDiscountLots()` to effectively no-op.
**Fix (B004 refactor):** `applySync()` now inserts lots using the same `findLot`/`updateLot`/`insertLot` pattern from `autoSeed()`, including duplicate lot number handling within a listing.
**Risk if ignored:** All lot-level features (COA re-linking, document-lot associations, discount lot deduction) silently fail after every weekly sync.

### Reference file generators must accept an output directory — never hardcode `process.cwd()`
**What happened:** `regenerateSuppliersMd()` and `regenerateWarehousesMd()` in `lib/sync-apply.ts` originally wrote to `process.cwd()`. During test execution, this overwrote the real tracked `suppliers.md` and `warehouses.md` with minimal test fixtures, corrupting production reference data.
**Pattern:** Both functions accept a `rootDir` parameter. `applySync()` accepts `options.rootDir` (defaults to `process.cwd()`). Tests pass the temp directory as `rootDir`.
**Risk if ignored:** Every test run and CI run silently corrupts reference files.

---

## File Uploads & Storage

### File paths use `lib/paths.ts` — never hardcode `public/uploads/`
**Why:** On Railway, uploads live on a persistent volume at `RAILWAY_VOLUME_PATH`. Locally they're in `public/uploads/`. `getUploadsRoot()` in `lib/paths.ts` resolves the correct path based on the environment.
**Risk if ignored:** Files upload locally but return 404 in production (or vice versa).

### Path traversal guard — always resolve and check prefix
After joining any user-supplied path segment (lot number, contract, product ID) with the uploads root, always:
```ts
const resolved = path.resolve(targetDir, filename);
if (!resolved.startsWith(uploadsRoot + "/")) throw new Error("Path traversal attempt");
```
This is in every upload and file-read route. Do not skip it.

### Sanitize lot/contract numbers before using in filenames
Lot numbers and contract numbers come from the ERP or user input. Before using in a filesystem path:
```ts
const safe = input.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
```
`generateDocFilename()` in `lib/documents.ts` does this — use it rather than constructing filenames manually.

### Use `getUploadDir()` for path construction — never build upload paths manually
**What happened:** B003 review found that the DELETE route's local `safePath` used a permissive blocklist (`/[/\\?%*<>"\x00-\x1f]/g`) while the upload route and `lib/documents.ts` use a strict allowlist (`/[^a-zA-Z0-9._-]/g` via `safeSeg`). When a product ID or lot number contained spaces, the two sanitizers produced different paths — delete couldn't find the file, leaving orphans on disk.
**Pattern:** Always use `getUploadDir()` from `lib/documents.ts` to construct upload directory paths. Never replicate path construction logic in route handlers. The canonical `safeSeg()` function in `lib/documents.ts` is the single source of truth for path segment sanitization.
**Risk if ignored:** Silent file orphaning — DB record deleted but physical file remains because the path doesn't match where the file was originally stored.

### Old-format files use a unix timestamp prefix
Files uploaded before the descriptive naming convention use `{unix-timestamp}-{original-filename}`. The rename utility (`npm run rename-uploads` or `/admin/tools`) handles batch migration. Always check which format a file is in before building display logic around filenames.

---

## Authentication & Roles

### Two distinct login pages, same auth provider
- `/qa/login` → shared login page for both `qa` and `reviewer` roles
- `/api/auth/redirect` handles role-based redirect: `qa` → `/qa`, `reviewer` → `/review`
- There is no `/admin/login` — admin routes use the same NextAuth session; layout auth guards check the role from the JWT

### `qa` role can upload documents; `reviewer` role can also access import review and admin tools
Whenever adding a new admin route, decide which role it requires and add the auth check to the layout. The pattern is a server-side session check in `layout.tsx` that redirects to `/qa/login` if auth fails.

---

## COA Data & Display

### `detectCoaTestTypes()` normalises keys before matching
ERP-extracted or AI-extracted field names can have inconsistent separators (spaces, dots, hyphens). The function strips all non-alphanumeric characters before checking against the heavy metal and pesticide keyword lists. If you add new test type fields, test against `"lead content"`, `"lead.total"`, `"Arsenic (As)"` variants.

### `metal_detection` is NOT a heavy metal field
`metal_detection: "Pass"` is a physical equipment check, not a chemical test. The exclusion list in `detectCoaTestTypes()` explicitly skips `metal_detection` to prevent false positives. Keep this exclusion.

### Max 6 pills per lot — strictly enforced
Displaying more overwhelms the UI. Known fields are shown first (brix, acidity, pH, etc.), then unknown fields. The 6-pill cap is in `formatCoaFields()`. If a COA has 15 parameters, only the first 6 (by priority) display. All data is still stored.

### AI extraction is fire-and-forget — extraction failure must not block upload
The Claude Haiku extraction call happens after the HTTP response is sent. Upload API always returns success before extraction completes. If extraction fails, the upload is still valid — QA can run backfill or use `save_coa_data` via the agent.

---

## Testing

### Mock `../lib/db` to test any function in a file that imports SQLite
`better-sqlite3` loads a native `.node` binary which Vitest cannot handle directly. Any test file that imports a module which imports `lib/db` (even transitively) must add:
```ts
vi.mock("../lib/db", () => ({ getDb: vi.fn() }));
```
If you see `Error: cannot open database` or native module errors in tests, this mock is missing.

### Use a guaranteed non-existent directory for `generateDocFilename()` tests
`generateDocFilename()` calls `existsSync()` to detect filename collisions. In tests, pass a temp path that cannot exist (e.g., `` `/tmp/lamex-test-${Date.now()}-doesnotexist` ``) so the uniqueness counter never triggers without needing to mock `fs`.

### Next.js 16 removed `next lint`
Do not add `npx next lint` to CI or scripts — the command was removed in Next.js 16. Run TypeScript type checks instead: `npx tsc --noEmit`.

### Guard `.toLowerCase()` on JSON-sourced string fields — TypeScript types don't guarantee runtime values
**What happened:** B001 correctness review caught that `product.unitType.toLowerCase()` would crash if `unitType` was `null` at runtime despite being typed as `string`. JSON data from `inventory.json` can contain nulls that TypeScript doesn't catch.
**Pattern:** Use `(field || "").toLowerCase()` or `typeof field === "string"` before calling string methods on any field sourced from parsed JSON. The type annotation is a compile-time contract, not a runtime guarantee.
**Risk if ignored:** Uncaught TypeError crashes the sync diff report generation.

### `extractBaseContract()` is server-only — client-side must duplicate the logic
**What happened:** B003 needed base contract extraction in a `"use client"` component. `extractBaseContract()` in `lib/inventory.ts` cannot be imported client-side because it transitively imports `better-sqlite3`. The client reimplemented the logic but initially used `lastIndexOf("-")` instead of `indexOf("-")`, which would produce different results for contracts with multiple hyphens (e.g., `ABC-123-04`).
**Pattern:** When duplicating server-only logic client-side, always add a comment referencing the canonical function (file + line). Use `indexOf("-")` (first hyphen) to match `extractBaseContract()`.
**Risk if ignored:** Silent data mismatch — client groups documents under the wrong base contract.

### `CANONICAL_UNIT_TYPES` lives in `lib/sync.ts` — update when ERP adds new unit types
The set contains: `cases, lbs, kgs, pallets, drums, totes, bags, boxes, mt`. If a new legitimate unit type appears in the ERP data, add it to this set or every sync will produce a non-blocking warning for affected products.

---

## Inventory Rules

### Document-based test badges take priority over COA-extracted badges
On the product detail page, if a `test-results` document has been uploaded with a filename matching heavy metal or pesticide keywords, show the document badge. Only show COA-extracted badges if no matching document badge exists. This prevents double-badging.

### Product photos only for IQF/frozen — never for JC or Puree
The rule:
```
Show product photos if: format === "IQF" OR (processType === "Frozen" AND format !== "Juice Concentrate" AND format !== "Puree")
```
The QA dashboard enforces this — the "Contract Photos" column shows "N/A" for JC and Puree products. Do not add photo upload UI for these formats.

### Heavy metal tests expected per lot for Juice Concentrate
The QA dashboard shows a "Heavy Metals" column for JC products with per-lot coverage. The agent's `get_document_status` tool includes `expectedTest: "heavy-metals"` and `missingTestLots` for these products.

### Pesticide tests expected per lot for Organic products
Same pattern — `expectedTest: "pesticide"` for organic products. **Exception:** If a product is both Organic and Juice Concentrate, show heavy metals column (JC rule takes priority over organic rule).

---

## Weekly Sync Workflow

### Reconciliation is mandatory before sign-off
After every sync, Claude presents a per-product totals table (quantity + weight). The user must cross-check this against the raw ERP data. Sync is not complete until reconciliation is signed off — never mark a sync as complete without it.

### COO is mandatory — block publication until confirmed
If a supplier's country of origin cannot be auto-resolved from `suppliers.json`, flag it immediately in the diff report. Do not write the item to `inventory.json` until COO is confirmed.

### The `DFRM ` pattern is a non-inventory row
Rows with descriptions starting `"DFRM "` are prepayment/finance rows from Teno Norte, not real stock. They are silently dropped by `nonInventoryPatterns` in `exclusion-rules.json`. Do not count them in reconciliation.

---

## UI Components

### `viewport-fit=cover` is required for `env(safe-area-inset-*)` to work
**What happened:** B011 added `pb-[calc(1rem+env(safe-area-inset-bottom))]` to the mobile sticky CTA on the product detail page. Without `viewport-fit=cover` in the viewport meta tag, all `env()` safe-area values silently resolve to `0` — the safe-area padding has no effect on iOS, with no error or warning.
**Pattern:** Always pair `safe-area-inset-*` usage with a `viewport` export in `app/layout.tsx` that sets `viewportFit: "cover"`. Use the typed `Viewport` from `next` (separate export from `metadata`).
**Risk if ignored:** Notch/home-indicator devices clip content under system UI; padding looks correct in DevTools but fails on real iOS.

### `position: sticky` reserves its own layout space — extra clearance padding is usually a mistake
**What happened (B011):** The first attempt at AC #9 ("last lot row not obscured by mobile sticky CTA") added `pb-32 md:pb-8` to the outer container of `app/product/[id]/page.tsx`. The B011 reviews flagged this as wrong on two counts: (a) the outer padding sat outside the `overflow-hidden` white card that contains the sticky CTA, so it added empty space *after* the card rather than clearance *above* the CTA; and (b) it was unnecessary in the first place. A second attempt added an `<div className="md:hidden h-40" />` spacer inside the card directly above the CTA — also unnecessary.
**Why no padding is needed:** `position: sticky` is a normal-flow layout position, not absolute. The element reserves its own block-level space in the document. At max scroll, the sticky element sits at its natural position (the last child of the card) and the content above it is fully visible. Mid-scroll, the CTA pins to the viewport bottom and visually overlaps content as the user scrolls past — this is the expected sticky CTA UX, not a bug.
**Pattern:** For a sticky CTA at the end of a content card, no extra padding/spacers are needed for the "max-scroll content visibility" requirement. Only add padding to the sticky element itself for safe-area insets (`pb-[calc(1rem+env(safe-area-inset-bottom))]` plus `viewportFit: "cover"`).
**When extra clearance IS needed:** Only if the design requires *mid-scroll* breathing room above the floating CTA — and even then, that's a UX preference, not a layout fix. Put any such padding **inside** the same scroll container as the sticky element (not on an outer wrapper that's outside the `overflow-hidden` parent).

### `useState` initializers do NOT re-run on prop changes
**What happened:** B011 pre-fills `EnquiryForm` fields from URL params via `useState({ name: initialName || "", ... })`. This runs only on mount. If a user navigates from `/contact?name=A` to `/contact?name=B` via Next.js client-side routing (without remounting), the form would still show "A".
**Pattern:** For props that should sync on change *and* respect user edits, use a `useEffect` that only updates state when the field is empty or matches the previous initial value. For props that only need to apply once at mount (the typical "pre-fill from URL" case), `useState` initializers are correct — but document the constraint so future maintainers don't expect reactivity.
**Risk if ignored:** Stale form state when URL params change without remounting; or, conversely, user edits silently overwritten by props.

### Nav links are duplicated across 7 layout files
The `AdminHeader` component is shared, but each of the 7 admin layout files defines its own `navLinks` array independently. When adding a cross-cutting nav feature (badge, new link, rename), all 7 must be updated:
- `app/qa/(protected)/layout.tsx`
- `app/admin/requests/layout.tsx`
- `app/admin/tools/layout.tsx`
- `app/review/layout.tsx`
- `app/admin/email/layout.tsx`
- `app/admin/discount/layout.tsx`
- `app/admin/agent/layout.tsx`
**Risk if ignored:** Inconsistent UX — feature appears on some pages but not others (B002 initially missed 5 of 7 layouts).

---

## Data Privacy

### Audit function output for customer names when repurposing across contexts
**What happened:** `formatReviewSummary()` in `lib/excel-import.ts` includes customer names in a markdown table because it was designed for CLI output (Paul's terminal). When B009 reused its output as the `reviewSummary` field in the `import_inventory_file` agent tool result, customer names flow through Claude → agent chat — violating the "no customer names in output" rule.
**Pattern:** Before reusing a function in a new context (CLI → agent tool, server → client, internal → external), audit its output for data that's acceptable in the original context but not the new one. `formatReviewSummary()` needs a sanitized variant for the agent path.
**Risk if ignored:** Customer names visible in agent chat conversations (which are persisted to SQLite).

---

## Deployment (Railway)

### Volume path is not available during `next build`
`RAILWAY_VOLUME_PATH` resolves to the mounted volume at runtime, not at build time. Any code that reads from the volume must be in server-side route handlers or server components — not in `next.config.ts` or other build-time paths.

### Backfill and rename scripts must run via the API endpoints in production
`npm run backfill-coa` and `npm run rename-uploads` are CLI scripts for local use. In production, the Railway service has the volume mounted, so use the API endpoints:
- `POST /api/backfill-coa` (via `/admin/tools`)
- `POST /api/rename-uploads` (via `/admin/tools`)
Running the CLI scripts on a local machine in production mode will not touch the Railway volume.

### `upsertCoaData` re-extraction must not downgrade review status
When a COA is re-extracted (via backfill or re-upload), the new data should replace the old fields but NOT reset an existing `approved` review status to `pending`. The fix is SQL-level: `CASE WHEN excluded.review_status = 'pending' THEN coa_data.review_status ELSE excluded.review_status END`. This preserves the prior approval while still updating the extracted data. Any column that represents a human decision (review status, approval flags) should be preserved on data refresh unless the new value represents an equal or higher authority.

### ALTER TABLE default vs CREATE TABLE default can differ intentionally
The `coa_data` migration uses `DEFAULT 'approved'` to grandfather existing rows, while the `CREATE TABLE` DDL uses `DEFAULT 'pending'` for new databases. SQLite applies the ALTER default to existing rows on add. This intentional mismatch serves two purposes: existing data stays visible (approved) and new extractions start gated (pending). Use the migration default to express the grandfather policy, and the DDL default to express the ongoing policy.
