# COA Key Aspects

Extracted COA parameters (brix, acidity, color, clarity, ratio, defects, overripe, underripe, NTU, etc.) are displayed publicly on the product detail page next to each lot.

## Data Model

- **`coa_data`** table: `lot_id` (PK, FK → lots), `data` (JSON), `updated_at`, `updated_by`, `review_status`, `reviewed_at`, `reviewed_by`.
- `data` is a flexible JSON object — any key-value pair can be stored (e.g., `{"brix": 11.5, "color": "Light Amber"}`).
- Values are **single figures** (number or short string), never ranges.
- The field set is not fixed — unknown keys are title-cased automatically for display.

### Review Status

- **`review_status`**: `'pending'` | `'approved'` | `'rejected'`
  - `'pending'` — auto-extracted or backfilled via AI; awaiting human verification.
  - `'approved'` — QA user verified the extraction is correct; values shown publicly.
  - `'rejected'` — QA user flagged the extraction as incorrect; values NOT shown publicly. QA can re-extract or manually correct via `save_coa_data`.
- **`reviewed_at`**: ISO timestamp of the review action (null when pending).
- **`reviewed_by`**: Email or identifier of the reviewer (null when pending).
- Auto-extract and backfill create data with `review_status = 'pending'`.
- Manual entry via `save_coa_data` (agent tool) creates data with `review_status = 'approved'` (deliberate human verification bypasses the queue).
- Re-extracting a lot that was already approved does NOT downgrade to pending — the data is updated but the approved status is preserved.

## Automatic Extraction

When a COA document is uploaded via `/api/upload` (QA portal) or via the agent's `upload_document`/`batch_upload_documents` tools, the file is sent to Claude Haiku vision (`claude-haiku-4-5-20251001`) for automatic parameter extraction. This happens fire-and-forget after the upload response — extraction failure does not block the upload. Works on both text-based PDFs and scanned images.

## Agent Tools

- `save_coa_data` — manually enter, correct, or supplement auto-extracted data. Requires `lotNumber`, `productId`, and `fields` (key-value object). Data saved via this tool is marked `approved` (bypasses review queue).
- `review_coa_data` — approve or reject pending/rejected COA extractions. Requires `productId` and `action` (`'approve'` or `'reject'`). Optionally accepts `lotNumbers` to filter; omit to review all pending lots for the product. Both `qa` and `reviewer` roles can call this tool.
- `get_coa_backfill_status` — shows lots with COA documents on disk but no extracted `coa_data` row. Grouped by product with document and lot counts.
- `backfill_coa_data` — reads COA files from disk and re-extracts parameters via Claude Haiku vision. Document-centric: extracts once per unique document file, upserts to all linked lots. Accepts optional `lotNumbers` filter; processes up to 50 documents per call. `updatedBy` is set to `"backfill"`. Data created by backfill starts as `pending` (requires review).

## Public Display Rules

Product detail page (`app/product/[id]/page.tsx`) shows compact navy-tinted pills below each lot's quantity/weight/BBD row. **COA pills and COA-derived test badges are only shown when `review_status = 'approved'`**. Document-based test badges (from uploaded test-result files) are always shown regardless of review status.

- **Maximum 6 pills** per lot.
- **Priority order:** Known fields first (brix, acidity variants, pH, ratio, color, clarity, NTU, defects variants, overripe/underripe, stem/cap/size defects, EVM), then unknown fields alphabetically.
- **EVM merge:** The two EVM sub-fields (`evm_leaves_caps_bracts`, `evm_weeds_grass`) are combined into a single "EVM" pill showing the minimum value.
- **Excluded from display:** Microorganism analysis (APC, coliform, E. coli, escherichia, yeast, mold, salmonella, listeria, staphylococcus, alicyclobacillus, total plate count), heavy metals (lead/Pb, arsenic/As, cadmium/Cd, mercury/Hg, tin/Sn), mycotoxins (patulin, aflatoxin, ochratoxin), weight/packaging, temperature, and administrative fields (FDA no, batch no/code, QC name, dates, shelf life, metal detection).
- **String values capped** at 50 characters for display.
- **Field name normalization:** Spaces, dots, and hyphens in field names are normalized to underscores before exclusion matching.
- **Test type badges:** Lots display "Heavy Metal Test Available" or "Pesticide Test Available" badges when: (a) a test-results document is uploaded with a matching filename, or (b) the COA-extracted data contains heavy metal or pesticide fields (detected via `detectCoaTestTypes()` in `lib/coa-data.ts`). Document-based badges take priority.
- **AI caveat:** Below the pills, a small italic disclaimer reads: *"AI-extracted — may contain errors. Request official documents before contracting."*

## Sync Preservation

COA data is exported (with lot numbers) before the sync transaction, deleted alongside `document_lots`, and re-linked after re-seed by matching lot numbers — same pattern as `relinkDocumentLots()`.

## Key Files

- `lib/coa-data.ts` — Types, query, upsert, export/relink, display formatting, `detectCoaTestTypes()`, `reviewCoaData()`, `getCoaReviewQueue()`
- `lib/coa-extract.ts` — Claude vision extraction function
- `lib/agent-db.ts` — `getCoaBackfillStatus()`, `getCoaBackfillDocuments()` query functions
- `app/api/upload/route.ts` — Auto-extraction hook for QA portal COA uploads (creates data as `pending`)
- `app/api/coa-review/route.ts` — GET (product review queue) / POST (approve/reject). Auth: `qa` or `reviewer`.
- `lib/agent-tools.ts` — `save_coa_data`, `review_coa_data`, `get_coa_backfill_status`, `backfill_coa_data` tool definitions
- `app/product/[id]/page.tsx` — Public display in `LotRow` component (gated behind `reviewStatus === 'approved'`)
- `app/qa/(protected)/QADashboardClient.tsx` — QA dashboard with COA review panel and amber lot pills for pending
- `app/api/backfill-coa/route.ts` — GET status / POST trigger backfill (reviewer auth, runs inside Railway)
- `app/admin/tools/` — Admin tools page with COA backfill and file rename UI
- `scripts/backfill-coa.ts` — Standalone CLI backfill script (for local use)
