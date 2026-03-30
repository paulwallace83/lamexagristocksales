# Roadmap
This roadmap organizes planned work for the Lamex Agri Stock Sales application. It is intentionally concise and should be updated as priorities change.

## Completed
### ✅ Planning Protocol (v0.5.0+)
- Repository workflow formalized in `AGENTS.md` and `docs/workflow.md`.
- Planner/sole-code-writer model documented. Slice-based planning established.

### ✅ Inventory Publishing Workflow (v0.6.0)
- Weekly sync system implemented (`lib/sync.ts`, `scripts/sync-inventory.ts`).
- Repeatable workflow: paste → parse → diff → approve → sync → reconcile.
- Automatic COO and warehouse validation during sync.
- Customer names stripped during pivot table parsing (enforced by Claude).
- Snapshot history for rollback (`data/snapshots/`).
- Reconciliation report verifies totals match raw data before sign-off.

### ✅ Data Quality And Validation (v0.6.0, partial)
- COO validated on every listing during sync — missing COO flagged as blocking warning.
- Warehouse city/state validated during sync — unknown warehouses flagged.
- New suppliers auto-detected, COO inference attempted from listing data.
- New warehouses auto-detected, city/state inferred from listing data.
- Reference files (`suppliers.md`, `warehouses.md`) auto-regenerated after each sync.

### ✅ Lot Segregation & Visibility (v0.8.0)
- QA dashboard shows per-lot COA status pills with lot numbers, contract refs, and supplier names.
- Product detail page restyled with navy accent borders, two-line lot layout, and lot count headers.
- Inventory table shows lot count badges on desktop and mobile.
- Lot data seeded from inventory.json with automatic aggregation of duplicate ERP rows.
- Role-based authorization hardened across QA pages and API endpoints.

### ✅ Inventory UX & QA Dashboard Enhancements (v0.9.0)
- Public inventory grouped by format (IQF, Juice Concentrate, Puree) with collapsible sections.
- Cascading filters — each dropdown narrows to available values given the other active filters.
- QA dashboard filter (All / Missing / Partial / Complete) with counts for quick focus.
- Partial document status (amber badges and lot pills) distinguishes "some docs" from "no docs".
- Prominent Lamex reference numbers on QA upload page.
- Past-BBD dates highlighted with amber label on product detail pages.
- Security hardening: file upload size/type limits, auth on document GET API, strong AUTH_SECRET.

### ✅ Discount & Clearance Inventory (v0.9.1–0.9.2)
- Discount section on public inventory page (amber collapsible group below format groups).
- Lot-level deduction: discount lots removed from regular inventory immediately on creation and re-applied automatically during weekly sync.
- Admin portal (`/admin/discount`) with lot picker for multi-select moves with per-lot overrides.
- Post-sync validation and auto-deduction in sync pipeline.
- Comprehensive user guide (`docs/user-guide.md`) for wiki publishing.
- Security hardening: production auth fix (`trustHost`), calendar date validation, upload path boundary check, orphan file cleanup, session maxAge.

### ✅ AI Assistant — Internal Agent Portal (v0.9.3)
- Claude-powered chat interface at `/admin/agent` for QA and ops staff.
- 13 tools: inventory queries, lot/contract lookup, document upload, discount management, import review, sync info, COA data management.
- File analysis: upload PDFs/images in chat, Claude reads and proposes matches to inventory records.
- Confirmation model: all action tools require explicit user approval before execution.
- Streaming SSE responses with tool activity indicators.
- Auth: QA + reviewer roles only. Zero public exposure.

