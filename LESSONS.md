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

## Deployment (Railway)

### Volume path is not available during `next build`
`RAILWAY_VOLUME_PATH` resolves to the mounted volume at runtime, not at build time. Any code that reads from the volume must be in server-side route handlers or server components — not in `next.config.ts` or other build-time paths.

### Backfill and rename scripts must run via the API endpoints in production
`npm run backfill-coa` and `npm run rename-uploads` are CLI scripts for local use. In production, the Railway service has the volume mounted, so use the API endpoints:
- `POST /api/backfill-coa` (via `/admin/tools`)
- `POST /api/rename-uploads` (via `/admin/tools`)
Running the CLI scripts on a local machine in production mode will not touch the Railway volume.