### ✅ Agent UX & Test-Result Tracking (v0.9.4 — S008)
- Branded as "Top Dog Paul's AI Brain" (TDPAIB) with custom avatar.
- Markdown rendering for agent responses (tables, bold, headers, lists, blockquotes).
- True streaming via `anthropic.messages.stream()` for token-by-token delivery.
- Drag-and-drop file upload support.
- File persistence across conversation turns (per-user temp directory, 30 min TTL).
- Max iterations warning when 10-step tool-use limit is reached.
- Full-viewport chat layout (fixed positioning, no footer bleed).
- Test-result recognition: COA vs test-result distinction based on issuer (supplier vs third-party lab).
- QA dashboard: organic/conventional labels, separate Heavy Metals and Pesticide columns.
- `list_products` includes active discount items alongside regular inventory.
- Fixed SQL join bug that inflated product weight totals (38M → 3.5M lbs).
- Zero-stock products (moved to discount) filtered from product list.
- Security hardening: per-user file isolation, error message sanitization, product existence validation, link URL scheme validation.

### ✅ Marketing Email (v0.9.5 — S007)
- Weekly marketing email composer at `/admin/email` (reviewer role).
- Resend integration for programmatic email sending.
- Auto-detect new arrivals from sync diffs (`product_flags` table, auto-set by sync script).
- Manual "Featured" flag toggle per product (persists across syncs).
- Self-contained HTML email template with inline CSS, table layout, Outlook compatibility.
- Sections: navy header, stats bar, new arrivals (green), featured (blue), category summary, CTA button.
- Live preview in iframe, manual recipient input (comma/newline separated).
- Product flags API for toggling new_arrival/featured badges.
- Security hardening: HTML escaping in email template, atomic flag toggle, recipient dedup, input size limits, error sanitization, productId validation.

### ✅ Security Hardening & UX Polish (v0.9.6)
- CSRF origin validation middleware for all state-changing API routes.
- HTTP security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Country flag emojis on public inventory table and product detail pages (shared `lib/country-flags.ts` utility).
- Transactional document insert (`addDocument`) to prevent orphaned files on partial failures.
- Agent system prompt rule 9: tool errors must be reported to the user immediately.
- Discount API endpoints hardened to require `reviewer` role on all methods.
- Email send error sanitization (whitelist-based safe messages, no internal details leaked).
- Email validation tightened to RFC 5321 simplified pattern.
- Silent catch blocks in `lib/discount.ts` now log errors.

### ✅ Conversation Persistence & API Usage Tracking (v0.9.7 — S010)
- Agent chat sessions saved to SQLite, survive page reloads.
- Conversation list dropdown (up to 20 recent), resume, new chat, per-conversation delete.
- Per-request token usage and cost tracking (`api_usage` table).
- Stats bar above chat: daily/monthly/yearly call count and cost.
- Configurable pricing from `data/api-pricing.json` with `npm run update-pricing`.
- Fuzzy file matching fix for `upload_document` tool (substring + lot-number fallback).
- Security hardening: conversation message validation (role, content size, message count), pricing bounds checks, CSRF middleware fix.

### ✅ QA Dashboard Document Visibility (v0.9.8)
- Expand-to-view documents: click product row chevron (▶) to see all uploaded documents inline.
- Documents lazy-loaded from `GET /api/documents/{productId}` and cached client-side.
- Documents grouped by category (COA, Test Results, Specs, Labels, Photos) with clickable View links.
- Each document shows filename, lot number, BBD (amber highlight if expired), and contract reference.
- BBD dates added to QA lot pills (`BBD: YYYY-MM-DD`), matching public product detail page format.
- Bug fix: document API route was using `lotId` instead of `lotNumber` for URL generation (broken View links).
- Empty state shows "No documents uploaded" with link to upload page.

### ✅ Security Hardening & Documentation Audit (v0.9.9)
- CSP `unsafe-eval` removed from production builds.
- QA layout auth bypass fixed (unauthenticated users now redirected).
- Path traversal trailing-slash fix on documents DELETE endpoint.
- LIKE wildcard injection fix across all agent search queries.
- Plaintext test credentials removed from committed files.
- Full cross-document audit: npm scripts, conversation persistence, site URL, upload paths, stale references corrected.
- Railway deployment support: `lib/paths.ts` volume routing, auto-seed on empty DB, `force-dynamic` pages, API-based file serving.

### Document Request Workflow (v0.10.0 — S013)
- COA, test results, and spec sheets restricted from public download — replaced with availability badges.
- Unified product enquiry form: single "Request Quote" CTA on product pages with optional "Also request documents" toggle.
- Enquiry always notifies sales (`sales@lamexfoods.us`); document requests concurrently notify QA (`coa@lamexfoods.us`).
- Admin review queue (`/admin/requests`) with status filter tabs (All/Pending/Approved/Rejected/Sent).
- Approve action gathers files from disk and emails them to customer as Resend attachments.
- File serving restriction on `/api/files/` — COA/test-results/specs return 404 to unauthenticated users.
- Rate limiting: 5 requests per email per hour.
- `document_requests` SQLite table preserved during weekly sync.
- Nav link added to all admin layouts.

### COA Key Aspects Display (v0.10.1)
- `coa_data` SQLite table stores extracted COA parameters per lot as flexible JSON (any key-value pair).
- Automatic extraction: COA uploads trigger Claude Haiku vision to extract brix, acidity, color, clarity, ratio, defects, overripe, underripe, NTU, and any other measurable parameters.
- Works on both text-based PDFs and scanned images — no separate OCR library needed.
- Fire-and-forget extraction: upload succeeds immediately, extraction runs async.
- Agent tool `save_coa_data` for manual correction or supplementing auto-extracted data.
- Product detail page shows compact navy-tinted pills on each lot row for populated fields.
- Sync preservation: COA data exported/re-linked by lot number across weekly re-seeds.

### Batch Document Upload via Agent (v0.10.2 — S009)
- Two new agent tools: `batch_lot_lookup` (look up multiple lot numbers in one call) and `batch_upload_documents` (upload multiple files in one call).
- Batch workflow: drop 24+ files at once → agent reads all, presents consolidated matching table, single confirmation, batch upload. Completes in 3–4 tool iterations regardless of file count.
- Extracted `executeOneUpload()` helper from existing `upload_document` — shared by both single and batch paths.
- COA auto-extraction bug fix: agent uploads now trigger Claude Haiku vision extraction (previously only fired from QA upload route).
- Per-upload error isolation in batch: one failed file doesn't abort the rest.
- Agent tool count: 13 → 15 (10 read-only, 5 action).

### Bulk COA Data Backfill via Agent (v0.10.3)
- Two new agent tools: `get_coa_backfill_status` (scan for COA documents missing extracted data) and `backfill_coa_data` (re-extract parameters from files on disk via Claude Haiku vision).
- Document-centric extraction: extracts once per unique COA file, upserts to all linked lots. Avoids redundant API calls when one COA covers multiple lots.
- Processes up to 50 documents per call. Optional `lotNumbers` filter to narrow scope.
- Agent workflow: status check → user reviews scope → confirms → bulk extraction → per-document results with summary.
- `/admin/tools` page with web UI for triggering backfill on production (check status → run extraction).
- `/api/backfill-coa` endpoint runs inside Railway container against the real production database.
- AI caveat disclaimer on public COA pills: *"AI-extracted — may contain errors."*
- COA pill exclusion filter hardened: field name normalization (spaces/dots/hyphens → underscores).
- Agent tool count: 15 → 17 (11 read-only, 6 action).

## Active Priorities
### 1. Data Quality (remaining)
- Validate unit types are correctly identified per product during sync.
- Flag potential duplicate products with similar names/specs.

## Near-Term Candidate Slices
- S011: Agent-powered weekly sync assistant (paste pivot data in agent, auto-parse and sync). Removes need for Claude Code session for routine syncs.
- Enquiry tracking dashboard: persist all enquiries to DB (not just doc requests) so sales has visibility into lead volume, response times, and product interest.
- Pending request badge in admin nav: show document request count on the "Requests" nav link across all admin pages so QA spots new requests without navigating there.

## Medium-Term Candidate Slices
- QA Dashboard enhancements: delete documents from expanded panel, upload directly from expanded panel, filter/search by supplier or document status.
- Reporting & analytics dashboard: inventory trends over time (from weekly snapshots), document completion velocity, agent usage patterns and cost trends.
- Customer portal with login: repeat buyers log in to see request history, re-request documents, and get saved pricing. Reduces repeat enquiries.
- Auth-protected email preview route: let sales/QA preview notification emails without sending test submissions.
- COA extraction review queue: flag lots for QA review after auto-extraction so values are verified against the original document before going public.
- Email delivery status tracking: track Resend webhook events (delivered, bounced, opened) on `document_requests` so QA knows if documents were actually received.
- Admin dashboard homepage: single `/admin` landing page showing pending doc requests, missing documents by product, agent usage, last sync date, and quick links.
- Inventory change notifications: let buyers subscribe by commodity/product for automatic email when weekly sync adds matching new stock.

## UX Polish Candidates
- Enquiry form: accept `name`, `company`, `email` as URL params so returning customers from approval emails don't re-type info.
- Enquiry success state: add "Back to Product" and "Browse More Products" links after submission.
- Product page availability badge count: show "3 COAs available" summary instead of individual per-lot badges.
- Admin requests: clickable column headers for date and product name sorting.
- Rate limit feedback: show remaining cooldown time ("Please try again in 23 minutes") instead of generic error.
- Mobile sticky CTA: add bottom padding to page content to prevent overlap with the fixed "Request Quote" footer.
- Related products section on product detail page: show other products with the same commodity to help buyers compare options.
- Product comparison view: select 2-3 products to see specs, COA data, pack sizes side-by-side in a comparison table.
- QA upload progress indicator: show spinner/toast during COA extraction, update page when complete. Currently extraction is invisible to the uploader.
- Dark mode: respect `prefers-color-scheme` for admin portal (QA staff reviewing documents after hours).
- Keyboard shortcuts on inventory page: `/` to focus search, arrow keys to navigate, `Enter` to open detail.

## Potential Improvements
### Operational
- Agent document gap report email: automated email to QA after each sync listing all lots missing COAs/test results, sorted by product. Removes need to manually check the QA dashboard.
- Supplier scorecard: track document completeness rate per supplier over time (from weekly snapshots). Surfaces suppliers that consistently ship without COAs.
- Inventory age alerts: flag products approaching BBD thresholds (90/60/30 days) on admin dashboard and optionally in the marketing email. Helps move aging stock before it becomes discount.

### Sales-Facing
- Product detail page share preview: OpenGraph/Twitter card meta tags on `/product/[id]` so shared links show product name, format, origin, and weight. Zero-effort marketing.
- Saved search / watchlist: let buyers bookmark commodities or formats via localStorage. Highlight new arrivals matching their interests on return visits. No login required.
- PDF inventory export: one-click download of the current filtered inventory as a branded PDF. Buyers frequently forward these to procurement teams.

### Developer / Ops
- Health check endpoint: `GET /api/health` returning DB status, last sync date, pending doc requests count, disk usage. Useful for Railway monitoring and uptime checks.
- Sync dry-run mode: `npm run sync -- --dry-run` that runs the full pipeline but doesn't write to disk or DB. Shows what would change without risk.
- Agent tool usage analytics: track which tools are called most/least frequently. Identifies tools to optimize and capabilities users don't know about.

## Planning Notes
- Prefer slices that produce a visible operational improvement in one pass.
- Avoid bundling unrelated admin, UI, and data work together.
- When business data is missing, create a planner task before an implementation task.
- Weekly sync workflow is now the primary method for inventory updates — raw edits to `inventory.json` should only happen via Claude-assisted sync.
